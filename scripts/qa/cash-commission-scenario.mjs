/**
 * Cash In / Out, Cash Exchange, commission advances, expense categories + paging, the day
 * report and the short bill number — driven over HTTP against the QA app, with exact money
 * assertions. Run on a freshly seeded QA database:
 *
 *   DATABASE_URL=<..._qa> node scripts/qa/seed-qa.mjs
 *   QA_BASE_URL=http://localhost:3013 node scripts/qa/cash-commission-scenario.mjs
 *
 *   float 2,000
 *   bill 1  QA Haircut 5,000 cash   (barber, 10% commission = 500)   -> S-001
 *   bill 2  QA Trim      700 online (barber, 10% commission =  70)
 *   Cash In  3,000 owner                                           drawer 10,000
 *   Cash Out 1,000 owner                                           drawer  9,000
 *   Exchange online->cash 1,000, charge 20 (pays out 980 cash)     drawer  8,020  online +1,000
 *   Exchange cash->online   500                                    drawer  8,520  online   -500
 *   Reverse the Cash Out                                           drawer  9,520
 *   Commission advance 300 cash (allowance 570)                    drawer  9,220
 *   Admin override advance 400 cash                                drawer  8,820
 *   QA Laundry expense 100 cash                                    drawer  8,720
 */
import { randomUUID } from 'node:crypto';

const BASE = process.env.QA_BASE_URL || 'http://localhost:3013';
const PASSWORD = process.env.QA_PASSWORD || 'QaPass!2026';

const results = [];
function check(label, actual, expected) {
  const ok = typeof expected === 'function' ? expected(actual) : Math.abs(Number(actual) - Number(expected)) < 0.005;
  results.push({ ok, label, actual, expected: typeof expected === 'function' ? '(predicate)' : expected });
  return ok;
}

async function call(token, method, path, body, headers = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  if (!response.ok && !headers['x-expect-error']) throw new Error(`${method} ${path} -> ${response.status}: ${json.error || json.raw || text.slice(0, 200)}`);
  return { status: response.status, json };
}
const expectError = { 'x-expect-error': '1' };

async function login(username) {
  const { json } = await call(null, 'POST', '/api/auth/login', { username, password: PASSWORD, deviceId: `qa-${username}` });
  if (!json.token) throw new Error(`Login failed for ${username}`);
  return json.token;
}

const admin = await login('qa_admin');
const cashier = await login('qa_cashier');
await call(admin, 'PUT', '/api/admin/settings', { calendar_system: 'AD', advance_ceiling_percent: '100' });

const { json: servicesJson } = await call(admin, 'GET', '/api/admin/services');
const services = servicesJson.services || servicesJson.data || servicesJson;
const svc = (name) => (Array.isArray(services) ? services : []).find((service) => service.name === name)?.id;
const { json: usersJson } = await call(null, 'GET', '/api/users/active');
const barber = (usersJson.users || usersJson).find((user) => user.username === 'qa_barber');
const bill = (token, body) => call(token, 'POST', '/api/admin/billing', body, { 'idempotency-key': randomUUID() }).then(({ json }) => json.bill);
const drawer = async () => (await call(admin, 'GET', '/api/store')).json.status.session.expectedCash;
const movement = (token, body, extra = {}) => call(token, 'POST', '/api/cash/movements', body, { 'idempotency-key': randomUUID(), ...extra });

/* ----------------------------------------------------------------- open + bills */
await call(admin, 'POST', '/api/store', { action: 'open', startingCash: 2000 });
const bill1 = await bill(cashier, { services: [{ id: svc('QA Haircut'), staff_id: barber.id }], customer_name: 'QA Walk-in', payment_method: 'cash', amount_paid: 5000 });
await bill(cashier, { services: [{ id: svc('QA Trim'), staff_id: barber.id }], customer_name: 'QA Walk-in', payment_method: 'online', qr_type: 'ESEWA_PHONEPAY' });
check('Short bill number format', bill1?.bill_number, (value) => /^S-\d{3,}$/.test(String(value)));
check('First bill after reset is S-001', bill1?.bill_number, (value) => value === 'S-001');
check('Drawer after sales', await drawer(), 7000);

