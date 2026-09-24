/**
 * Report workspace consistency — every table's TOTAL must equal the report's KPIs, the
 * workspace must agree with the older report-center figures, and filters must partition.
 * Read-only: works on the QA database after the financial scenario, or on the local demo.
 *
 *   QA_BASE_URL=http://localhost:3013 node scripts/qa/reports-scenario.mjs
 */
const BASE = process.env.QA_BASE_URL || 'http://localhost:3013';
const PASSWORD = process.env.QA_PASSWORD || 'QaPass!2026';
const START = process.env.QA_REPORT_START || '2020-01-01';
const END = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());

const results = [];
const check = (label, ok, detail = '') => results.push({ ok: Boolean(ok), label, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });
const near = (a, b) => Math.abs(Number(a || 0) - Number(b || 0)) < 0.01;

async function login(username) {
  const response = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: PASSWORD, deviceId: `reports-${username}` }) });
  const json = await response.json();
  if (!json.token) throw new Error(`login failed for ${username}`);
  return json.token;
}
async function get(token, path) {
  const response = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  let json = {};
  try { json = await response.json(); } catch { /* empty */ }
  return { status: response.status, json };
}
const ws = (token, report, extra = {}) => get(token, `/api/reports/workspace?${new URLSearchParams({ report, start: START, end: END, ...extra })}`);
const tableOf = (body, key) => body.tables.find((t) => t.key === key) || { rows: [], totals: {} };

const admin = await login('qa_admin');
const cashier = await login('qa_cashier');

// A. Access.
check('A1 no token -> 401', (await ws(null, 'sales')).status === 401);
check('A2 cashier cannot open salary advances', (await ws(cashier, 'advances')).status === 403);
check('A3 unknown report -> 404', (await ws(admin, 'nope')).status === 404);
check('A4 bad date range -> 400', (await get(admin, `/api/reports/workspace?report=sales&start=${END}&end=2020-01-01`)).status === 400);

// B. Sales: every table adds up to the KPIs, and agrees with the report center.
const sales = (await ws(admin, 'sales')).json;
const m = sales.metrics;
const inv = tableOf(sales, 'invoices');
check('B1 invoices TOTAL = net sales', near(inv.totals.total, m.finalized_total), [inv.totals.total, m.finalized_total]);
check('B2 invoices count = bills', inv.rows.length === m.invoices || inv.truncated, [inv.rows.length, m.invoices]);
check('B3 invoice cash/online/credit = KPIs', near(inv.totals.cash, m.cash_received) && near(inv.totals.online, m.online_received) && near(inv.totals.credit, m.credit_issued));
check('B4 cash + online + credit = net sales', near(m.cash_received + m.online_received + m.credit_issued, m.finalized_total), m);
check('B5 payment-method table = net sales, shares = 100%', near(tableOf(sales, 'methods').totals.amount, m.finalized_total) && Math.abs(tableOf(sales, 'methods').rows.reduce((s, r) => s + Number(r.share), 0) - 100) < 0.5);
check('B6 daily table = net sales and bills', near(tableOf(sales, 'daily').totals.amount, m.finalized_total) && tableOf(sales, 'daily').totals.bills === m.invoices);
check('B7 category table = gross (before bill discount)', near(tableOf(sales, 'categories').totals.amount, tableOf(sales, 'daily').totals.gross));
const center = (await get(admin, `/api/reports/center?report=sales&start=${START}&end=${END}`)).json.metrics;
check('B8 workspace = report center (billed, bills, cash, online, credit)', near(center.finalized_total, m.finalized_total) && center.invoices === m.invoices && near(center.cash_received, m.cash_received) && near(center.online_received, m.online_received) && near(center.credit_issued, m.credit_issued), { center, m });

// C. Filters partition: cash + online + credit + split bills = all bills.
let parts = 0; let partTotal = 0;
for (const method of ['cash', 'online', 'credit', 'split']) {
  const body = (await ws(admin, 'sales', { method })).json;
  parts += body.metrics.invoices;
  partTotal += body.metrics.finalized_total;
}
check('C1 payment-method filter partitions the bills', parts === m.invoices && near(partTotal, m.finalized_total), [parts, m.invoices]);
const business = (await ws(admin, 'sales', { basis: 'business' })).json.metrics;
check('C2 business-day basis never exceeds calendar basis', business.invoices <= m.invoices, [business.invoices, m.invoices]);
const staffId = sales.options.staff[0]?.id;
if (staffId) {
  const one = (await ws(admin, 'services', { staff: String(staffId) })).json;
  check('C3 employee filter: staff table has only that employee', tableOf(one, 'staff').rows.length <= 1);
}

