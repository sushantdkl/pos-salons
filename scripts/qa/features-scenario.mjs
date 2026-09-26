/**
 * Feature logic regression for the modules the other scenarios do not drive — real app over
 * HTTP, QA database only (run after scripts/qa/seed-qa.mjs):
 *
 *   A  admin expenses: create / validate / edit / delete, summary breakdown, drawer effect
 *   B  payroll: staff list carries base salary, month metrics carry commission, an advance is
 *      deducted from the salary settlement, payroll totals follow
 *   C  products & stock: create, stock in / out, never negative, a sale reduces stock and a void
 *      returns it, low-stock alert
 *   D  services: create, price change reaches billing, inactive cannot be billed, a used service
 *      is archived instead of deleted
 *   E  employees: create with PIN + salary, the PIN logs in, cashier cannot create, deactivation
 *      blocks login
 *   F  savings: cash deposit lowers the drawer, edit and cancel restore it, overdraw refused
 *   G  printer & documents settings: validation, documents mode per role
 *   H  website: CMS + SEO load for admin only, public pages answer
 *
 *   QA_BASE_URL=http://localhost:3013 node scripts/qa/features-scenario.mjs
 */
import { randomUUID } from 'node:crypto';

const BASE = process.env.QA_BASE_URL || 'http://localhost:3013';
const PASSWORD = process.env.QA_PASSWORD || 'QaPass!2026';
const results = [];
const check = (label, actual, expected) => {
  const ok = typeof expected === 'function' ? expected(actual) : Math.abs(Number(actual) - Number(expected)) < 0.005;
  results.push({ ok, label, actual, expected: typeof expected === 'function' ? '(predicate)' : expected });
  return ok;
};

async function call(token, method, path, body, headers = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = {};
  try { json = await response.json(); } catch { /* empty */ }
  if (!response.ok && !headers['x-expect-error']) throw new Error(`${method} ${path} -> ${response.status}: ${json.error || JSON.stringify(json).slice(0, 200)}`);
  return { status: response.status, json };
}
const soft = { 'x-expect-error': '1' };
const login = async (username, password = PASSWORD) => (await call(null, 'POST', '/api/auth/login', { username, password, deviceId: `features-${username}` }, soft)).json;

const admin = (await login('qa_admin')).token;
const cashier = (await login('qa_cashier')).token;
const barberSession = await login('qa_barber');
const barber = barberSession.token;

const status = async () => (await call(admin, 'GET', '/api/store')).json.status;
if ((await status()).state !== 'OPEN') await call(admin, 'POST', '/api/store', { action: 'open', startingCash: 20000 });
const drawer = async () => Number((await status()).session.expectedCash);
const summary = async () => (await call(admin, 'GET', '/api/admin/expenses')).json.summary;
const services = (await call(admin, 'GET', '/api/admin/services')).json.services;
const svc = (name) => services.find((row) => row.name === name);
const staffList = (await call(null, 'GET', '/api/users/active')).json;
const qaBarber = (staffList.users || staffList).find((user) => user.username === 'qa_barber');
const bill = async (token, body) => (await call(token, 'POST', '/api/admin/billing', body, { 'idempotency-key': randomUUID() })).json.bill;

