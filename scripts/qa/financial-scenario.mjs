/**
 * Controlled Business Day regression — drives the REAL app over HTTP and asserts that every
 * screen reports the same authoritative money figures.
 *
 *   1. DATABASE_URL=<..._qa> node scripts/qa/seed-qa.mjs
 *   2. run the app against the QA database (e.g. on port 3013)
 *   3. QA_BASE_URL=http://localhost:3013 node scripts/qa/financial-scenario.mjs
 *
 * Scenario (Phase 10 of docs/ERP_UPGRADE_PLAN.md, plus a same-session void):
 *   Session 1: float Rs 2,000
 *     A  QA Haircut 5,000 cash, Rs 500 discount  -> 4,500 cash
 *     B  QA Colour  3,000 online (eSewa)          -> 3,000 online
 *     C  QA Serum   1,000 cash                    -> 1,000 cash
 *     D  QA Trim      700 cash, then VOIDED       -> +700 cash, -700 refund
 *     cash expense 500 · cash savings 1,000 · cash salary advance 1,000
 *   Expected drawer = 2,000 + 4,500 + 1,000 + 700 - 700 - 500 - 1,000 - 1,000 = 5,000
 *   Close with counted 4,900 -> SHORT -100 (persisted snapshot)
 *   Session 2 (same Business Day): float 4,900, E QA Trim 700 cash -> expected 5,600
 *   Close with counted 5,600 -> MATCHED
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
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  if (!response.ok && !headers['x-expect-error']) {
    throw new Error(`${method} ${path} -> ${response.status}: ${json.error || json.raw || text.slice(0, 200)}`);
  }
  return { status: response.status, json };
}

async function login(username) {
  const { json } = await call(null, 'POST', '/api/auth/login', { username, password: PASSWORD, deviceId: `qa-${username}` });
  if (!json.token) throw new Error(`Login failed for ${username}`);
  return json.token;
}

const admin = await login('qa_admin');
const cashier = await login('qa_cashier');

// Reference ids from the seeded fixtures.
const { json: servicesJson } = await call(admin, 'GET', '/api/admin/services');
const services = servicesJson.services || servicesJson.data || servicesJson;
const svc = (name) => {
  const row = (Array.isArray(services) ? services : []).find((service) => service.name === name);
  if (!row) throw new Error(`Seeded service missing: ${name}`);
  return row.id;
};
const { json: productsJson } = await call(admin, 'GET', '/api/admin/salon-products');
const products = productsJson.products || productsJson.data || productsJson;
const serum = (Array.isArray(products) ? products : []).find((product) => product.name === 'QA Serum');
if (!serum) throw new Error('Seeded product missing: QA Serum');
const { json: usersJson } = await call(null, 'GET', '/api/users/active');
const barber = (usersJson.users || usersJson).find((user) => user.username === 'qa_barber');
if (!barber) throw new Error('Seeded barber missing');

const bill = (token, body) => call(token, 'POST', '/api/admin/billing', body, { 'idempotency-key': randomUUID() })
  .then(({ json }) => json.bill);

/* ---------------------------------------------------------------- session 1 */
await call(admin, 'POST', '/api/store', { action: 'open', startingCash: 2000 });

// Front desk: T1 is billed (bill A), T2 cancelled, T3 no-show, T4 left waiting.
const token = async (name) => (await call(cashier, 'POST', '/api/admin/tokens', {
  customer_name: name, service_id: svc('QA Haircut'), assigned_staff_id: barber.id,
})).json.token;
const t1 = await token('QA Token One');
const t2 = await token('QA Token Two');
const t3 = await token('QA Token Three');
const t4 = await token('QA Token Four');
await call(cashier, 'PATCH', '/api/admin/tokens', { id: t2.id, action: 'cancel' });
await call(cashier, 'PATCH', '/api/admin/tokens', { id: t3.id, action: 'no_show' });