// D. Services / products / payments / credit / expenses.
for (const report of ['services', 'products']) {
  const body = (await ws(admin, report)).json;
  const items = tableOf(body, 'items');
  check(`D ${report}: items TOTAL = revenue`, near(items.totals.revenue ?? 0, body.metrics.revenue));
  check(`D ${report}: staff and category tables = revenue`, near(tableOf(body, 'staff').totals.revenue ?? 0, body.metrics.revenue) && near(tableOf(body, 'categories').totals.amount ?? 0, body.metrics.revenue));
  check(`D ${report}: profit = revenue - cost - commission`, near(body.metrics.gross_profit, body.metrics.revenue - body.metrics.cost - body.metrics.commission));
}
const pay = (await ws(admin, 'payments')).json;
check('D payments: lines TOTAL = settled = net sales', near(tableOf(pay, 'lines').totals.amount, pay.metrics.settled) && near(pay.metrics.settled, m.finalized_total), [pay.metrics.settled, m.finalized_total]);
check('D payments: daily TOTAL = settled', near(tableOf(pay, 'daily').totals.amount, pay.metrics.settled));
const credit = (await ws(admin, 'credit')).json;
check('D credit: entries = KPIs', near(tableOf(credit, 'entries').totals.given ?? 0, credit.metrics.credit_given) && near(tableOf(credit, 'entries').totals.collected ?? 0, credit.metrics.credit_collected));
const exp = (await ws(admin, 'expenses')).json;
check('D expenses: ledger = categories = methods = KPI', near(tableOf(exp, 'ledger').totals.amount ?? 0, exp.metrics.expenses) && near(tableOf(exp, 'categories').totals.amount ?? 0, exp.metrics.expenses) && near(tableOf(exp, 'methods').totals.amount ?? 0, exp.metrics.expenses));
const expCenter = (await get(admin, `/api/reports/center?report=expenses&start=${START}&end=${END}`)).json.metrics;
check('D expenses: workspace = report center', near(expCenter.expenses, exp.metrics.expenses), [expCenter.expenses, exp.metrics.expenses]);
const adv = (await ws(admin, 'advances')).json;
check('D advances: table = KPIs', near(tableOf(adv, 'advances').totals.amount ?? 0, adv.metrics.issued));

// E. metricsOnly returns just the KPIs (used for the previous-period comparison).
const only = (await ws(admin, 'sales', { metricsOnly: '1' })).json;
check('E1 metricsOnly returns the same KPIs without tables', !only.tables && near(only.metrics.finalized_total, m.finalized_total));

// F. Analytics owner dashboard reconciles with itself and with the workspace.
const an = (await get(admin, `/api/admin/analytics?period=custom&startDate=${START}&endDate=${END}`)).json.analytics;
if (an) {
  const r = an.money.revenue;
  const ps = an.paymentSummary;
  check('F1 sales by source = bill total', near(an.sourceTotals.total, r.finalizedTotal) && an.sourceTotals.bills === an.kpis.bills, [an.sourceTotals.total, r.finalizedTotal]);
  check('F2 cash + online + split + credit bills = bill total', near(ps.cash.total + ps.online.total + ps.split.total + ps.credit.total, r.finalizedTotal));
  check('F3 money received − refunds = net collection', near(an.money.totalReceived - an.money.payments.refunds, an.money.payments.netReceived), [an.money.totalReceived, an.money.payments.refunds, an.money.payments.netReceived]);
  check('F4 cash in − cash out = net cash movement', near(an.money.cashFlow.cashIn - an.money.cashFlow.cashOut, an.money.cashPosition.netCashMovement));
  check('F5 analytics bill total = workspace net sales', near(r.finalizedTotal, m.finalized_total), [r.finalizedTotal, m.finalized_total]);
  check('F6 expenses excl. purchases + purchases = expenses', near(an.money.expenses.excludingPurchases + an.money.purchases.total, an.money.expenses.total));
  check('F7 payment records match the bill count', an.paymentRecords.truncated || an.paymentRecords.records.length === an.kpis.bills);
  check('F8 voided list total = voids KPI', near(an.cancellations.totals.voidedAmount, r.voids));
  check('F9 cashier cannot open analytics', (await get(cashier, '/api/admin/analytics?period=today')).status === 403);
} else check('F analytics loads', false);

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.label}${r.ok || !r.detail ? '' : ` — ${r.detail}`}`);
console.log(`\nReports: ${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
