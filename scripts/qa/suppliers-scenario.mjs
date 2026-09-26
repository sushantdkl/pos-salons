/**
 * Supplier module regression — drives the real app over HTTP (QA database only).
 *
 *   QA_BASE_URL=http://localhost:3013 QA_DATABASE_URL=<..._qa> node scripts/qa/suppliers-scenario.mjs
 *
 * Runs on a freshly seeded QA database (scripts/qa/seed-qa.mjs; QA Serum cost 600, stock 50):
 *   A  supplier with opening balance 2,000; duplicate name rejected; cashier locked out
 *   B  purchase 10 x QA Serum @ 600 with 1,000 cash paid now -> stock 60, owed 7,000, drawer −1,000
 *   C  online payment 2,000 (idempotent); overpay and cash beyond the drawer rejected
 *   D  a supplier payment's expense cannot be edited/deleted from Expenses
 *   E  void payment restores the balance; void purchase takes the stock back out
 *   F  ledger running balance matches the supplier balance
 *   G  credit purchase, oldest-invoice-first allocation, supplier profile timeline
 */
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
const serum = (await db.query("SELECT id FROM salon_products WHERE name = 'QA Serum'")).rows[0].id;
const stock = async () => Number((await db.query('SELECT current_stock FROM salon_products WHERE id = $1', [serum])).rows[0].current_stock);
const admin = await login('qa_admin');
const cashier = await login('qa_cashier');
const expectedCash = async () => (await must(admin, 'GET', '/api/store')).status.session.expectedCash;
const owed = async (id) => (await must(admin, 'GET', `/api/suppliers/${id}`)).closingBalance;

/* ------------------------------------------------------------------ A */
const created = await must(admin, 'POST', '/api/suppliers', { name: 'QA Beauty Traders', phone: '9801111111', openingBalance: 2000 });
const supplier = created.supplier;
check('A supplier created with opening balance', near(supplier.balance, 2000), supplier.balance);
const dupe = await call(admin, 'POST', '/api/suppliers', { name: 'qa beauty traders' });
check('A duplicate supplier name rejected', dupe.status === 409, dupe.status);
const cashierList = await call(cashier, 'GET', '/api/suppliers');
check('A cashier cannot see suppliers', cashierList.status === 403, cashierList.status);
const cashierPurchase = await call(cashier, 'POST', '/api/purchases', { supplierId: supplier.id, items: [{ productId: serum, quantity: 1, unitCost: 1 }] });
check('A cashier cannot record purchases', cashierPurchase.status === 403, cashierPurchase.status);
const anonymous = await call(null, 'GET', '/api/suppliers');
check('A suppliers API requires login', anonymous.status === 401, anonymous.status);

/* ------------------------------------------------------------------ B */
const closedCash = await call(admin, 'POST', '/api/suppliers/payments', { supplierId: supplier.id, amount: 100, method: 'cash' });
check('B cash payment blocked while the store is closed', closedCash.status === 409, closedCash.json.error);
await must(admin, 'POST', '/api/store', { action: 'open', startingCash: 5000 });
check('B drawer starts at 5,000', near(await expectedCash(), 5000), await expectedCash());
const purchaseBody = {
  supplierId: supplier.id, supplierInvoice: 'INV-77', items: [{ productId: serum, quantity: 10, unitCost: 600 }],
  paidNow: { amount: 1000, method: 'cash' },
};
const bought = await must(admin, 'POST', '/api/purchases', purchaseBody, { 'Idempotency-Key': 'qa-purchase-1' });
const purchase = bought.purchase;
check('B purchase total 6,000', near(purchase.total, 6000), purchase.total);
check('B purchase numbered', /\d/.test(purchase.number), purchase.number);
check('B paid-now recorded against the purchase', near(purchase.paidAgainst, 1000), purchase.paidAgainst);
check('B stock 50 -> 60', (await stock()) === 60, await stock());
check('B supplier owed 2,000 + 6,000 − 1,000 = 7,000', near(await owed(supplier.id), 7000), await owed(supplier.id));
check('B drawer reduced by the cash paid (4,000)', near(await expectedCash(), 4000), await expectedCash());
const replay = await must(admin, 'POST', '/api/purchases', purchaseBody, { 'Idempotency-Key': 'qa-purchase-1' });
check('B double submit returns the same purchase', replay.duplicate === true && replay.purchase.id === purchase.id);
check('B double submit did not add stock again', (await stock()) === 60, await stock());
const movement = (await db.query("SELECT COUNT(*)::int AS n FROM inventory_movements WHERE purchase_id = $1", [purchase.id])).rows[0].n;
check('B stock movement linked to the purchase', movement === 1, movement);
const exec = (await must(admin, 'GET', '/api/admin/executive-summary?period=today'));
const execSummary = exec.summary || exec;
check('B cash supplier payment counted as an expense today', near(execSummary.expenses.total, 1000), execSummary.expenses.total);