const billA = await bill(cashier, {
  token_id: t1.id,
  services: [{ id: svc('QA Haircut'), staff_id: barber.id }], customer_name: 'QA Walk-in',
  discount_type: 'amount', discount_value: 500, payment_method: 'cash', amount_paid: 4500,
});
const billB = await bill(cashier, {
  services: [{ id: svc('QA Colour'), staff_id: barber.id }], customer_name: 'QA Walk-in',
  payment_method: 'online', qr_type: 'ESEWA_PHONEPAY',
});
await bill(cashier, { products: [{ id: serum.id, quantity: 1 }], customer_name: 'QA Walk-in', payment_method: 'cash', amount_paid: 1000 });
const billD = await bill(cashier, {
  services: [{ id: svc('QA Trim'), staff_id: barber.id }], customer_name: 'QA Walk-in', payment_method: 'cash', amount_paid: 700,
});
check('Bill A total after discount', billA?.grand_total, 4500);

await call(cashier, 'POST', '/api/cashier/daily-expenses', { title: 'QA cleaning', category: 'CLEANING', paymentMethod: 'CASH', amount: 500 });
await call(cashier, 'POST', '/api/savings', { depositType: 'BANK_DEPOSIT', sourceAccount: 'CASH', amount: 1000, institutionName: 'QA Bank' });
await call(cashier, 'POST', '/api/payroll/advances', { staffId: barber.id, amount: 1000, paymentMethod: 'cash' }, { 'idempotency-key': randomUUID() });
// ---- payment method change (rush-hour slip): B was eSewa, cashier fixes it to cash, then back.
const changeMethod = (token, id, body, extra = {}) => call(token, 'POST', `/api/admin/billing/${id}/payment-method`, body, { 'idempotency-key': randomUUID(), ...extra });
const drawer = async () => (await call(cashier, 'GET', '/api/store')).json.status.session.expectedCash;
const drawerBefore = await drawer();
const shortReason = await changeMethod(cashier, billB.id, { reason: 'no', allocations: [{ method: 'cash', amount: 3000 }] }, { 'x-expect-error': '1' });
check('Payment change needs a reason', shortReason.status, 400);
const wrongTotal = await changeMethod(cashier, billB.id, { reason: 'Customer paid cash', allocations: [{ method: 'cash', amount: 2000 }] }, { 'x-expect-error': '1' });
check('Payment change must equal the collected amount', wrongTotal.status, 400);
const sameMethod = await changeMethod(cashier, billB.id, { reason: 'Customer paid eSewa', allocations: [{ method: 'online', amount: 3000, provider: 'ESEWA_PHONEPAY' }] }, { 'x-expect-error': '1' });
check('Payment change to the same method is rejected', sameMethod.status, 400);
const barberToken = await login('qa_barber');
const barberChange = await changeMethod(barberToken, billB.id, { reason: 'Customer paid cash', allocations: [{ method: 'cash', amount: 3000 }] }, { 'x-expect-error': '1' });
check('Service staff cannot change payment methods', barberChange.status, 403);
const barberVoid = await call(barberToken, 'POST', `/api/admin/billing/${billB.id}/corrections`, { reason: 'QA barber void' }, { 'idempotency-key': randomUUID(), 'x-expect-error': '1' });
check('Service staff cannot cancel bills', barberVoid.status, 403);
const toCash = await changeMethod(cashier, billB.id, { reason: 'Wrong method selected in rush', allocations: [{ method: 'cash', amount: 3000 }] });
check('Cashier changed B to cash', toCash.status, 201);
check('Drawer expects the moved cash', await drawer(), drawerBefore + 3000);
const billBCash = (await call(cashier, 'GET', `/api/admin/billing/${billB.id}`)).json;
check('Bill B now paid in cash', billBCash.bill.paymentMethod, (value) => value === 'cash');
check('Bill B allocations are cash', billBCash.payments.map((row) => row.method).join(','), (value) => value === 'cash');
const splitBack = await changeMethod(cashier, billB.id, { reason: 'Customer split the payment', allocations: [{ method: 'cash', amount: 1000 }, { method: 'online', amount: 2000, provider: 'BANK' }] });
check('Cashier changed B to a split', splitBack.status, 201);
check('Drawer after split', await drawer(), drawerBefore + 1000);
await changeMethod(cashier, billB.id, { reason: 'Customer paid by eSewa after all', allocations: [{ method: 'online', amount: 3000, provider: 'ESEWA_PHONEPAY' }] });
check('Drawer back to the original', await drawer(), drawerBefore);
const billBBack = (await call(cashier, 'GET', `/api/admin/billing/${billB.id}`)).json;
check('Bill B back to eSewa', `${billBBack.bill.paymentMethod}:${billBBack.payments[0]?.provider}`, (value) => value === 'online:ESEWA_PHONEPAY');
check('Bill B keeps 3 payment-change records', billBBack.corrections.filter((row) => row.type === 'payment_method_change').length, 3);
check('Payment changes are not voids', billBBack.bill.status, (value) => value === 'paid');