/* ------------------------------------------------------------ A. expenses */
const s0 = await summary();
const d0 = await drawer();
const expense = (await call(admin, 'POST', '/api/admin/expenses', { title: 'QA electricity', category: 'Electricity', amount: 1500, paymentMethod: 'cash', paidTo: 'NEA' })).json;
const s1 = await summary();
check('Expense: month total +1,500', s1.totalExpensesMonth - s0.totalExpensesMonth, 1500);
check('Expense: "other running costs" breakdown +1,500', s1.otherExpensesMonth - s0.otherExpensesMonth, 1500);
check('Expense: today +1,500', s1.totalExpensesToday - s0.totalExpensesToday, 1500);
check('Expense: cash leaves the drawer', d0 - (await drawer()), 1500);
const badMixed = await call(admin, 'POST', '/api/admin/expenses', { title: 'QA mixed', category: 'Other', amount: 1000, paymentMethod: 'mixed', cashAmount: 300, onlineAmount: 300 }, soft);
check('Expense: mixed split must add up', badMixed.status, 400);
const noTitle = await call(admin, 'POST', '/api/admin/expenses', { title: '', category: 'Other', amount: 100, paymentMethod: 'cash' }, soft);
check('Expense: a name is required', noTitle.status, (value) => value === 400);
const tooMuch = await call(admin, 'POST', '/api/admin/expenses', { title: 'QA huge', category: 'Other', amount: 99999999, paymentMethod: 'cash' }, soft);
check('Expense: cannot pay more cash than the drawer holds', tooMuch.status, (value) => value >= 400);
const list = (await call(admin, 'GET', '/api/admin/expenses')).json.expenses;
const saved = list.find((row) => row.id === expense.id);
check('Expense: listed with its details', saved?.paidTo, (value) => value === 'NEA');
await call(admin, 'PUT', '/api/admin/expenses', { ...saved, amount: 1200, cashAmount: 1200 });
check('Expense: edit lowers the month total', (await summary()).totalExpensesMonth - s0.totalExpensesMonth, 1200);
check('Expense: edit gives the cash back to the drawer', d0 - (await drawer()), 1200);
const raised = await call(admin, 'PUT', '/api/admin/expenses', { ...saved, amount: 99999999, cashAmount: 99999999 }, soft);
check('Expense: editing cannot take more cash than the drawer holds', raised.status, (value) => value >= 400);
await call(admin, 'DELETE', `/api/admin/expenses?id=${expense.id}&type=expense`);
check('Expense: delete restores the month total', (await summary()).totalExpensesMonth, s0.totalExpensesMonth);
check('Expense: delete restores the drawer', await drawer(), d0);
const cashierAdmin = await call(cashier, 'POST', '/api/admin/expenses', { title: 'x', category: 'Other', amount: 10, paymentMethod: 'cash' }, soft);
check('Expense: cashier cannot use the admin expense book', cashierAdmin.status, 403);

/* ------------------------------------------------------------- B. payroll */
await bill(cashier, { services: [{ id: svc('QA Haircut').id, staff_id: qaBarber.id }], customer_name: 'QA Payroll', payment_method: 'cash', amount_paid: 5000 });
const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date()).slice(0, 7);
const payroll = (await call(admin, 'GET', `/api/admin/expenses?staffId=${qaBarber.id}&salaryMonth=${month}`)).json;
const barberRow = payroll.staff.find((row) => Number(row.id) === Number(qaBarber.id));
check('Payroll: staff list carries the base salary', barberRow?.baseSalary, (value) => Number(value) > 0);
check('Payroll: month metrics carry the commission earned', barberRow?.monthMetrics?.commissionEarned, (value) => Number(value) > 0);
check('Payroll: month metrics count services', barberRow?.monthMetrics?.servicesCompleted, (value) => Number(value) >= 1);
const advanceKey = randomUUID();
await call(admin, 'POST', '/api/admin/expenses', { type: 'advance', staffId: qaBarber.id, amount: 2000, paymentMethod: 'cash', idempotencyKey: advanceKey }, { 'idempotency-key': advanceKey });
const replay = await call(admin, 'POST', '/api/admin/expenses', { type: 'advance', staffId: qaBarber.id, amount: 2000, paymentMethod: 'cash', idempotencyKey: advanceKey }, { 'idempotency-key': advanceKey });
check('Payroll: the same advance twice is recorded once', replay.json.duplicate, (value) => value === true);
const base = Number(barberRow.baseSalary);
const commission = Number(barberRow.monthMetrics.commissionEarned);
const tooMuchSalary = await call(admin, 'POST', '/api/admin/expenses', { type: 'salary', staffId: qaBarber.id, salaryMonth: month, baseSalary: base, commissionEarned: commission, amountPaid: base + commission, paymentMethod: 'online' }, soft);
check('Payroll: cannot pay more than salary minus advance', tooMuchSalary.status, 400);
const beforeSalary = await summary();
await call(admin, 'POST', '/api/admin/expenses', { type: 'salary', staffId: qaBarber.id, salaryMonth: month, baseSalary: base, commissionEarned: commission, amountPaid: base + commission - 2000, paymentMethod: 'online' });
const salaries = (await call(admin, 'GET', `/api/admin/expenses?staffId=${qaBarber.id}`)).json.salaries;
const settled = salaries.find((row) => row.salaryMonth === month);
check('Payroll: the advance is deducted from the settlement', settled?.advanceApplied, 2000);
check('Payroll: settlement fully paid', settled?.paymentStatus, (value) => value === 'paid');
check('Payroll: services stored on the settlement', settled?.servicesCompleted, (value) => Number(value) >= 1);
const afterSalary = await summary();
check('Payroll: salary + commission expenses = amount paid now',
  (afterSalary.staffSalaryPaidMonth + afterSalary.commissionPaidMonth) - (beforeSalary.staffSalaryPaidMonth + beforeSalary.commissionPaidMonth), base + commission - 2000);