/* ------------------------------------------------------------------ C */
const online = await must(admin, 'POST', '/api/suppliers/payments', { supplierId: supplier.id, amount: 2000, method: 'online', reference: 'TXN-1' }, { 'Idempotency-Key': 'qa-pay-1' });
check('C online payment recorded', online.payment?.id && near(online.payment.amount, 2000), online.payment);
const onlineAgain = await must(admin, 'POST', '/api/suppliers/payments', { supplierId: supplier.id, amount: 2000, method: 'online' }, { 'Idempotency-Key': 'qa-pay-1' });
check('C payment double submit returns the same payment', onlineAgain.payment.duplicate === true && onlineAgain.payment.id === online.payment.id);
check('C owed 5,000', near(await owed(supplier.id), 5000), await owed(supplier.id));
check('C online payment leaves the drawer alone', near(await expectedCash(), 4000), await expectedCash());
const overpay = await call(admin, 'POST', '/api/suppliers/payments', { supplierId: supplier.id, amount: 5000.5, method: 'online' });
check('C paying more than owed rejected', overpay.status === 400, overpay.json.error);
const tooMuchCash = await call(admin, 'POST', '/api/suppliers/payments', { supplierId: supplier.id, amount: 4500, method: 'cash' });
check('C cash beyond what the drawer can cover rejected', tooMuchCash.status === 400 && tooMuchCash.json.code === 'DRAWER_CASH_SHORT', tooMuchCash.json);
check('C rejected payments changed nothing', near(await owed(supplier.id), 5000) && near(await expectedCash(), 4000));

/* ------------------------------------------------------------------ D */
const linked = (await db.query('SELECT id FROM expenses WHERE supplier_payment_id = $1', [online.payment.id])).rows[0];
check('D payment wrote one linked expense', Boolean(linked));
if (linked) {
  const del = await call(admin, 'DELETE', `/api/admin/expenses?id=${linked.id}&type=expense`);
  check('D deleting a supplier-payment expense from Expenses is blocked', del.status === 409, del.status);
  const edit = await call(admin, 'PUT', '/api/admin/expenses', { id: linked.id, type: 'expense', amount: 1, title: 'x', category: 'Product Purchase', paymentMethod: 'online' });
  check('D editing a supplier-payment expense from Expenses is blocked', edit.status === 409, edit.status);
}

/* ------------------------------------------------------------------ E */
const noReason = await call(admin, 'POST', '/api/suppliers/payments', { action: 'void', paymentId: online.payment.id, reason: '' });
check('E void needs a reason', noReason.status === 400, noReason.status);
await must(admin, 'POST', '/api/suppliers/payments', { action: 'void', paymentId: online.payment.id, reason: 'QA wrong amount' });
check('E void payment restores owed to 7,000', near(await owed(supplier.id), 7000), await owed(supplier.id));
const expenseGone = (await db.query('SELECT deleted_at FROM expenses WHERE supplier_payment_id = $1', [online.payment.id])).rows[0];
check('E voided payment\'s expense removed', Boolean(expenseGone?.deleted_at));
const voidTwice = await call(admin, 'POST', '/api/suppliers/payments', { action: 'void', paymentId: online.payment.id, reason: 'again' });
check('E cannot void a payment twice', voidTwice.status === 409, voidTwice.status);
await must(admin, 'POST', `/api/purchases/${purchase.id}`, { action: 'void', reason: 'QA returned goods' });
check('E void purchase takes stock back to 50', (await stock()) === 50, await stock());
check('E owed after void = opening 2,000 − cash 1,000', near(await owed(supplier.id), 1000), await owed(supplier.id));
const voidAgain = await call(admin, 'POST', `/api/purchases/${purchase.id}`, { action: 'void', reason: 'again' });
check('E cannot void a purchase twice', voidAgain.status === 409, voidAgain.status);

