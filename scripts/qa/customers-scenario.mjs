/**
 * Customer profile + Customer Ledger regression — drives the real app over HTTP (QA database only).
 *
 *   QA_BASE_URL=http://localhost:3013 QA_DATABASE_URL=<..._qa> node scripts/qa/customers-scenario.mjs
 *
 * Runs on a freshly seeded QA database (QA Haircut 5,000 · QA Trim 700):
 *   A  bill 1 = QA Haircut, 2,000 cash + 3,000 on credit; bill 2 = QA Trim fully on credit
 *   B  profile: credit due 3,700, two open credit bills, bill statuses, timeline
 *   C  collection of 3,200 settles the oldest bill first (bill 1 paid, bill 2 part paid)
 *   D  a voided credit bill reverses its own credit and shows as Void
 *   E  Customer Ledger overview = profile; access: admin + cashier only
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const BASE = process.env.QA_BASE_URL || 'http://localhost:3013';
const PASSWORD = process.env.QA_PASSWORD || 'QaPass!2026';
const DB_URL = process.env.QA_DATABASE_URL;
if (!DB_URL || !new URL(DB_URL).pathname.endsWith('_qa')) throw new Error('QA_DATABASE_URL must point at a *_qa database');

const results = [];
const check = (label, ok, detail = '') => results.push({ ok: Boolean(ok), label, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.01;

async function call(token, method, path, body, headers = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = {};
  try { json = await response.json(); } catch { /* empty */ }
  return { status: response.status, json };
}
async function must(token, method, path, body, headers) {
  const result = await call(token, method, path, body, headers);
  if (result.status >= 400) throw new Error(`${method} ${path} -> ${result.status}: ${result.json.error}`);
  return result.json;
}
async function login(username) {
  const { json } = await call(null, 'POST', '/api/auth/login', { username, password: PASSWORD });
  if (!json.token) throw new Error(`login failed: ${username}`);
  return json.token;
}

const db = new pg.Client({ connectionString: DB_URL });
await db.connect();
const admin = await login('qa_admin');
const cashier = await login('qa_cashier');
const barberToken = await login('qa_barber');
const services = (await must(admin, 'GET', '/api/admin/services')).services;
const svc = (name) => services.find((service) => service.name === name).id;
const staff = (await must(cashier, 'GET', '/api/admin/employees')).employees;
const barber = staff.find((member) => member.full_name === 'QA Barber');

const name = `QA Credit Customer ${randomUUID().slice(0, 6)}`;
const customer = (await must(admin, 'POST', '/api/admin/customers', { name, credit_limit: 10000 })).customer;
await must(admin, 'POST', '/api/store', { action: 'open', startingCash: 1000 });
const bill = (body) => must(admin, 'POST', '/api/admin/billing', { customer_id: customer.id, customer_name: name, ...body }, { 'idempotency-key': randomUUID() }).then((json) => json.bill);
const profile = () => must(admin, 'GET', `/api/customers/${customer.id}/profile`);

/* ------------------------------------------------------------------ A */
const bill1 = await bill({
  services: [{ id: svc('QA Haircut'), staff_id: barber.id }],
  allocations: [{ method: 'cash', amount: 2000, cashTendered: 2000 }, { method: 'credit', amount: 3000 }],
});
const bill2 = await bill({ services: [{ id: svc('QA Trim'), staff_id: barber.id }], payment_method: 'credit' });
check('A split bill created', near(bill1?.grand_total, 5000), bill1);
check('A full credit bill created', near(bill2?.grand_total, 700), bill2);

/* ------------------------------------------------------------------ B */
let p = await profile();
check('B credit due 3,700', near(p.summary.creditOutstanding, 3700), p.summary);
check('B two open credit bills', p.openInvoices.length === 2 && near(p.openInvoices[0].open, 3000) && near(p.openInvoices[1].open, 700), p.openInvoices);
const b1 = () => p.bills.find((item) => item.id === bill1.id);
const b2 = () => p.bills.find((item) => item.id === bill2.id);
check('B split bill shows Credit with 3,000 owed', b1()?.creditStatus === 'CREDIT' && near(b1().creditOpen, 3000), b1());
check('B visits and spend counted', p.summary.visits === 2 && near(p.summary.totalSpent, 5700), p.summary);
check('B services used lists both services', p.services.length === 2 && p.services.some((row) => row.name === 'QA Haircut'), p.services);
check('B timeline has both credit bills', p.timeline.filter((event) => event.kind === 'bill' && event.status === 'CREDIT').length === 2, p.timeline.map((event) => event.title));
check('B ledger running balance = credit due', near(p.ledger.at(-1).balance, p.summary.creditOutstanding));