const voidNoReason = await call(admin, 'POST', `/api/admin/billing/${billD.id}/corrections`, { reason: '' }, { 'idempotency-key': randomUUID(), 'x-expect-error': '1' });
check('Cancelling a bill needs a reason', voidNoReason.status, 400);
await call(admin, 'POST', `/api/admin/billing/${billD.id}/corrections`, { reason: 'QA void same session' }, { 'idempotency-key': randomUUID() });
const billDView = (await call(admin, 'GET', `/api/admin/billing/${billD.id}`)).json;
check('Cancelled bill offers no more corrections', billDView.actions.canVoid || billDView.actions.canChangePayment, (value) => value === false);

// ---- every screen must agree while the session is open
const status1 = (await call(cashier, 'GET', '/api/store')).json.status;
const close1 = (await call(cashier, 'GET', '/api/store/summary')).json;
const execAdmin1 = (await call(admin, 'GET', '/api/admin/executive-summary?period=today')).json;
const execCashier1 = (await call(cashier, 'GET', '/api/cashier/executive-summary?period=today')).json;
const dash1 = (await call(admin, 'GET', '/api/admin/dashboard?period=today')).json.stats;
const execA = execAdmin1.summary || execAdmin1;
const execC = execCashier1.summary || execCashier1;

check('Dashboard store state', dash1.store?.state, (value) => value === 'OPEN');
check('Dashboard queue shows the waiting token', dash1.queue?.length, 1);
check('Dashboard expected cash = store', dash1.store?.session?.expectedCash, 5000);
check('Dashboard waiting tokens', dash1.summary.currentWaitingTokens, 1);
check('Tokens generated', execA.tokens.generated, 4);
check('Tokens converted', execA.tokens.converted, 1);
check('Tokens cancelled', execA.tokens.cancelled, 1);
check('Tokens no-show', execA.tokens.noShow, 1);
check('S1 Expected cash — store status', status1.session.expectedCash, 5000);
check('S1 Expected cash — close preview', close1.summary.expected.expectedCash, 5000);
check('S1 Expected cash — admin summary', execA.cashPosition.expectedCash, 5000);
check('S1 Expected cash — cashier summary', execC.cashPosition.expectedCash, 5000);
check('S1 Cash refunds (void D)', close1.summary.expected.cashRefunds, 700);
check('S1 Gross sales before discount', execA.revenue.grossSalesBeforeDiscount, 9700);
check('S1 Discounts', execA.revenue.totalDiscounts, 500);
check('S1 Finalized bill total', execA.revenue.finalizedBillTotal, 9200);
check('S1 Voids processed', execA.revenue.voidedSales, 700);
check('S1 Net sales — admin summary', execA.revenue.netSales, 8500);
check('S1 Net sales — cashier summary', execC.revenue.netSales, 8500);
check('S1 Net sales — dashboard', dash1.summary.totalSales, 8500);
check('S1 Net sales — close preview', close1.summary.sales.netSales, 8500);
check('S1 Cash collected (bills)', execA.payments.grossCashCollected, 6200);
check('S1 Online collected', execA.payments.grossQrCollected, 3000);
check('S1 Operating expenses', execA.expenses.total, 500);
check('S1 Savings', execA.savings.total, 1000);
check('S1 Salary/advance paid (admin)', execA.salary.totalPaid, 1000);
check('S1 Bills sold', execA.revenue.bills, 4);
check('S1 Services sold', execA.revenue.servicesSold, 3);
check('S1 Products sold', execA.revenue.productsSold, 1);
check('S1 Sales trend sums to net sales',
  (dash1.salesSeries || []).reduce((sum, point) => sum + Number(point.netSales || 0), 0), 8500);