/* ------------------------------------------------------------------ F */
const ledger = await must(admin, 'GET', `/api/suppliers/${supplier.id}`);
const last = ledger.entries.at(-1);
check('F ledger lists purchase and both payments', ledger.entries.length === 3, ledger.entries.map((entry) => `${entry.kind}:${entry.status}`));
check('F running balance ends at the closing balance', near(last.balance, ledger.closingBalance), `${last.balance} vs ${ledger.closingBalance}`);
const list = await must(admin, 'GET', '/api/suppliers');
const row = list.suppliers.find((item) => item.id === supplier.id);
check('F list balance = ledger balance', near(row.balance, ledger.closingBalance), `${row.balance} vs ${ledger.closingBalance}`);
check('F payables total includes this supplier', list.totals.payable >= row.balance - 0.01, list.totals);
const deactivate = await call(admin, 'PATCH', `/api/suppliers/${supplier.id}`, { ...row, isActive: false });
check('F cannot deactivate while money is owed', deactivate.status === 409, deactivate.status);
const openingChange = await call(admin, 'PATCH', `/api/suppliers/${supplier.id}`, { ...row, openingBalance: 99 });
check('F opening balance locked after activity', openingChange.status === 409, openingChange.status);
const periodList = await must(admin, 'GET', '/api/purchases?period=today');
check('F purchases list by period includes the void purchase', periodList.purchases.some((item) => item.id === purchase.id && item.status === 'VOID'));
check('F void purchase not counted in received value', near(periodList.totals.value, 0), periodList.totals);

/* ------------------------------------------------------------------ G  credit purchase + profile */
// State: owed 1,000 = opening 2,000 − the 1,000 cash paid with the (now void) purchase.
const credit = await must(admin, 'POST', '/api/purchases', { supplierId: supplier.id, items: [{ productId: serum, quantity: 5, unitCost: 600 }] });
let profile = await must(admin, 'GET', `/api/suppliers/${supplier.id}`);
const creditRow = profile.purchases.find((item) => item.id === credit.purchase.id);
check('G credit purchase shows as Credit', creditRow?.paymentStatus === 'CREDIT' && creditRow.terms === 'Credit', creditRow);
check('G credit purchase raises owed to 4,000', near(profile.summary.outstanding, 4000), profile.summary);
check('G open invoices = opening remainder + credit purchase', profile.openInvoices.length === 2 && near(profile.openInvoices[0].open, 1000) && near(profile.openInvoices[1].open, 3000), profile.openInvoices);
check('G timeline shows the credit purchase', profile.timeline.some((event) => event.recordId === credit.purchase.id && event.status === 'CREDIT'));
await must(admin, 'POST', '/api/suppliers/payments', { supplierId: supplier.id, amount: 2000, method: 'online' });
profile = await must(admin, 'GET', `/api/suppliers/${supplier.id}`);
const partRow = profile.purchases.find((item) => item.id === credit.purchase.id);
check('G payment settles the oldest invoice first', partRow.paymentStatus === 'PARTIAL' && near(partRow.open, 2000), partRow);
const payEvent = profile.timeline.find((event) => event.kind === 'payment' && event.status !== 'VOID' && event.allocations?.length === 2);
check('G payment lists the invoices it covered', Boolean(payEvent) && payEvent.allocations.map((a) => a.label).includes('Opening balance'), payEvent?.allocations);
check('G profile outstanding = ledger closing balance', near(profile.summary.outstanding, profile.closingBalance) && near(profile.closingBalance, 2000), profile.summary);
check('G items supplied counts live purchases only', profile.items.length === 1 && profile.items[0].quantity === 5, profile.items);

await db.end();
const failed = results.filter((item) => !item.ok);
for (const item of results) console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.label}${item.ok ? '' : `  ${item.detail}`}`);
console.log(`\n${results.length - failed.length}/${results.length} supplier checks passed`);
process.exit(failed.length ? 1 : 0);
