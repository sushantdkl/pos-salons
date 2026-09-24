/**
 * HRM attendance regression — drives the real app over HTTP (QA database only).
 *
 *   QA_BASE_URL=http://localhost:3013 QA_DATABASE_URL=<..._qa> node scripts/qa/hrm-scenario.mjs
 *
 * Runs on a freshly seeded QA database. Past dates are used for timed cases so results do not
 * depend on the clock; live punches are only used for duplicate / break rules.
 *   A  shifts (day 10–19 grace 10 break 60, Sat off; evening 18–02) and roster history
 *   B  normal day · late · cross-midnight · early leave
 *   C  overtime: potential only; payroll uses approved
 *   D  missing punch → corrected with reason → audit trail
 *   E  absent · off day · holiday
 *   F  leave: balance ledger, approve, ON_LEAVE (not ABSENT), unpaid leave, cancel reversal
 *   G  half day
 *   H  live punches: duplicate clock-in, breaks, concurrent clock-in
 *   I  permissions
 *   J  payroll inputs + salary settlement: attendance never moves drawer cash
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const BASE = process.env.QA_BASE_URL || 'http://localhost:3013';
const PASSWORD = process.env.QA_PASSWORD || 'QaPass!2026';
const DB_URL = process.env.QA_DATABASE_URL;
if (!DB_URL || !new URL(DB_URL).pathname.endsWith('_qa')) throw new Error('QA_DATABASE_URL must point at a *_qa database');

const results = [];
const check = (label, ok, detail = '') => results.push({ ok: Boolean(ok), label, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });

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
// HR tables are not in the generic seed: start this scenario from an empty HR state.
await db.query(`TRUNCATE hr_audit_log, hr_overtime, hr_leave_ledger, hr_leave_requests, hr_attendance_breaks, hr_attendance, hr_holidays, hr_shift_assignments, hr_shifts RESTART IDENTITY CASCADE`);
await db.query(`UPDATE hr_leave_types SET annual_allocation_days = 0, carry_forward = FALSE`);
await db.query(`UPDATE hr_policy SET overtime_threshold_minutes = 15, overtime_on_off_days = TRUE, auto_deduct_scheduled_break = TRUE, missing_punch_after_minutes = 240,
  overtime_pay_mode = 'NONE', overtime_multiplier = 1, overtime_fixed_hourly_rate = 0, deduct_absent_days = FALSE, deduct_unpaid_leave = FALSE, deduct_half_days = FALSE WHERE id = 1`);
await db.query(`DELETE FROM staff_time_off WHERE leave_request_id IS NOT NULL OR reason LIKE 'Leave:%'`);

const admin = await login('qa_admin');
const cashier = await login('qa_cashier');
const barberToken = await login('qa_barber');
const ids = Object.fromEntries((await db.query(`SELECT username, id FROM users WHERE username IN ('qa_admin','qa_cashier','qa_barber')`)).rows.map((row) => [row.username, Number(row.id)]));
const barberId = ids.qa_barber;
const cashierId = ids.qa_cashier;

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());
const plusDays = (date, days) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const weekday = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();
const at = (date, time) => `${date}T${time}:00+05:45`;
// Past working days (not Saturday), newest first, starting 2 days ago.
const workdays = [];
for (let back = 2; workdays.length < 12; back += 1) { const d = plusDays(today, -back); if (weekday(d) !== 6) workdays.push(d); }
let saturday = plusDays(today, -2); while (weekday(saturday) !== 6) saturday = plusDays(saturday, -1);
const [D1, D2, D3, D4, D5, D6, D7, D8, D9, D10] = workdays;
const rosterStart = plusDays(today, -40);
const month = (date) => date.slice(0, 7);

await must(admin, 'POST', '/api/store', { action: 'open', startingCash: 1000 });
const cashAtStart = (await must(admin, 'GET', '/api/store')).status.session.expectedCash;
const expensesAtStart = Number((await db.query('SELECT COUNT(*) n FROM expenses WHERE deleted_at IS NULL')).rows[0].n);

/* ------------------------------------------------------------------ A shifts & roster */
const day = (await must(admin, 'POST', '/api/hrm/shifts', { action: 'save', name: 'Day', startTime: '10:00', endTime: '19:00', graceMinutes: 10, breakMinutes: 60, workingDays: [0, 1, 2, 3, 4, 5], effectiveFrom: rosterStart })).shift;
const evening = (await must(admin, 'POST', '/api/hrm/shifts', { action: 'save', name: 'Evening', startTime: '18:00', endTime: '02:00', graceMinutes: 10, breakMinutes: 0, workingDays: [0, 1, 2, 3, 4, 5, 6], effectiveFrom: rosterStart })).shift;
check('A evening shift crosses midnight', evening.crossesMidnight === true, evening);
const sameTimes = await call(admin, 'POST', '/api/hrm/shifts', { action: 'save', name: 'Bad', startTime: '10:00', endTime: '10:00', workingDays: [1] });
check('A a shift cannot start and end at the same time', sameTimes.status === 400, sameTimes.json.error);
await must(admin, 'POST', '/api/hrm/shifts', { action: 'assign', staffId: barberId, shiftId: day.id, effectiveFrom: rosterStart });
await must(admin, 'POST', '/api/hrm/shifts', { action: 'assign', staffId: cashierId, shiftId: evening.id, effectiveFrom: rosterStart });
const rewrite = await call(admin, 'POST', '/api/hrm/shifts', { action: 'assign', staffId: barberId, shiftId: evening.id, effectiveFrom: plusDays(rosterStart, -5) });
check('A roster history cannot be rewritten backwards', rewrite.status === 409, rewrite.json.error);