const analytics1 = (await call(admin, 'GET', '/api/admin/analytics?period=today')).json.analytics;
check('Analytics net sales = summary', analytics1.kpis.netSales, execA.revenue.netSales);
check('Analytics gross sales = summary', analytics1.kpis.grossSales, execA.revenue.grossSalesBeforeDiscount);
check('Analytics cash = summary', analytics1.payments.cash, execA.payments.grossCashCollected);
check('Analytics online = summary', analytics1.payments.online, execA.payments.grossQrCollected);
check('Analytics expenses = summary', analytics1.kpis.expenses, execA.expenses.total);
check('Analytics payroll = summary', analytics1.kpis.payroll, execA.salary.totalPaid);
check('Analytics bills = summary', analytics1.kpis.bills, execA.revenue.bills);
check('Analytics customers = summary', analytics1.kpis.customersServed, execA.quantities.uniqueCustomers);
check('Analytics services sold', analytics1.services.servicesSold, 3);
check('Analytics top service by revenue', analytics1.services.byRevenue[0]?.name, (value) => value === 'QA Haircut');
check('Analytics voids control', analytics1.controls.voids, 1);
check('Analytics trend sums to net sales', analytics1.salesTrend.reduce((sum, point) => sum + point.netSales, 0), 8500);
check('Analytics staff revenue (barber, 3 services)', analytics1.staff[0]?.servicesCompleted, 3);
// Drill-down: the bills behind a staff / service row add up to that row.
const staffRow = analytics1.staff[0];
const staffBills = (await call(admin, 'GET', `/api/admin/analytics/bills?period=today&kind=staff&id=${staffRow.staffId}`)).json;
check('Drill-down staff bills add up to staff revenue', staffBills.totals.lineValue, staffRow.revenue);
const serviceRow = analytics1.services.byRevenue[0];
const serviceBills = (await call(admin, 'GET', `/api/admin/analytics/bills?period=today&kind=service&id=${serviceRow.id}`)).json;
check('Drill-down service bills add up to service revenue', serviceBills.totals.lineValue, serviceRow.revenue);
// Staff dashboard (barber's own view): counts and names come through, not zero / blank.
const barberView = (await call(barberToken, 'GET', '/api/admin/staff-performance?period=today')).json;
check('Barber dashboard counts services done today', barberView.metrics?.today?.servicesCompleted, (value) => Number(value) >= 2);
check('Barber dashboard lists customer names', barberView.recentServices?.[0]?.customerName, (value) => Boolean(value));
check('Barber dashboard lists service names', barberView.recentServices?.[0]?.serviceName, (value) => Boolean(value));
const cashierDrill = await call(cashier, 'GET', `/api/admin/analytics/bills?period=today&kind=staff&id=${staffRow.staffId}`, null, { 'x-expect-error': '1' });
check('Cashier cannot open analytics drill-down', cashierDrill.status, 403);
const cashierAnalytics = await call(cashier, 'GET', '/api/admin/analytics?period=today', null, { 'x-expect-error': '1' });
check('Cashier cannot read analytics', cashierAnalytics.status, 403);
for (const periodValue of ['yesterday', '3days', '7days', '30days', 'this_week', 'month', 'last_month']) {
  const probe = await call(admin, 'GET', `/api/admin/analytics?period=${periodValue}`, null, { 'x-expect-error': '1' });
  check(`Analytics period ${periodValue} responds`, probe.status, 200);
}
const customRange = await call(admin, 'GET', '/api/admin/analytics?period=custom&startDate=2026-08-01&endDate=2026-09-30', null, { 'x-expect-error': '1' });
check('Analytics custom range responds', customRange.status, 200);
check('S1 Advance salary shown separately', execA.salary.advancePaid, 1000);
check('S1 Regular salary not double-counted', execA.salary.regularSalaryPaid, 0);
check('S1 Net received (cash + online - refunds)', execA.payments.netReceived, 8500);
check('S1 Cash movement statement', execA.cashPosition.netCashMovement, 3000);
check('S1 Cashier cash paid out (combined)', execC.cashPosition.cashPaidOut, 1500);
check('S1 Cashier summary hides P&L', execC.profitLoss, (value) => value === undefined || value === null);
check('S1 Cashier summary hides salary', execC.salary, (value) => value === undefined || value === null);
check('S1 Cashier close preview hides salary', close1.summary.expected.salaryCash, (value) => value === undefined);
check('S1 Cashier cash position hides salary', execC.cashPosition.cashSalary, (value) => value === undefined);

