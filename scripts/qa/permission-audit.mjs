/**
 * Direct-API permission audit — hidden buttons are not security.
 *
 *   QA_BASE_URL=http://localhost:3013 node scripts/qa/permission-audit.mjs
 *
 * Calls every sensitive endpoint as a logged-out visitor, a barber and a cashier, checks the
 * status code, and deep-scans every response a cashier IS allowed to read for management
 * fields (salary, payroll, commission, profit, base salary, staff performance).
 */

const BASE = process.env.QA_BASE_URL || 'http://localhost:3013';
const PASSWORD = process.env.QA_PASSWORD || 'QaPass!2026';
const results = [];

async function login(username) {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: PASSWORD, deviceId: `audit-${username}` }),
  });
  const json = await response.json();
  if (!json.token) throw new Error(`login failed: ${username}`);
  return json.token;
}

async function get(token, path) {
  const response = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  let json = null;
  try { json = await response.json(); } catch { /* non-JSON */ }
  return { status: response.status, json };
}

/** Management-only key names that must never appear in a cashier payload. */
const FORBIDDEN_KEY = /salary|payroll|commission|profit|baseSalary|base_salary|staffPerformance|grossMargin|operatingResult|periodMaximum|ceilingPercent/i;

function forbiddenKeys(value, path = '$', found = []) {
  if (Array.isArray(value)) value.forEach((item, index) => forbiddenKeys(item, `${path}[${index}]`, found));
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      // Boolean redaction markers such as salaryWithheld: true announce a withheld value, they carry none.
      if (FORBIDDEN_KEY.test(key) && !/Withheld$/.test(key) && child !== null && child !== undefined) found.push(`${path}.${key}`);
      forbiddenKeys(child, `${path}.${key}`, found);
    }
  }
  return found;
}

function record(label, ok, detail = '') {
  results.push({ ok, label, detail });
}

const ADMIN_ONLY = [
  '/api/admin/analytics?period=today',
  '/api/admin/executive-summary?period=today',
  '/api/admin/dashboard?period=today',
  '/api/admin/reports?period=today',
  '/api/admin/expenses',
  '/api/admin/settings',
  '/api/admin/permissions',
  '/api/admin/website-cms',
  '/api/store/history',
  '/api/admin/tokens?mode=analytics',
];

const REPORT_TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());
const CASHIER_ALLOWED = [
  '/api/cashier/executive-summary?period=today',
  '/api/cashier/dashboard?period=today',
  '/api/store',
  '/api/store/summary',
  '/api/payroll/advances',
  `/api/reports/center?report=sales&start=${REPORT_TODAY}&end=${REPORT_TODAY}`,
  '/api/savings',
  '/api/cashier/daily-expenses',
  // Operational staff list for billing: names/roles only, payroll fields withheld server-side.
  '/api/admin/employees',
];

const cashier = await login('qa_cashier');
const barber = await login('qa_barber');

for (const path of [...ADMIN_ONLY, ...CASHIER_ALLOWED]) {
  const anonymous = await get(null, path);
  record(`anonymous ${path}`, anonymous.status === 401 || anonymous.status === 403, `status ${anonymous.status}`);
}

for (const path of ADMIN_ONLY) {
  const response = await get(cashier, path);
  record(`cashier denied ${path}`, response.status === 403, `status ${response.status}`);
  const staff = await get(barber, path);
  record(`barber denied ${path}`, staff.status === 403, `status ${staff.status}`);
}

const advancesReport = await get(cashier, `/api/reports/center?report=advances&start=${REPORT_TODAY}&end=${REPORT_TODAY}`);
record('cashier denied advances report', advancesReport.status === 403, `status ${advancesReport.status}`);

for (const path of CASHIER_ALLOWED) {
  const response = await get(cashier, path);
  // /api/store/summary answers 409 when the store is closed — still "allowed".
  record(`cashier allowed ${path}`, response.status === 200 || (path === '/api/store/summary' && response.status === 409), `status ${response.status}`);
  if (response.status === 200) {
    const leaks = forbiddenKeys(response.json);
    record(`cashier payload clean ${path}`, leaks.length === 0, leaks.slice(0, 6).join(', '));
  }
  const staff = await get(barber, path);
  if (path === '/api/admin/employees') {
    // Service staff share the same redacted operational list.
    record(`barber gets redacted ${path}`, staff.status === 200 && forbiddenKeys(staff.json).length === 0, `status ${staff.status}`);
  } else {
    record(`barber denied ${path}`, staff.status === 403, `status ${staff.status}`);
  }
}

// Staff may read their OWN performance report only; cashiers not at all.
const { json: staffList } = await get(cashier, '/api/admin/employees');
const barberId = (staffList.employees || []).find((row) => row.full_name === 'QA Barber')?.id;
const otherStaff = (staffList.employees || []).find((row) => String(row.id) !== String(barberId))?.id;
const own = await get(barber, `/api/admin/staff-performance?staffId=${barberId}`);
record('barber allowed own performance', own.status === 200, `status ${own.status}`);
if (otherStaff) {
  const other = await get(barber, `/api/admin/staff-performance?staffId=${otherStaff}`);
  record('barber denied another staff performance', other.status === 403, `status ${other.status}`);
}
const cashierPerf = await get(cashier, '/api/admin/staff-performance');
record('cashier denied staff performance', cashierPerf.status === 403, `status ${cashierPerf.status}`);

// Health: public, reports state only, and says every migration is applied.
const health = await get(null, '/api/health');
record('health reports ok with no pending migrations', health.status === 200 && health.json?.status === 'ok' && health.json?.migrations?.pending === 0, JSON.stringify(health.json));
record('health exposes no migration names or credentials', !/\.sql|password|postgres:\/\//i.test(JSON.stringify(health.json)));

// Login brute-force lockout: only this probe username is locked, real users are not.
const probe = `qa_lockout_probe_${Date.now()}`;
let lastStatus = 0;
for (let attempt = 0; attempt < 9; attempt += 1) {
  const response = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: probe, password: 'wrong' }) });
  lastStatus = response.status;
}
record('repeated wrong PINs lock the username', lastStatus === 429, `status ${lastStatus}`);
record('lockout does not affect other users', Boolean(await login('qa_cashier')));

const failed = results.filter((row) => !row.ok);
for (const row of results) console.log(`${row.ok ? 'PASS' : 'FAIL'}  ${row.label}  ${row.detail}`);
console.log(`\n${results.length - failed.length}/${results.length} permission checks passed`);
process.exit(failed.length ? 1 : 0);