/* ----------------------------------------------------- C. products & stock */
const productName = `QA Gel ${Date.now()}`;
await call(admin, 'POST', '/api/admin/salon-products', { name: productName, category: 'Styling', purchase_price: 200, selling_price: 450, current_stock: 5, low_stock_threshold: 3 });
const product = () => call(admin, 'GET', '/api/admin/salon-products').then(({ json }) => (json.products || json.data || json).find((row) => row.name === productName));
const gel = await product();
check('Stock: product created with its stock', gel?.current_stock, 5);
await call(admin, 'PUT', '/api/admin/salon-products', { id: gel.id, movement_type: 'stock_in', quantity: 10, notes: 'QA restock' });
check('Stock: stock in adds', (await product()).current_stock, 15);
const negative = await call(admin, 'PUT', '/api/admin/salon-products', { id: gel.id, movement_type: 'stock_out', quantity: 99 }, soft);
check('Stock: cannot go negative', negative.status, 400);
const weird = await call(admin, 'PUT', '/api/admin/salon-products', { id: gel.id, movement_type: 'teleport', quantity: 1 }, soft);
check('Stock: unknown movement type refused', weird.status, 400);
const gelBill = await bill(cashier, { products: [{ id: gel.id, quantity: 2 }], customer_name: 'QA Gel buyer', payment_method: 'cash', amount_paid: 900 });
check('Stock: a sale reduces stock', (await product()).current_stock, 13);
await call(admin, 'POST', `/api/admin/billing/${gelBill.id}/corrections`, { reason: 'QA stock void' }, { 'idempotency-key': randomUUID() });
check('Stock: a void returns the stock', (await product()).current_stock, 15);
await call(admin, 'PUT', '/api/admin/salon-products', { id: gel.id, movement_type: 'stock_out', quantity: 13, notes: 'QA damage' });
const dash = (await call(admin, 'GET', '/api/admin/dashboard?period=today')).json;
const lowStockNames = JSON.stringify(dash.stats?.lowStock || dash.lowStock || dash.stats?.alerts || '');
check('Stock: low stock shows on the dashboard', lowStockNames.includes(productName), (value) => value === true);

/* --------------------------------------------------------------- D. services */
const serviceName = `QA Beard Spa ${Date.now()}`;
const created = (await call(admin, 'POST', '/api/admin/services', { name: serviceName, category: svc('QA Trim').category, price: 800, duration_minutes: 30 })).json.service;
check('Service: created', created?.price, 800);
await call(admin, 'PUT', '/api/admin/services', { ...created, price: 950 });
const spaBill = await bill(cashier, { services: [{ id: created.id, staff_id: qaBarber.id }], customer_name: 'QA Spa', payment_method: 'cash', amount_paid: 950 });
check('Service: new price reaches billing', spaBill.grand_total, 950);
const unusedName = `QA Unused ${Date.now()}`;
const unused = (await call(admin, 'POST', '/api/admin/services', { name: unusedName, category: svc('QA Trim').category, price: 100, duration_minutes: 10 })).json.service;
await call(admin, 'PUT', '/api/admin/services', { ...unused, is_active: false });
const inactiveBill = await call(cashier, 'POST', '/api/admin/billing', { services: [{ id: unused.id, staff_id: qaBarber.id }], customer_name: 'QA', payment_method: 'cash', amount_paid: 100 }, { ...soft, 'idempotency-key': randomUUID() });
check('Service: an inactive service cannot be billed', inactiveBill.status, (value) => value >= 400);
const delUsed = await call(admin, 'DELETE', `/api/admin/services?id=${created.id}`, null, soft);
check('Service: deleting a used service answers cleanly', delUsed.status, (value) => value < 500);
const afterDelete = (await call(admin, 'GET', '/api/admin/services')).json.services.find((row) => row.id === created.id);
check('Service: a used service is archived, not erased', afterDelete?.is_active, (value) => value === false || value === 0);
await call(admin, 'DELETE', `/api/admin/services?id=${unused.id}`);
check('Service: an unused service is deleted', (await call(admin, 'GET', '/api/admin/services')).json.services.some((row) => row.id === unused.id), (value) => value === false);