// ---- close with a known shortage
// A waiting token blocks a normal close.
const blocked = await call(cashier, 'POST', '/api/store', { action: 'close', countedCash: 4900 }, { 'x-expect-error': '1' });
check('Waiting token blocks close', blocked.json.code, (value) => value === 'CLOSE_BLOCKED');
await call(cashier, 'PATCH', '/api/admin/tokens', { id: t4.id, action: 'no_show' });

// Notes 4x1000 + 1x500 + 4x100 = 4,900. countedCash is deliberately wrong: the server must
// re-sum the breakdown and ignore the browser's total.
const closed1 = (await call(cashier, 'POST', '/api/store', {
  action: 'close', countedCash: 1, denominations: { 1000: 4, 500: 1, 100: 4, 50: 0, 20: 0, 10: 0, 5: 0, 1: 0 },
})).json.result;
check('S1 Counted derived from notes, not client total', closed1.countedCash, 4900);
check('S1 Note breakdown persisted', closed1.denominations?.['1000'], 4);
check('S1 Close expected persisted', closed1.expectedCash, 5000);
check('S1 Close difference', closed1.difference, -100);
check('S1 Close status', closed1.status, (value) => value === 'SHORT');

const execAfterClose = (await call(admin, 'GET', '/api/admin/executive-summary?period=today')).json;
const eac = execAfterClose.summary || execAfterClose;
check('S1 Summary reads snapshot after close', eac.cashPosition.expectedCashSource, (value) => value === 'snapshot');
check('S1 Summary counted cash', eac.cashPosition.countedCash, 4900);
check('S1 Summary difference', eac.cashPosition.cashDifference, -100);

/* ------------------------------------------------- session 2, same business day */
const statusClosed = (await call(admin, 'GET', '/api/store')).json.status;
check('Store is closed-same-day', statusClosed.state, (value) => value === 'CLOSED_SAME_DAY');
check('Suggested float = counted cash', statusClosed.suggestedStartingCash, 4900);
await call(cashier, 'POST', '/api/store', { action: 'reopen', startingCash: 4900 });
const status2 = (await call(cashier, 'GET', '/api/store')).json.status;
check('S2 same business day', status2.businessDayId, statusClosed.businessDayId);
check('S2 is session 2', status2.session.sessionNumber, 2);

await bill(cashier, { services: [{ id: svc('QA Trim'), staff_id: barber.id }], customer_name: 'QA Walk-in', payment_method: 'cash', amount_paid: 700 });
const lateChange = await changeMethod(cashier, billB.id, { reason: 'Too late to change', allocations: [{ method: 'cash', amount: 3000 }] }, { 'x-expect-error': '1' });
check('Closed-session bill cannot change method', lateChange.status, 409);
const status2b = (await call(cashier, 'GET', '/api/store')).json.status;
const exec2 = (await call(admin, 'GET', '/api/admin/executive-summary?period=today')).json;
const e2 = exec2.summary || exec2;
check('S2 Expected cash — store status', status2b.session.expectedCash, 5600);
check('S2 Expected cash — admin summary (no shortage double-count)', e2.cashPosition.expectedCash, 5600);
check('S2 Business day net sales accumulate', e2.revenue.netSales, 9200);

