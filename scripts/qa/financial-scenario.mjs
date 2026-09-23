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

const billA = await bill(cashier, {
  services: [{ id: svc('QA Haircut'), staff_id: barber.id }], customer_name: 'QA Walk-in',
  discount_type: 'amount', discount_value: 500, payment_method: 'cash', amount_paid: 4500,
});
await bill(cashier, {
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
await call(admin, 'POST', `/api/admin/billing/${billD.id}/corrections`, { reason: 'QA void same session' }, { 'idempotency-key': randomUUID() });

// ---- every screen must agree while the session is open
const status1 = (await call(cashier, 'GET', '/api/store')).json.status;
const close1 = (await call(cashier, 'GET', '/api/store/summary')).json;
const execAdmin1 = (await call(admin, 'GET', '/api/admin/executive-summary?period=today')).json;
const execCashier1 = (await call(cashier, 'GET', '/api/cashier/executive-summary?period=today')).json;
const dash1 = (await call(admin, 'GET', '/api/admin/dashboard?period=today')).json.stats;
const execA = execAdmin1.summary || execAdmin1;
const execC = execCashier1.summary || execCashier1;

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
check('S1 Cashier summary hides salary', execC.salary, (value) => value === undefined || value === null);
check('S1 Cashier close preview hides salary', close1.summary.expected.salaryCash, (value) => value === undefined);
check('S1 Cashier cash position hides salary', execC.cashPosition.cashSalary, (value) => value === undefined);

// ---- close with a known shortage
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
const status2b = (await call(cashier, 'GET', '/api/store')).json.status;
const exec2 = (await call(admin, 'GET', '/api/admin/executive-summary?period=today')).json;
const e2 = exec2.summary || exec2;
check('S2 Expected cash — store status', status2b.session.expectedCash, 5600);
check('S2 Expected cash — admin summary (no shortage double-count)', e2.cashPosition.expectedCash, 5600);
check('S2 Business day net sales accumulate', e2.revenue.netSales, 9200);

const closed2 = (await call(cashier, 'POST', '/api/store', { action: 'close', countedCash: 5600 })).json.result;
check('S2 Close status', closed2.status, (value) => value === 'MATCHED');

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