/* ------------------------------------------------------------- E. employees */
const username = `qa_new_${Date.now() % 100000}`;
const createdStaff = await call(admin, 'POST', '/api/admin/employees', { username, full_name: 'QA New Stylist', salon_role: 'stylist', password: '4321', base_salary: 18000, commission_percentage: 10 });
check('Employee: created', createdStaff.status, 201);
const newLogin = await login(username, '4321');
check('Employee: the PIN logs in', Boolean(newLogin.token), (value) => value === true);
check('Employee: role is stylist', newLogin.user?.role, (value) => value === 'stylist');
const cashierCreate = await call(cashier, 'POST', '/api/admin/employees', { username: `${username}x`, full_name: 'X', salon_role: 'barber', password: '1234' }, soft);
check('Employee: cashier cannot create staff', cashierCreate.status, 403);
const badPin = await call(admin, 'POST', '/api/admin/employees', { username: `${username}y`, full_name: 'Y', salon_role: 'barber', password: '12' }, soft);
check('Employee: short PIN refused', badPin.status, 400);
const employees = (await call(admin, 'GET', '/api/admin/employees')).json.employees;
const newRow = employees.find((row) => row.username === username);
check('Employee: salary stored', newRow?.base_salary, 18000);
await call(admin, 'PUT', '/api/admin/employees', { ...newRow, id: newRow.id, is_active: false });
const blocked = await login(username, '4321');
check('Employee: deactivated staff cannot log in', Boolean(blocked.token), (value) => value === false);
check('Employee: barber cannot see salaries', JSON.stringify((await call(barber, 'GET', '/api/admin/employees')).json).includes('base_salary'), (value) => value === false);

/* ---------------------------------------------------------------- F. savings */
const dS = await drawer();
const deposit = (await call(cashier, 'POST', '/api/savings', { depositType: 'BANK_DEPOSIT', sourceAccount: 'CASH', amount: 500, institutionName: 'QA Bank' })).json;
const depositId = deposit.deposit?.id || deposit.id;
check('Savings: cash deposit lowers the drawer', dS - (await drawer()), 500);
await call(admin, 'PUT', '/api/savings', { id: depositId, depositType: 'BANK_DEPOSIT', sourceAccount: 'CASH', amount: 300, institutionName: 'QA Bank' });
check('Savings: edit adjusts the drawer', dS - (await drawer()), 300);
await call(admin, 'DELETE', `/api/savings?id=${depositId}&reason=QA`);
check('Savings: cancel gives the cash back', await drawer(), dS);
const overdraw = await call(cashier, 'POST', '/api/savings', { depositType: 'BANK_DEPOSIT', sourceAccount: 'CASH', amount: 99999999, institutionName: 'QA Bank' }, soft);
check('Savings: cannot deposit more cash than the drawer holds', overdraw.status, (value) => value >= 400);

/* --------------------------------------------------- G. printer & documents */
const badPaper = await call(admin, 'PUT', '/api/admin/settings', { statement_paper_size: 'letter' }, soft);
check('Printer: invalid statement page refused', badPaper.status, 400);
const badQr = await call(admin, 'PUT', '/api/admin/settings', { qr_print_size_mm: '999' }, soft);
check('Printer: invalid QR size refused', badQr.status, 400);
await call(admin, 'PUT', '/api/admin/settings', { statement_paper_size: '80', qr_title: 'QA LOOK' });
const docs = (await call(cashier, 'GET', '/api/admin/settings?mode=documents')).json.settings;
check('Printer: cashier reads document layout', docs.statement_paper_size, (value) => value === '80');
check('Printer: QR wording saved', docs.qr_title, (value) => value === 'QA LOOK');
check('Printer: document settings carry no bank details', JSON.stringify(docs).includes('bank_account'), (value) => value === false);
check('Printer: barber cannot read document settings', (await call(barber, 'GET', '/api/admin/settings?mode=documents', null, soft)).status, 403);
const unknownKey = await call(admin, 'PUT', '/api/admin/settings', { salon_open_time: '09:00' }, soft);
check('Settings: keys owned by other screens are refused, nothing half-saved', unknownKey.status, 400);
await call(admin, 'PUT', '/api/admin/settings', { statement_paper_size: 'a4' });