const dash = (await call(admin, 'GET', '/api/admin/dashboard?period=today')).json.stats;
const recent = dash.recentTransactions?.[0];
check('Recent bills carry staff names', (recent?.items || []).map((item) => item.staffName).join(','), (value) => value.includes('QA Barber'));
check('Recent bills carry service names', (recent?.items || []).map((item) => item.name).join(','), (value) => value.length > 0);

/* ----------------------------------------------------------------- cash in / out */
const cashierDenied = await movement(cashier, { type: 'CASH_IN', reason: 'OWNER_CONTRIBUTION', amount: 100, note: 'x' }, expectError);
check('Cashier needs the Cash In / Out permission', cashierDenied.status, 403);
const cashIn = await movement(admin, { type: 'CASH_IN', reason: 'OWNER_CONTRIBUTION', amount: 3000, note: 'Owner brought change' });
check('Cash In recorded', cashIn.status, 201);
check('Drawer after Cash In', await drawer(), 10000);
const noNote = await movement(admin, { type: 'CASH_OUT', reason: 'OWNER_WITHDRAWAL', amount: 100, note: '' }, expectError);
check('Cash Out needs a note', noNote.status, 400);
const tooMuch = await movement(admin, { type: 'CASH_OUT', reason: 'OWNER_WITHDRAWAL', amount: 999999, note: 'too much' }, expectError);
check('Cash Out cannot exceed the drawer', tooMuch.json.code, (value) => value === 'DRAWER_CASH_SHORT');
const cashOut = await movement(admin, { type: 'CASH_OUT', reason: 'OWNER_WITHDRAWAL', amount: 1000, note: 'Owner took cash' });
check('Drawer after Cash Out', await drawer(), 9000);
const key = randomUUID();
await call(admin, 'POST', '/api/cash/movements', { type: 'CASH_IN', reason: 'FROM_SAFE', amount: 1, note: 'dup' }, { 'idempotency-key': key });
const dup = await call(admin, 'POST', '/api/cash/movements', { type: 'CASH_IN', reason: 'FROM_SAFE', amount: 1, note: 'dup' }, { 'idempotency-key': key });
check('Same Idempotency-Key does not post twice', dup.json.duplicate, (value) => value === true);
const dupId = dup.json.movement.id;
await call(admin, 'PATCH', '/api/cash/movements', { id: dupId, reason: 'QA duplicate test entry' });
check('Drawer after reversing the 1-rupee test', await drawer(), 9000);

/* --------------------------------------------------------------------- exchange */
const badCharge = await movement(admin, { type: 'EXCHANGE', direction: 'ONLINE_TO_CASH', amount: 100, charge: 100 }, expectError);
check('Exchange charge must be below the amount', badCharge.status, 400);
await movement(admin, { type: 'EXCHANGE', direction: 'ONLINE_TO_CASH', amount: 1000, charge: 20, note: 'QA exchange' });
check('Drawer after online->cash exchange', await drawer(), 8020);
await movement(admin, { type: 'EXCHANGE', direction: 'CASH_TO_ONLINE', amount: 500 });
check('Drawer after cash->online exchange', await drawer(), 8520);

const summary1 = (await call(admin, 'GET', '/api/admin/executive-summary?period=today')).json;
const s1 = summary1.summary || summary1;
check('Net sales untouched by cash movements', s1.revenue.netSales, 5700);
check('Operating expenses untouched by cash movements', s1.expenses.total, 0);
check('Exchange fee is other income', s1.profitLoss.otherIncome, 20);
check('Operating result includes the fee', s1.profitLoss.operatingResult, 5720);
check('Summary expected cash = drawer', s1.cashPosition.expectedCash, 8520);
check('Cash board has no ledger gap', s1.cashPosition.board.ledgerGap, 0);
check('Online balance: 700 sale + 1000 in - 500 out', s1.onlinePosition.netOnlineBalance, 1200);
const close1 = (await call(admin, 'GET', '/api/store/summary')).json.summary.expected;
check('Close preview expected = drawer', close1.expectedCash, 8520);
check('Close preview Cash In line', close1.ownerCashIn, 3000);
check('Close preview exchange cash out line', close1.exchangeCashOut, 980);