const manual = (staffId, date, clockIn, clockOut, extra = {}) => call(admin, 'POST', '/api/hrm/attendance', { action: 'manual', staffId, date, clockIn, clockOut, reason: 'QA entry', ...extra });
const board = async (from, to = from, staffId = null) => must(admin, 'GET', `/api/hrm/attendance?from=${from}&to=${to}${staffId ? `&staffId=${staffId}` : ''}`);
const rowFor = async (staffId, date) => (await board(date, date, staffId)).rows[0];

/* ------------------------------------------------------------------ B normal / late / cross-midnight */
const normal = await manual(barberId, D1, at(D1, '09:58'), at(D1, '19:05'));
check('B normal day saved', normal.status === 201, normal.json.error);
const n = normal.json.record;
check('B normal day: present, not late', n?.status === 'PRESENT' && n.lateMinutes === 0, n);
check('B normal day: worked 8h 7m (547 − 60 break)', n?.workedMinutes === 487, n?.workedMinutes);
check('B normal day: no overtime under the 15 min threshold', n?.overtimeMinutes === 0, n?.overtimeMinutes);
check('B normal day: no negative values', ['workedMinutes', 'lateMinutes', 'earlyLeaveMinutes', 'overtimeMinutes', 'breakMinutes'].every((key) => n?.[key] >= 0));
const dupe = await manual(barberId, D1, at(D1, '10:00'), at(D1, '19:00'));
check('B second record for the same day rejected', dupe.status === 409, dupe.json.error);

const late = (await manual(barberId, D2, at(D2, '10:20'), at(D2, '19:00'))).json.record;
check('B late: 10:20 with 10 min grace = 10 minutes late', late?.status === 'LATE' && late.lateMinutes === 10, late);
const graceOk = (await manual(barberId, D10, at(D10, '10:08'), at(D10, '19:00'))).json.record;
check('B grace: 10:08 is on time', graceOk?.status === 'PRESENT' && graceOk.lateMinutes === 0, graceOk);

const night = (await manual(cashierId, D1, at(D1, '17:55'), at(plusDays(D1, 1), '02:05'))).json.record;
check('B cross-midnight: one session on the start date', night?.date === D1, night);
check('B cross-midnight: worked 8h 10m', night?.workedMinutes === 490, night?.workedMinutes);
check('B cross-midnight: not late, no overtime', night?.lateMinutes === 0 && night.overtimeMinutes === 0, night);
const nextDay = (await db.query('SELECT COUNT(*)::int n FROM hr_attendance WHERE staff_id = $1 AND attendance_date = $2', [cashierId, plusDays(D1, 1)])).rows[0].n;
check('B cross-midnight: no duplicate record on the next day', nextDay === 0, nextDay);