/* ------------------------------------------------------------------ C */
const over = await call(cashier, 'POST', '/api/credit/collections', { customer_id: customer.id, amount: 3700.5, payment_method: 'cash', cash_tendered: 4000 }, { 'Idempotency-Key': randomUUID() });
check('C collecting more than due rejected', over.status === 400, over.json.error);
await must(cashier, 'POST', '/api/credit/collections', { customer_id: customer.id, amount: 3200, payment_method: 'cash', cash_tendered: 3200 }, { 'Idempotency-Key': randomUUID() });
p = await profile();
check('C credit due 500', near(p.summary.creditOutstanding, 500), p.summary);
check('C oldest bill settled first (bill 1 paid)', b1().creditStatus === 'PAID' && near(b1().creditOpen, 0), b1());
check('C bill 2 part paid, 500 open', b2().creditStatus === 'PARTIAL' && near(b2().creditOpen, 500), b2());
check('C payment lists the two bills it covered', p.payments[0]?.allocations.length === 2 && near(p.payments[0].allocations[0].amount, 3000), p.payments[0]?.allocations);
check('C payment balance after = 500', near(p.payments[0]?.balanceAfter, 500), p.payments[0]);
check('C timeline shows the collection', p.timeline.some((event) => event.kind === 'payment' && near(event.amount, 3200) && event.allocations?.length === 2));

/* ------------------------------------------------------------------ D */
const bill3 = await bill({ services: [{ id: svc('QA Trim'), staff_id: barber.id }], payment_method: 'credit' });
await must(admin, 'POST', `/api/admin/billing/${bill3.id}/corrections`, { reason: 'QA wrong customer' }, { 'idempotency-key': randomUUID() });
p = await profile();
const b3 = p.bills.find((item) => item.id === bill3.id);
check('D voided credit bill shows Void', b3?.creditStatus === 'VOID', b3);
check('D void reversed its own credit (due back to 500)', near(p.summary.creditOutstanding, 500), p.summary);
check('D bill 2 unaffected by the other bill\'s void', b2().creditStatus === 'PARTIAL' && near(b2().creditOpen, 500), b2());
check('D voided bill not counted as a visit', p.summary.visits === 2, p.summary);
check('D timeline shows the void', p.timeline.some((event) => event.title === `Bill ${bill3.bill_number} voided`));

/* ------------------------------------------------------------------ E */
const ledger = await must(admin, 'GET', `/api/customers/ledger?q=${encodeURIComponent(name)}`);
const row = ledger.customers.find((item) => item.id === customer.id);
check('E ledger overview balance = profile', near(row?.balance, p.summary.creditOutstanding), row);
check('E ledger overview credit given / collected', near(row?.creditGiven, 4400) && near(row?.collected, 3200) && near(row?.reversed, 700), row);
const cashierView = await call(cashier, 'GET', `/api/customers/${customer.id}/profile`);
check('E cashier can open the customer profile', cashierView.status === 200, cashierView.status);
const barberView = await call(barberToken, 'GET', `/api/customers/${customer.id}/profile`);
check('E service staff cannot open the customer profile', barberView.status === 403, barberView.status);
const barberLedger = await call(barberToken, 'GET', '/api/customers/ledger');
check('E service staff cannot open the customer ledger', barberLedger.status === 403, barberLedger.status);
const anonymous = await call(null, 'GET', '/api/customers/ledger');
check('E customer ledger requires login', anonymous.status === 401, anonymous.status);
const missing = await call(admin, 'GET', '/api/customers/99999999/profile');
check('E unknown customer is a 404', missing.status === 404, missing.status);

await db.end();
const failed = results.filter((item) => !item.ok);
for (const item of results) console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.label}${item.ok ? '' : `  ${item.detail}`}`);
console.log(`\n${results.length - failed.length}/${results.length} customer checks passed`);
process.exit(failed.length ? 1 : 0);