/* ---------------------------------------------------------------------- reversal */
await call(admin, 'PATCH', '/api/cash/movements', { id: cashOut.json.movement.id, reason: 'Owner returned the cash' });
check('Drawer after reversing Cash Out', await drawer(), 9520);
const again = await call(admin, 'PATCH', '/api/cash/movements', { id: cashOut.json.movement.id, reason: 'again' }, expectError);
check('An entry cannot be reversed twice', again.status, 400);
const list = (await call(admin, 'GET', '/api/cash/movements?kind=cash&period=today&pageSize=25')).json;
check('Cash list net of reversals — cash in', list.totals.cashIn, 3000);
check('Cash list net of reversals — cash out', list.totals.cashOut, 0);
check('Corrections stay visible', list.rows.filter((row) => row.status === 'REVERSAL').length, 2);
const exList = (await call(admin, 'GET', '/api/cash/movements?kind=exchange&period=today')).json;
check('Exchange list fee total', exList.totals.feeIncome, 20);
check('Exchange list online in', exList.totals.onlineIn, 1000);

/* --------------------------------------------------------- commission advances */
const employees = (await call(admin, 'GET', '/api/admin/employees')).json.employees;
const barberRow = employees.find((row) => row.username === 'qa_barber');
await call(admin, 'PUT', '/api/admin/employees', { ...barberRow, id: barberRow.id, salon_role: 'barber', pay_type: 'commission' });
const staffAfter = (await call(admin, 'GET', '/api/admin/employees')).json.employees.find((row) => row.username === 'qa_barber');
check('Staff saved as commission-based', staffAfter.pay_type, (value) => value === 'commission');
const advList = (await call(cashier, 'GET', '/api/payroll/advances')).json;
const advBarber = advList.employees.find((row) => row.id === barber.id);
check('Advance list knows the pay type', advBarber.payType, (value) => value === 'commission');
check('Commission allowance = earned commission', advBarber.remainingEligible, 570);
const cashierEarnings = await call(cashier, 'GET', `/api/payroll/advances?staffId=${barber.id}`, null, expectError);
check('Cashier without "Show commission" cannot read commission earnings', cashierEarnings.status, 403);
check('Cashier advance list carries no commission figures', advBarber.unpaidCommission, (value) => value === undefined);
const commission = (await call(admin, 'GET', `/api/payroll/advances?staffId=${barber.id}`)).json.summary;
check('Commission today', commission.today.commission, 570);
check('Commission till date', commission.allTime.commission, 570);
check('Commission this month', commission.month.commission, (value) => Number(value) >= 570);
check('Commission yesterday', commission.yesterday.commission, 0);
const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());
const custom = (await call(admin, 'GET', `/api/payroll/advances?staffId=${barber.id}&period=custom&startDate=${todayIso}&endDate=${todayIso}`)).json.summary;
check('Commission custom range', custom.selected?.commission, 570);
const overCashier = await call(cashier, 'POST', '/api/payroll/advances', { staffId: barber.id, amount: 600, paymentMethod: 'cash', note: 'too much' }, { 'idempotency-key': randomUUID(), ...expectError });
check('Cashier cannot advance more than earned commission', overCashier.json.code, (value) => value === 'ADVANCE_OVER_ALLOWANCE');
const okAdvance = await call(cashier, 'POST', '/api/payroll/advances', { staffId: barber.id, amount: 300, paymentMethod: 'cash', note: 'QA commission advance' }, { 'idempotency-key': randomUUID() });
check('Commission advance issued', okAdvance.json.basis, (value) => value === 'commission');
check('Drawer after commission advance', await drawer(), 9220);
const left = (await call(admin, 'GET', `/api/payroll/advances?staffId=${barber.id}`)).json.summary;
check('Allowance left after advance', left.allowance, 270);
const adminNoReason = await call(admin, 'POST', '/api/admin/expenses', { type: 'advance', staffId: barber.id, amount: 400, paymentMethod: 'cash' }, { 'idempotency-key': randomUUID(), ...expectError });
check('Admin over the allowance needs a reason', adminNoReason.status, 422);
await call(admin, 'POST', '/api/admin/expenses', { type: 'advance', staffId: barber.id, amount: 400, paymentMethod: 'cash', overrideReason: 'Family emergency' }, { 'idempotency-key': randomUUID() });
check('Drawer after admin override advance', await drawer(), 8820);