const early = (await manual(cashierId, D2, at(D2, '18:00'), at(plusDays(D2, 1), '01:30'))).json.record;
check('B early leave: 30 minutes before 2 AM', early?.earlyLeaveMinutes === 30, early);
const approvedEarly = await must(admin, 'PATCH', `/api/hrm/attendance/${early.id}`, { earlyLeaveApproved: true, reason: 'QA sent home early' });
check('B approved early departure is not counted', approvedEarly.record.earlyLeaveMinutes === 0, approvedEarly.record);

/* ------------------------------------------------------------------ C overtime */
const long = (await manual(barberId, D3, at(D3, '10:00'), at(D3, '20:30'))).json.record;
check('C potential overtime 90 min', long?.overtimeMinutes === 90, long);
let ot = await must(admin, 'GET', `/api/hrm/overtime?from=${D3}&to=${D3}`);
const otRow = ot.rows.find((row) => row.attendanceId === long.id);
check('C overtime waits as PENDING', otRow?.status === 'PENDING' && otRow.potentialMinutes === 90, otRow);
let payroll = (await must(admin, 'GET', `/api/hrm/payroll-inputs?month=${month(D3)}&staffId=${barberId}`)).staff[0];
check('C payroll ignores unapproved overtime', payroll.approvedOvertimeMinutes === 0 && payroll.pendingOvertimeMinutes >= 90, payroll);
const tooMuch = await call(admin, 'POST', '/api/hrm/overtime', { action: 'decide', id: otRow.id, decision: 'APPROVED', approvedMinutes: 120 });
check('C cannot approve more than worked', tooMuch.status === 400, tooMuch.json.error);
const noReason = await call(admin, 'POST', '/api/hrm/overtime', { action: 'decide', id: otRow.id, decision: 'APPROVED', approvedMinutes: 60 });
check('C partial approval needs a reason', noReason.status === 400, noReason.json.error);
await must(admin, 'POST', '/api/hrm/overtime', { action: 'decide', id: otRow.id, decision: 'APPROVED', approvedMinutes: 60, note: 'QA only 1h pre-agreed' });
payroll = (await must(admin, 'GET', `/api/hrm/payroll-inputs?month=${month(D3)}&staffId=${barberId}`)).staff[0];
check('C payroll uses approved overtime only (60)', payroll.approvedOvertimeMinutes === 60, payroll.approvedOvertimeMinutes);
const barberApproves = await call(barberToken, 'POST', '/api/hrm/overtime', { action: 'decide', id: otRow.id, decision: 'REJECTED', note: 'x' });
check('C staff cannot decide overtime', barberApproves.status === 403, barberApproves.status);

/* ------------------------------------------------------------------ D missing punch */
const open = (await manual(barberId, D4, at(D4, '10:00'), null)).json.record;
const missing = await rowFor(barberId, D4);
check('D clock-in without clock-out is MISSING PUNCH', missing.status === 'MISSING_PUNCH', missing.status);
check('D no clock-out was invented', missing.record.clockOut === null);
const fixNoReason = await call(admin, 'PATCH', `/api/hrm/attendance/${open.id}`, { clockOut: at(D4, '19:00') });
check('D correction without a reason rejected', fixNoReason.status === 400, fixNoReason.json.error);
const fixed = await must(admin, 'PATCH', `/api/hrm/attendance/${open.id}`, { clockOut: at(D4, '19:00'), reason: 'QA forgot to clock out' });
check('D corrected record is present with worked time', fixed.record.status === 'PRESENT' && fixed.record.workedMinutes === 480, fixed.record);
const history = (await must(admin, 'GET', `/api/hrm/attendance/${open.id}`)).history;
const fix = history.find((row) => row.action === 'missing_punch_fixed');
check('D audit keeps original and new values, actor and reason', history[0]?.action === 'manual_create' && fix && fix.oldValue.clockOut === null && fix.newValue.clockOut && fix.reason === 'QA forgot to clock out' && fix.actor, history);