/* ------------------------------------------------------------- I. customers */
const phone = `98${String(Date.now()).slice(-8)}`;
const newCustomer = (await call(cashier, 'POST', '/api/admin/customers', { name: 'Qa Search Person', phone })).json;
const customerId = newCustomer.customer?.id || newCustomer.id;
check('Customer: created by the cashier', Boolean(customerId), (value) => value === true);
const dupe = await call(cashier, 'POST', '/api/admin/customers', { name: 'Someone Else', phone }, soft);
check('Customer: the same phone twice is refused', dupe.status, (value) => value === 400 || value === 409);
const badPhone = await call(cashier, 'POST', '/api/admin/customers', { name: 'Bad Phone', phone: '12' }, soft);
check('Customer: an invalid phone is refused', badPhone.status, 400);
const found = (await call(cashier, 'GET', '/api/admin/customers?search=qa search')).json.customers || [];
check('Customer: search ignores upper / lower case', found.some((row) => String(row.id) === String(customerId)), (value) => value === true);
const clean = await call(admin, 'DELETE', `/api/admin/customers?id=${customerId}`, null, soft);
check('Customer: a customer with no history can be deleted', clean.status, 200);
const loyal = (await call(cashier, 'POST', '/api/admin/customers', { name: 'Qa Loyal', phone: `97${String(Date.now()).slice(-8)}` })).json;
const loyalId = loyal.customer?.id || loyal.id;
await bill(cashier, { services: [{ id: svc('QA Trim').id, staff_id: qaBarber.id }], customer_id: loyalId, customer_name: 'Qa Loyal', payment_method: 'cash', amount_paid: 700 });
const keep = await call(admin, 'DELETE', `/api/admin/customers?id=${loyalId}`, null, soft);
check('Customer: a customer with bills is kept (409 with a reason)', keep.status, 409);
check('Customer: the reason names the bills', keep.json.error, (value) => /bill/.test(String(value)));

/* --------------------------------------------------------------- H. website */
const cms = (await call(admin, 'GET', '/api/admin/website-cms')).json;
const savedCms = await call(admin, 'PUT', '/api/admin/website-cms', cms, soft);
check('Website: saving the CMS unchanged succeeds', savedCms.status, 200);
check('Website: saved hero title is kept', ((await call(admin, 'GET', '/api/admin/website-cms')).json.sections?.hero?.title), (value) => value === cms.sections?.hero?.title);
check('Website: CMS loads for admin', (await call(admin, 'GET', '/api/admin/website-cms', null, soft)).status, 200);
check('Website: CMS closed to cashier', (await call(cashier, 'GET', '/api/admin/website-cms', null, soft)).status, (value) => value === 401 || value === 403);
check('Website: SEO loads for admin', (await call(admin, 'GET', '/api/admin/seo', null, soft)).status, 200);
// Every page the sitemap offers must open (Reviews / Guides are listed only once they have content).
const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]).pathname);
for (const path of [...new Set(['/', '/services', '/book-appointment', '/review', '/contact', '/gallery', '/packages', '/staff', '/robots.txt', ...listed])]) {
  const response = await fetch(`${BASE}${path}`);
  check(`Website: ${path} answers`, response.status, 200);
}