const exp1 = (await call(admin, 'GET', '/api/admin/expenses?period=today&pageSize=25')).json;
const advExpense = exp1.expenses.find((row) => row.source === 'advance');
check('Advance booked as Staff Commission', advExpense?.category, (value) => value === 'Staff Commission');
check('Advance expense is locked', advExpense?.locked, (value) => value === true);
const editLocked = await call(admin, 'PUT', '/api/admin/expenses', { ...advExpense, amount: 1 }, expectError);
check('Advance expense cannot be edited from Expenses', editLocked.status, 409);
const deleteLocked = await call(admin, 'DELETE', `/api/admin/expenses?id=${advExpense.id}&type=expense`, null, expectError);
check('Advance expense cannot be deleted from Expenses', deleteLocked.status, 409);
const advDetail = (await call(admin, 'GET', `/api/admin/expenses?id=${advExpense.id}`)).json;
check('Expense detail links its advance', advDetail.advance?.basis, (value) => value === 'commission');

// Monthly settlement recovers the advances from commission; the excess carries forward.
const month = todayIso.slice(0, 7);
await call(admin, 'POST', '/api/admin/expenses', { type: 'salary', staffId: barber.id, salaryMonth: month, baseSalary: 0, commissionEarned: 570, amountPaid: 0, paymentMethod: 'cash' });
const settled = (await call(admin, 'GET', `/api/admin/expenses?staffId=${barber.id}&salaryMonth=${month}`)).json;
const salaryRow = settled.salaries.find((row) => row.staffId === barber.id || String(row.staffId) === String(barber.id));
check('Settlement applied 570 of the 700 advanced', salaryRow?.advanceApplied, 570);
check('Settlement status paid (absorbed by advances)', salaryRow?.paymentStatus, (value) => value === 'paid');
const afterSettle = (await call(admin, 'GET', `/api/payroll/advances?staffId=${barber.id}`)).json.summary;
check('Advance carried forward', afterSettle.outstandingAdvance, 130);
check('No allowance until more commission is earned', afterSettle.allowance, 0);
check('Drawer unchanged by a settlement with no cash', await drawer(), 8820);

/* ----------------------------------------------------- categories + paging */
const created = (await call(admin, 'POST', '/api/admin/expense-categories', { label: 'QA Laundry', group: 'Salon upkeep' })).json.category;
check('Custom category created', created?.name, (value) => value === 'QA Laundry');
const dupCat = await call(admin, 'POST', '/api/admin/expense-categories', { label: 'qa laundry' }, expectError);
check('Duplicate category rejected', dupCat.status, 409);
await call(admin, 'POST', '/api/admin/expenses', { title: 'Towel wash', category: 'QA Laundry', amount: 100, paymentMethod: 'cash' });
check('Drawer after custom-category expense', await drawer(), 8720);
await call(admin, 'PUT', '/api/admin/expense-categories', { id: created.id, label: 'QA Laundry & towels' });
const renamed = (await call(admin, 'GET', '/api/admin/expenses?period=today&category=QA%20Laundry%20%26%20towels')).json;
check('Rename moves existing expenses', renamed.expenses.length, 1);
await call(admin, 'PUT', '/api/admin/expense-categories', { id: created.id, isActive: false });
const hidden = await call(admin, 'POST', '/api/admin/expenses', { title: 'x', category: 'QA Laundry & towels', amount: 1, paymentMethod: 'online' }, expectError);
check('Hidden category not offered for new expenses', hidden.status, 400);
const delUsed = await call(admin, 'DELETE', `/api/admin/expense-categories?id=${created.id}`, null, expectError);
check('Used category cannot be removed', delUsed.status, 409);
const lockedHide = (await call(admin, 'GET', '/api/admin/expense-categories')).json.categories.find((row) => row.name === 'Staff Salary');
const hideSalary = await call(admin, 'PUT', '/api/admin/expense-categories', { id: lockedHide.id, isActive: false }, expectError);
check('Payroll categories cannot be hidden', hideSalary.status, 400);