/* ------------------------------------------------------------------ E absent / off day / holiday */
check('E scheduled, no punch, no leave = ABSENT', (await rowFor(barberId, D5)).status === 'ABSENT');
check('E Saturday (off day) is OFF_DAY, not absent', (await rowFor(barberId, saturday)).status === 'OFF_DAY');
await must(admin, 'POST', '/api/hrm/shifts', { action: 'holiday', date: D6, name: 'QA Festival', isMandatory: true });
check('E holiday is HOLIDAY, not absent', (await rowFor(barberId, D6)).status === 'HOLIDAY');
const future = await rowFor(barberId, plusDays(today, 3));
check('E a future scheduled day is not marked absent', future.status === 'NOT_STARTED' || future.status === 'OFF_DAY', future.status);

/* ------------------------------------------------------------------ F leave */
const types = (await must(admin, 'GET', '/api/hrm/leave')).types;
const sick = types.find((type) => type.name === 'Sick Leave');
const unpaid = types.find((type) => type.name === 'Unpaid Leave');
await must(admin, 'POST', '/api/hrm/leave', { action: 'type', ...sick, id: sick.id, annualAllocationDays: 12 });
const year = Number(D7.slice(0, 4));
const alloc = await must(admin, 'POST', '/api/hrm/leave', { action: 'allocate', year });
const allocAgain = await must(admin, 'POST', '/api/hrm/leave', { action: 'allocate', year });
check('F allocation is created once per employee', alloc.entries > 0 && allocAgain.entries === 0, { alloc, allocAgain });
const sickReq = await must(barberToken, 'POST', '/api/hrm/leave', { action: 'request', leaveTypeId: sick.id, startDate: D7, endDate: D7, reason: 'QA fever' });
check('F employee requests own leave (pending)', sickReq.request.status === 'PENDING' && sickReq.request.days === 1, sickReq.request);
const selfApprove = await call(barberToken, 'POST', '/api/hrm/leave', { action: 'decide', id: sickReq.request.id, decision: 'APPROVED' });
check('F employee cannot approve leave', selfApprove.status === 403, selfApprove.status);
let balances = (await must(admin, 'GET', `/api/hrm/leave?year=${year}`)).balances.find((row) => row.staffId === barberId).types.find((row) => row.leaveTypeId === sick.id);
check('F pending leave shows in balance (12 − 1 pending = 11)', balances.opening === 12 && balances.pending === 1 && balances.remaining === 11, balances);
await must(admin, 'POST', '/api/hrm/leave', { action: 'decide', id: sickReq.request.id, decision: 'APPROVED' });
balances = (await must(admin, 'GET', `/api/hrm/leave?year=${year}`)).balances.find((row) => row.staffId === barberId).types.find((row) => row.leaveTypeId === sick.id);
check('F approved leave: used 1, remaining 11', balances.used === 1 && balances.pending === 0 && balances.remaining === 11, balances);
check('F day on approved leave is ON_LEAVE, not ABSENT', (await rowFor(barberId, D7)).status === 'ON_LEAVE');
const timeOff = (await db.query('SELECT COUNT(*)::int n FROM staff_time_off WHERE leave_request_id = $1', [sickReq.request.id])).rows[0].n;
check('F approved leave blocks online booking (staff time off)', timeOff === 1, timeOff);
const overlap = await call(admin, 'POST', '/api/hrm/leave', { action: 'request', staffId: barberId, leaveTypeId: unpaid.id, startDate: D7, endDate: D7 });
check('F overlapping leave rejected', overlap.status === 409, overlap.json.error);
const unpaidReq = await must(admin, 'POST', '/api/hrm/leave', { action: 'request', staffId: barberId, leaveTypeId: unpaid.id, startDate: D8, endDate: D8, reason: 'QA personal' });
await must(admin, 'POST', '/api/hrm/leave', { action: 'decide', id: unpaidReq.request.id, decision: 'APPROVED' });
payroll = (await must(admin, 'GET', `/api/hrm/payroll-inputs?month=${month(D7)}&staffId=${barberId}`)).staff[0];
check('F payroll input: paid leave counted', payroll.paidLeaveDays >= 1, payroll);
const payrollD8 = (await must(admin, 'GET', `/api/hrm/payroll-inputs?month=${month(D8)}&staffId=${barberId}`)).staff[0];
check('F payroll input: unpaid leave counted separately', payrollD8.unpaidLeaveDays >= 1, payrollD8);
const tooMuchLeave = await must(admin, 'POST', '/api/hrm/leave', { action: 'request', staffId: cashierId, leaveTypeId: sick.id, startDate: plusDays(today, 10), endDate: plusDays(today, 30), reason: 'QA long' });
const denied = await call(admin, 'POST', '/api/hrm/leave', { action: 'decide', id: tooMuchLeave.request.id, decision: 'APPROVED' });
check('F approval beyond the balance is refused', denied.status === 409 && denied.json.code === 'INSUFFICIENT_BALANCE', denied.json);
await must(admin, 'POST', '/api/hrm/leave', { action: 'decide', id: sickReq.request.id, decision: 'CANCELLED', note: 'QA recovered' });
balances = (await must(admin, 'GET', `/api/hrm/leave?year=${year}`)).balances.find((row) => row.staffId === barberId).types.find((row) => row.leaveTypeId === sick.id);
check('F cancelling approved leave reverses the balance (ledger)', balances.remaining === 12, balances);
const ledgerRows = (await db.query("SELECT entry_type FROM hr_leave_ledger WHERE leave_request_id = $1 ORDER BY id", [sickReq.request.id])).rows.map((row) => row.entry_type);
check('F ledger keeps USAGE and REVERSAL (nothing overwritten)', ledgerRows.join(',') === 'USAGE,REVERSAL', ledgerRows);