// Reports must use the same definitions for the same day.
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());
const center = (await call(admin, 'GET', `/api/reports/center?report=sales&start=${today}&end=${today}`)).json.metrics;
check('Reports center revenue after voids', center.revenue_after_voids, 9200);
check('Reports center voids', center.voids, 700);
check('Reports center cash received (allocations)', center.cash_received, 6900);
check('Reports center online received', center.online_received, 3000);
const overview = (await call(admin, 'GET', '/api/admin/reports?period=today')).json;
check('Business overview total sales', (overview.stats || overview.summary || overview).totalSales, 9200);
const expensesReport = (await call(admin, 'GET', `/api/reports/center?report=expenses&start=${today}&end=${today}`)).json.metrics;
check('Expenses report = operating only (no advance)', expensesReport.expenses, 500);
const cashierAdvancesReport = await call(cashier, 'GET', `/api/reports/center?report=advances&start=${today}&end=${today}`, null, { 'x-expect-error': '1' });
check('Cashier cannot read advances report', cashierAdvancesReport.status, 403);

const closed2 = (await call(cashier, 'POST', '/api/store', { action: 'close', countedCash: 5600 })).json.result;
check('S2 Close status', closed2.status, (value) => value === 'MATCHED');
const controls = (await call(admin, 'GET', '/api/admin/analytics?period=today')).json.analytics.controls;
check('Analytics same-day reopen counted', controls.reopenedSessions, 1);
check('Analytics shortage counted', controls.shortages, 1);
check('Analytics shortage total', controls.shortageTotal, -100);

/* ------------------------------------------------ calendar: BS month = Nepali month */
const bs = await import('../../src/lib/dates/calendar.js');
const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());
const bsNow = bs.adToBsParts(todayIso);
const bsMonthStart = bs.bsToAdIso(`${bsNow.year}-${String(bsNow.month).padStart(2, '0')}-01`);
const bsMonthEnd = bs.bsToAdIso(`${bsNow.year}-${String(bsNow.month).padStart(2, '0')}-${String(bs.bsDaysInMonth(bsNow.year, bsNow.month)).padStart(2, '0')}`);
await call(admin, 'PUT', '/api/admin/settings', { calendar_system: 'BS' });
check('Calendar endpoint reports BS', (await call(cashier, 'GET', '/api/settings/calendar')).json.calendarSystem, (value) => value === 'BS');
const bsMonth = (await call(admin, 'GET', '/api/admin/executive-summary?period=month')).json;
const bsSummary = bsMonth.summary || bsMonth;
check('BS: "This month" starts on the 1st of the Nepali month', bsSummary.period?.startDate, (value) => value === bsMonthStart);
const bsCustom = (await call(admin, 'GET', `/api/admin/executive-summary?period=custom&startDate=${bsMonthStart}&endDate=${bsMonthEnd}`)).json;
check('BS: month net sales = the same dates as a custom range', bsSummary.revenue.netSales, (bsCustom.summary || bsCustom).revenue.netSales);
const bsAnalytics = (await call(admin, 'GET', '/api/admin/analytics?period=month')).json.analytics;
check('BS: analytics month = summary month', bsAnalytics.kpis.netSales, bsSummary.revenue.netSales);
await call(admin, 'PUT', '/api/admin/settings', { calendar_system: 'AD' });
const adMonth = (await call(admin, 'GET', '/api/admin/executive-summary?period=month')).json;
check('AD: "This month" starts on the 1st of the English month', (adMonth.summary || adMonth).period?.startDate, (value) => value === `${todayIso.slice(0, 7)}-01`);

/* ------------------------------------------ advances: a blank limit means 100% */
await call(admin, 'PUT', '/api/admin/settings', { advance_ceiling_percent: '' });
const openPolicy = (await call(cashier, 'GET', '/api/payroll/advances')).json.policy;
check('Blank advance limit does not lock cashier advances', openPolicy.configured, (value) => value === true);
await call(admin, 'PUT', '/api/admin/settings', { advance_ceiling_percent: '50' });

/* ------------------------------------------------------------------- history */
const history = (await call(admin, 'GET', '/api/store/history')).json;
const day = (history.days || history.history || history)[0];
check('History starting cash = first float', day.startingCash, 2000);
check('History final expected = last session', day.finalExpectedCash, 5600);
check('History final counted = last session', day.finalCountedCash, 5600);
check('History difference = sum of session differences', day.difference, -100);
check('History net sales after voids', day.netSales, 9200);
check('History session 1 snapshot unchanged', day.sessionDetails?.[0]?.expectedCash, 5000);
check('History session 1 notes kept', day.sessionDetails?.[0]?.denominations?.['500'], 1);