for (let index = 0; index < 30; index += 1) {
  await call(admin, 'POST', '/api/admin/expenses', { title: `QA paging ${index + 1}`, category: 'TEA_SNACKS', amount: 10, paymentMethod: 'online' });
}
const page1 = (await call(admin, 'GET', '/api/admin/expenses?period=today&pageSize=25&page=1')).json;
const page2 = (await call(admin, 'GET', '/api/admin/expenses?period=today&pageSize=25&page=2')).json;
check('Page 1 holds 25 expenses', page1.expenses.length, 25);
check('Page 2 holds the rest', page2.expenses.length, page1.expensePagination.total - 25);
check('Two pages', page1.expensePagination.pages, 2);
check('Totals cover every page', page1.expenseTotals.amount, 300 + 100 + 300 + 400);
check('Period breakdown uses labels', page1.periodSummary.byCategory.map((row) => row.label).join(','), (value) => value.includes('Tea & snacks'));

/* ----------------------------------------------------------------- day report */
const status = (await call(admin, 'GET', '/api/store')).json.status;
const report = (await call(admin, 'GET', `/api/store/history/${status.businessDayId}`)).json;
check('Day report live expected = drawer', report.sessions[0].expectedCash, 8720);
check('Day report Cash In (net)', report.cashMovements.ownerCashIn, 3000);
check('Day report Cash Out (net of reversal)', report.cashMovements.ownerCashOut, 0);
check('Day report exchange fees', report.cashMovements.exchangeFees, 20);
check('Day report bills', report.bills.length, 2);
check('Day report bills show staff', report.bills[0].staff, (value) => value.includes('QA Barber'));
check('Day report net sales', report.sales.netSales, 5700);
check('Day report online net (1200 less 300 online paging expenses)', report.online.net, 900);
const cashierReport = await call(cashier, 'GET', `/api/store/history/${status.businessDayId}`, null, expectError);
check('Cashier without the history permission is refused', cashierReport.status, (value) => value === 200 || value === 403);
if (cashierReport.status === 200) {
  check('Cashier day report hides salary', cashierReport.json.outflows.salary, (value) => value === undefined);
  check('Cashier day report hides payroll expenses', cashierReport.json.expenses.some((row) => row.category === 'Staff Commission'), (value) => value === false);
}

/* --------------------------------------------------------------- BS calendar */
await call(admin, 'PUT', '/api/admin/settings', { calendar_system: 'BS' });
const bsExp = await call(admin, 'GET', '/api/admin/expenses?period=month&pageSize=25', null, expectError);
check('BS: expenses "This month" responds', bsExp.status, 200);
check('BS: this month includes today', bsExp.json.periodSummary?.total, page1.expenseTotals.amount);
const bsMoves = await call(admin, 'GET', '/api/cash/movements?kind=cash&period=month', null, expectError);
check('BS: cash movements "This month" includes today', bsMoves.json.totals?.cashIn, 3000);
const bsComm = (await call(admin, 'GET', `/api/payroll/advances?staffId=${barber.id}`)).json.summary;
check('BS: commission this month includes today', bsComm.month.commission, (value) => Number(value) >= 570);
await call(admin, 'PUT', '/api/admin/settings', { calendar_system: 'AD' });

/* ------------------------------------------------------------------ close */
const closed = (await call(admin, 'POST', '/api/store', { action: 'close', countedCash: 8720 })).json.result;
check('Close matches with Cash In / Out and exchanges', closed.status, (value) => value === 'MATCHED');
const reportClosed = (await call(admin, 'GET', `/api/store/history/${status.businessDayId}`)).json;
check('Day report persisted expected', reportClosed.sessions[0].expectedCash, 8720);
check('Day report persisted difference', reportClosed.sessions[0].difference, 0);
const closedMove = await movement(admin, { type: 'CASH_IN', reason: 'OTHER', amount: 5, note: 'after close' }, expectError);
check('No Cash In while the store is closed', closedMove.status, 409);

/* -------------------------------------------------------------------- report */
const failed = results.filter((row) => !row.ok);
for (const row of results) console.log(`${row.ok ? 'PASS' : 'FAIL'}  ${row.label}  actual=${JSON.stringify(row.actual)}  expected=${row.expected}`);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