/* ------------------------------------------------------------------ G half day */
const half = await manual(barberId, D9, at(D9, '10:00'), at(D9, '14:00'), { status: 'HALF_DAY' });
check('G half day needs a reason', half.status === 400, half.json.error);
const halfOk = (await manual(barberId, D9, at(D9, '10:00'), at(D9, '14:00'), { status: 'HALF_DAY', halfDayReason: 'EARLY_DEPARTURE' })).json.record;
check('G half day recorded with its reason', halfOk?.status === 'HALF_DAY' && halfOk.halfDayReason === 'EARLY_DEPARTURE', halfOk);

/* ------------------------------------------------------------------ H live punches */
const me = await must(barberToken, 'POST', '/api/hrm/me', { action: 'clock_in' });
check('H employee clocks in', Boolean(me.record?.clockIn) && me.record.source === 'EMPLOYEE', me.record);
const again = await call(barberToken, 'POST', '/api/hrm/me', { action: 'clock_in' });
check('H second clock-in is rejected server-side', again.status === 409 && again.json.code === 'ALREADY_CLOCKED_IN', again.json);
const endNoBreak = await call(barberToken, 'POST', '/api/hrm/me', { action: 'break_end' });
check('H cannot end a break that was not started', endNoBreak.status === 409, endNoBreak.json.code);
await must(barberToken, 'POST', '/api/hrm/me', { action: 'break_start' });
const outOnBreak = await call(barberToken, 'POST', '/api/hrm/me', { action: 'clock_out' });
check('H cannot clock out during a break', outOnBreak.status === 409 && outOnBreak.json.code === 'BREAK_ACTIVE', outOnBreak.json);
await must(barberToken, 'POST', '/api/hrm/me', { action: 'break_end' });
const out = await must(barberToken, 'POST', '/api/hrm/me', { action: 'clock_out' });
check('H clock out closes the session', Boolean(out.record.clockOut), out.record);
const openCount = (await db.query('SELECT COUNT(*)::int n FROM hr_attendance WHERE staff_id = $1 AND clock_out IS NULL AND clock_in IS NOT NULL', [barberId])).rows[0].n;
check('H barber has no open session left', openCount === 0, openCount);
const race = await Promise.all([1, 2, 3].map(() => call(admin, 'POST', '/api/hrm/attendance', { action: 'punch', staffId: cashierId, type: 'clock_in' })));
check('H three simultaneous clock-ins create exactly one session', race.filter((r) => r.status === 200).length === 1 && race.filter((r) => r.status === 409).length === 2, race.map((r) => r.status));
const cashierOpen = (await db.query('SELECT COUNT(*)::int n FROM hr_attendance WHERE staff_id = $1 AND clock_out IS NULL', [cashierId])).rows[0].n;
check('H exactly one open session in the database', cashierOpen === 1, cashierOpen);
await must(admin, 'POST', '/api/hrm/attendance', { action: 'punch', staffId: cashierId, type: 'clock_out' });