/* --------------------------------------------- invalid close input is rejected */
const badBreakdown = await call(cashier, 'POST', '/api/store', { action: 'close', denominations: { 1000: -1 } }, { 'x-expect-error': '1' });
check('Negative note count rejected', badBreakdown.status, (value) => value >= 400);

/* ----------------------------------------------------- Phase 12: new business day */
// A business day may never be dated in the future, so QA moves the closed day back one
// calendar day (QA database only) to make "Start Next Business Day" legitimate today.
if (process.env.QA_DATABASE_URL) {
  const pg = (await import('pg')).default;
  const qa = new pg.Client({ connectionString: process.env.QA_DATABASE_URL });
  await qa.connect();
  const dbName = new URL(process.env.QA_DATABASE_URL).pathname.slice(1);
  if (!dbName.endsWith('_qa')) throw new Error('QA_DATABASE_URL must point at a *_qa database');
  await qa.query(`UPDATE business_days SET business_date = business_date - 1 WHERE status = 'OPEN'`);
  const stockBefore = (await qa.query(`SELECT current_stock FROM salon_products WHERE name = 'QA Serum'`)).rows[0].current_stock;
  const customersBefore = (await qa.query('SELECT COUNT(*)::int n FROM customers')).rows[0].n;
  const billSeqBefore = (await qa.query(`SELECT next_value FROM document_sequences WHERE document_type = 'salon_bill'`)).rows[0].next_value;

  const beforeNext = (await call(admin, 'GET', '/api/store')).json.status;
  check('Next day is allowed after the date moved', beforeNext.canStartNextDay, (value) => value === true);
  await call(admin, 'POST', '/api/store', { action: 'next-day', startingCash: 5600 });
  const nextStatus = (await call(admin, 'GET', '/api/store')).json.status;
  check('New business day opened', nextStatus.businessDayId, (value) => String(value) !== String(beforeNext.businessDayId));
  check('New day session 1', nextStatus.session.sessionNumber, 1);
  check('New day expected = float', nextStatus.session.expectedCash, 5600);

  const fresh = (await call(admin, 'GET', '/api/admin/executive-summary?period=today')).json.summary;
  check('New day net sales = 0', fresh.revenue.netSales, 0);
  check('New day bills = 0', fresh.revenue.bills, 0);
  check('New day expenses = 0', fresh.expenses.total, 0);
  check('New day savings = 0', fresh.savings.total, 0);
  check('New day services sold = 0', fresh.revenue.servicesSold, 0);
  check('New day products sold = 0', fresh.revenue.productsSold, 0);
  check('New day tokens = 0', fresh.tokens.generated, 0);
  check('New day customers = 0', fresh.quantities.uniqueCustomers, 0);

  check('Stock not reset', (await qa.query(`SELECT current_stock FROM salon_products WHERE name = 'QA Serum'`)).rows[0].current_stock, stockBefore);
  check('Customers not reset', (await qa.query('SELECT COUNT(*)::int n FROM customers')).rows[0].n, customersBefore);
  check('Bill numbering continues', (await qa.query(`SELECT next_value FROM document_sequences WHERE document_type = 'salon_bill'`)).rows[0].next_value, billSeqBefore);
  const previousDay = (await call(admin, 'GET', '/api/store/history')).json.days.find((row) => String(row.id) === String(beforeNext.businessDayId));
  check('Previous day closed with its final snapshot', previousDay?.finalCountedCash, 5600);
  check('Previous day net sales unchanged', previousDay?.netSales, 9200);
  await qa.end();
}

/* -------------------------------------------------------------------- report */
const failed = results.filter((row) => !row.ok);
for (const row of results) {
  console.log(`${row.ok ? 'PASS' : 'FAIL'}  ${row.label}  actual=${JSON.stringify(row.actual)}  expected=${row.expected}`);
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