/* ------------------------------------------- J. delegating admin pages to the cashier */
const cashierRows = (await call(admin, 'GET', '/api/admin/permissions')).json.permissions.filter((row) => row.role === 'cashier');
const originalGrants = Object.fromEntries(cashierRows.map((row) => [row.permission_key, row.allowed === true]));
const setCashier = (changes) => call(admin, 'PATCH', '/api/admin/permissions', { role: 'cashier', changes });
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());
const DELEGATED = [
  // [permission, module, method, path, body, status when allowed]
  ['reports.analytics', 'module.reports', 'GET', '/api/admin/analytics?period=today', null, 200],
  ['reports.overview', 'module.reports', 'GET', '/api/admin/reports?period=today', null, 200],
  ['reports.business_days', 'module.reports', 'GET', '/api/store/history', null, 200],
  ['reports.staff', 'module.reports', 'GET', '/api/admin/staff-performance?scope=admin', null, 200],
  ['reports.view', 'module.reports', 'GET', `/api/reports/workspace?report=sales&start=${today}&end=${today}`, null, 200],
  ['reports.advances', 'module.advances', 'GET', `/api/reports/workspace?report=advances&start=${today}&end=${today}`, null, 200],
  ['website.manage', 'module.website', 'GET', '/api/admin/website-cms', null, 200],
  ['website.manage', 'module.website', 'GET', '/api/admin/seo', null, 200],
  ['documents.manage', 'module.website', 'PUT', '/api/admin/settings', { qr_footer: 'QA footer' }, 200],
  ['appointments.settings', 'module.frontdesk', 'DELETE', '/api/appointments/schedule?timeOffId=0', null, 400],
  ['services.manage', 'module.frontdesk', 'POST', '/api/admin/services', { name: 'QA probe' }, 400],
  ['loyalty.view', 'module.crm', 'GET', '/api/crm/loyalty', null, 200],
  ['reviews.view', 'module.crm', 'GET', '/api/crm/reviews', null, 200],
  ['suppliers.manage', 'module.inventory', 'GET', '/api/suppliers', null, 200],
];
for (const [permission, moduleKey, method, path, body, allowedStatus] of DELEGATED) {
  await setCashier([{ permission, allowed: false }]);
  const denied = await call(cashier, method, path, body, soft);
  check(`Delegation: ${permission} off -> cashier refused (${path.split('?')[0]})`, denied.status, 403);
  await setCashier([{ permission: moduleKey, allowed: true }, { permission, allowed: true }]);
  const allowed = await call(cashier, method, path, body, soft);
  check(`Delegation: ${permission} on -> cashier allowed (${path.split('?')[0]})`, allowed.status, allowedStatus);
}
// Printer permission never unlocks tax, bank or salon settings.
const taxChange = await call(cashier, 'PUT', '/api/admin/settings', { vat_percentage: 1 }, soft);
check('Delegation: printer permission cannot change tax', taxChange.status, 403);
// Commission / cost / profit stay hidden in reports unless separately granted.
await setCashier([{ permission: 'reports.sensitive', allowed: false }]);
// The payload names what it withheld (hiddenFields); everything else must be free of it.
const withoutList = ({ hiddenFields, ...rest }) => ({ listed: Array.isArray(hiddenFields), text: JSON.stringify(rest) });
const hiddenReport = withoutList((await call(cashier, 'GET', `/api/reports/workspace?report=services&start=${today}&end=${today}`)).json);
check('Delegation: services report hides commission from the cashier', /commission|profit/.test(hiddenReport.text), (value) => value === false);
check('Delegation: services report says which columns are hidden', hiddenReport.listed, (value) => value === true);
const hiddenCenter = withoutList((await call(cashier, 'GET', `/api/reports/center?report=services&start=${today}&end=${today}`)).json);
check('Delegation: report center hides commission from the cashier', /commission/.test(hiddenCenter.text), (value) => value === false);
const hiddenOverview = (await call(cashier, 'GET', '/api/admin/reports?period=today')).json;
check('Delegation: business overview hides staff commission', JSON.stringify(hiddenOverview.bestStaff || []).includes('commission'), (value) => value === false);
await setCashier([{ permission: 'reports.sensitive', allowed: true }]);
const shownReport = JSON.stringify((await call(cashier, 'GET', `/api/reports/workspace?report=services&start=${today}&end=${today}`)).json);
check('Delegation: granted -> services report shows commission', /commission/.test(shownReport), (value) => value === true);
const adminReport = JSON.stringify((await call(admin, 'GET', `/api/reports/workspace?report=services&start=${today}&end=${today}`)).json);
check('Delegation: admin always sees commission', /commission/.test(adminReport), (value) => value === true);
// Payroll stays policy-locked for the cashier.
const payrollLock = await setCashier([{ permission: 'module.payroll', allowed: true }]).catch((error) => ({ status: Number(String(error.message).match(/-> (\d+)/)?.[1]) }));
check('Delegation: full payroll cannot be given to the cashier', payrollLock.status, 422);
// Live menu: the permissions endpoint the sidebar reads reflects the change at once.
const livePermissions = (await call(cashier, 'GET', '/api/hrm/me?only=permissions')).json.permissions;
check('Delegation: sidebar permissions update live', livePermissions['reports.sensitive'], (value) => value === true);
// Put the cashier back exactly as it was.
const restore = Object.keys(Object.fromEntries(DELEGATED.flatMap(([permission, moduleKey]) => [[permission], [moduleKey]]).concat([['reports.sensitive']])))
  .map((permission) => ({ permission, allowed: Boolean(originalGrants[permission]) }));
await setCashier(restore.filter((row) => row.permission.startsWith('module.') && row.allowed));
await setCashier(restore.filter((row) => !row.permission.startsWith('module.')));
await setCashier(restore.filter((row) => row.permission.startsWith('module.') && !row.allowed));

/* ------------------------------------------------------------------ report */
const failed = results.filter((row) => !row.ok);
for (const row of results) console.log(`${row.ok ? 'PASS' : 'FAIL'}  ${row.label}  actual=${JSON.stringify(row.actual)}  expected=${row.expected}`);
console.log(`\n${results.length - failed.length}/${results.length} feature checks passed`);
process.exit(failed.length ? 1 : 0);