/* ------------------------------------------------------------------ I permissions */
const cashierBoard = await call(cashier, 'GET', `/api/hrm/attendance?from=${D1}&to=${D1}`);
check('I cashier has no attendance administration by default', cashierBoard.status === 403, cashierBoard.status);
const barberBoard = await call(barberToken, 'GET', `/api/hrm/attendance?from=${D1}&to=${D1}`);
check('I stylist cannot see others\' attendance', barberBoard.status === 403, barberBoard.status);
const ownBoard = await call(barberToken, 'GET', `/api/hrm/attendance?from=${D1}&to=${D1}&staffId=${barberId}`);
check('I stylist can see own attendance', ownBoard.status === 200, ownBoard.status);
const ownEdit = await call(barberToken, 'PATCH', `/api/hrm/attendance/${n.id}`, { clockIn: at(D1, '09:00'), reason: 'x' });
check('I employee cannot edit own history', ownEdit.status === 403, ownEdit.status);
const cashierManual = await call(cashier, 'POST', '/api/hrm/attendance', { action: 'manual', staffId: barberId, date: D5, clockIn: at(D5, '10:00'), reason: 'x' });
check('I cashier cannot enter manual attendance', cashierManual.status === 403, cashierManual.status);
const cashierPunchOther = await call(cashier, 'POST', '/api/hrm/attendance', { action: 'punch', staffId: barberId, type: 'clock_in' });
check('I cashier cannot punch for others by default', cashierPunchOther.status === 403, cashierPunchOther.status);
const policyEdit = await call(cashier, 'PUT', '/api/hrm/policy', { deductAbsentDays: true });
check('I only admin changes HR rules', policyEdit.status === 403, policyEdit.status);
const payrollPeek = await call(cashier, 'GET', `/api/hrm/payroll-inputs?month=${month(D1)}`);
check('I cashier cannot read payroll inputs', payrollPeek.status === 403, payrollPeek.status);
check('I HRM requires login', (await call(null, 'GET', '/api/hrm/attendance')).status === 401);
await must(admin, 'PUT', '/api/admin/permissions', { role: 'cashier', permission: 'attendance.view', allowed: true });
const granted = await call(cashier, 'GET', `/api/hrm/attendance?from=${D1}&to=${D1}`);
check('I granting attendance.view in Staff Permissions lets the cashier see attendance', granted.status === 200, granted.status);
await must(admin, 'PUT', '/api/admin/permissions', { role: 'cashier', permission: 'attendance.view', allowed: false });
// Two-level permissions: the module must be on before anything inside it counts or can be chosen.
await must(admin, 'PUT', '/api/admin/permissions', { role: 'barber', permission: 'module.hrm', allowed: false });
const moduleOff = await call(barberToken, 'POST', '/api/hrm/leave', { action: 'request', leaveTypeId: sick.id, startDate: plusDays(today, 40), endDate: plusDays(today, 40) });
check('I module switched off blocks the permissions inside it (own leave request)', moduleOff.status === 403, moduleOff.status);
const cleared = (await db.query("SELECT allowed FROM role_permissions WHERE role = 'barber' AND permission_key = 'leave.request'")).rows[0];
check('I switching a module off also clears its permissions', cleared?.allowed === false, cleared);
const orphan = await call(admin, 'PUT', '/api/admin/permissions', { role: 'barber', permission: 'attendance.view', allowed: true });
check('I a permission cannot be allowed while its module is off', orphan.status === 409, orphan.json.error);
const together = await call(admin, 'PATCH', '/api/admin/permissions', { role: 'barber', changes: [{ permission: 'module.hrm', allowed: true }, { permission: 'leave.request', allowed: true }] });
check('I module and its permission can be switched on together', together.status === 200, together.json.error);
const cashierPayrollModule = await call(admin, 'PUT', '/api/admin/permissions', { role: 'cashier', permission: 'module.payroll', allowed: true });
check('I full payroll module stays locked for the cashier', cashierPayrollModule.status === 422, cashierPayrollModule.status);
const auditActions = (await db.query('SELECT DISTINCT action, entity_type FROM hr_audit_log')).rows.map((row) => `${row.entity_type}:${row.action}`);
check('I audit covers shifts, manual entry, corrections, leave and overtime decisions', ['shift:create', 'attendance:manual_create', 'attendance:missing_punch_fixed', 'leave_request:approved', 'leave_request:cancelled', 'overtime:approved'].every((key) => auditActions.includes(key)), auditActions);

/* ------------------------------------------------------------------ J payroll */
payroll = (await must(admin, 'GET', `/api/hrm/payroll-inputs?month=${month(D5)}&staffId=${barberId}`)).staff[0];
check('J payroll inputs list the month', ['expectedDays', 'presentDays', 'paidLeaveDays', 'unpaidLeaveDays', 'absentDays', 'halfDays', 'approvedOvertimeMinutes', 'lateMinutes'].every((key) => Number.isFinite(payroll[key])), payroll);
check('J default rules: no automatic deduction or overtime pay', payroll.suggestion.attendanceDeduction === 0 && payroll.suggestion.overtimePay === 0, payroll.suggestion);
await must(admin, 'PUT', '/api/hrm/policy', { deductAbsentDays: true, overtimePayMode: 'FIXED_HOURLY', overtimeFixedHourlyRate: 200 });
const withRules = (await must(admin, 'GET', `/api/hrm/payroll-inputs?month=${month(D3)}&staffId=${barberId}`)).staff[0];
check('J rules on: approved 60 min at Rs 200/h = Rs 200 overtime pay', withRules.suggestion.overtimePay === 200, withRules.suggestion);
check('J rules on: absent days × daily rate', withRules.absentDays === 0 || withRules.suggestion.attendanceDeduction === Math.round(withRules.absentDays * withRules.suggestion.dailyRate * 100) / 100, withRules.suggestion);
await must(admin, 'PUT', '/api/hrm/policy', { deductAbsentDays: false, overtimePayMode: 'NONE' });

check('J attendance changed no drawer cash', (await must(admin, 'GET', '/api/store')).status.session.expectedCash === cashAtStart);
check('J attendance created no expense', Number((await db.query('SELECT COUNT(*) n FROM expenses WHERE deleted_at IS NULL')).rows[0].n) === expensesAtStart);

// Settlement: an advance is applied once; the attendance snapshot is recorded; only the payment moves cash.
await must(cashier, 'POST', '/api/payroll/advances', { staffId: barberId, amount: 500, paymentMethod: 'cash' }, { 'idempotency-key': randomUUID() });
const cashAfterAdvance = (await must(admin, 'GET', '/api/store')).status.session.expectedCash;
check('J the advance (not attendance) reduced cash by 500', cashAfterAdvance === cashAtStart - 500, cashAfterAdvance);
const settle = await must(admin, 'POST', '/api/admin/expenses', {
  type: 'salary', staffId: barberId, salaryMonth: month(D3), baseSalary: 20000, bonus: withRules.suggestion.overtimePay, deduction: 0, amountPaid: 0,
  paymentMethod: 'cash', attendanceSnapshot: { presentDays: withRules.presentDays, approvedOvertimeMinutes: withRules.approvedOvertimeMinutes },
});
const salary = (await db.query('SELECT advance_applied, amount_paid, attendance_snapshot FROM salary_payments WHERE id = $1', [settle.id])).rows[0];
check('J salary advance applied once', Number(salary.advance_applied) === 500, salary);
check('J attendance snapshot stored with the settlement', salary.attendance_snapshot?.approvedOvertimeMinutes === 60, salary.attendance_snapshot);
check('J an unpaid settlement moves no cash', (await must(admin, 'GET', '/api/store')).status.session.expectedCash === cashAfterAdvance);

await db.end();
const failed = results.filter((item) => !item.ok);
for (const item of results) console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.label}${item.ok ? '' : `  ${item.detail}`}`);
console.log(`\n${results.length - failed.length}/${results.length} HRM checks passed`);
process.exit(failed.length ? 1 : 0);
