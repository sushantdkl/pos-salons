/**
 * HRM SERVICE — shifts, rosters, holidays, attendance, leave, overtime, payroll inputs.
 *
 * Attendance is its own record (hr_attendance). Nothing here reads bills, tokens, services
 * or store sessions: doing a haircut is not proof of attendance, and the attendance date is
 * the shift's start date, not the Business Day.
 *
 * Every write runs in one transaction, locks the employee row (so two punches can never race)
 * and writes hr_audit_log. All maths comes from ./calc.js.
 */

import { bsDaysInMonth, bsToAdIso } from '@/lib/dates/calendar';
import { hasPermission, PERMISSIONS } from '@/lib/auth/permissions';
import { PERMISSION_KEYS } from '@/lib/auth/permission-catalog';
import {
  addDays, computeAttendance, datesBetween, dayWithoutRecordStatus, isIsoDate, leaveDaysFor,
  minutesBetween, nepalDateOf, nepalInstant, recordStatus, resolveAttendanceDate, shiftWindow, weekdayOf,
} from './calc';

export const EMPLOYEE_ROLES = ['cashier', 'barber', 'stylist', 'beautician'];
export const SOURCES = ['MANUAL', 'ADMIN', 'EMPLOYEE', 'DEVICE', 'IMPORT', 'BIOMETRIC', 'QR', 'PIN'];
const LOCKABLE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'ON_LEAVE', 'HOLIDAY', 'OFF_DAY'];
const HALF_DAY_REASONS = ['APPROVED_LEAVE', 'LATE_ARRIVAL', 'EARLY_DEPARTURE', 'MANUAL'];
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

export function httpError(message, status = 400, extra = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
  return error;
}

function text(value, fallback = null) {
  const cleaned = String(value ?? '').replace(/[<>]/g, '').trim();
  return cleaned || fallback;
}

function requireReason(reason) {
  const why = text(reason);
  if (!why) throw httpError('A reason is required');
  return why;
}

function timeValue(value, label) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ''));
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) throw httpError(`${label} must be a time like 10:00`);
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function dateValue(value, label) {
  if (!isIsoDate(value)) throw httpError(`${label} must be a date`);
  return value;
}

function instantValue(value, label) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) throw httpError(`${label} is not a valid time`);
  return date;
}

async function audit(tx, { entityType, entityId = null, staffId = null, action, oldValue = null, newValue = null, reason = null, actorId = null }) {
  await tx.run(`
    INSERT INTO hr_audit_log(entity_type, entity_id, staff_id, action, old_value, new_value, reason, actor_id)
    VALUES (?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?)
  `, [entityType, entityId, staffId, action, oldValue ? JSON.stringify(oldValue) : null, newValue ? JSON.stringify(newValue) : null, reason, actorId]);
}

/* ================================================================ access */

export async function can(db, user, permission) {
  return hasPermission(db, user, permission);
}

export async function assertCan(db, user, permission) {
  if (!(await hasPermission(db, user, permission))) throw httpError('Access denied', 403);
}

export async function myPermissions(db, user) {
  // Every permission (not only HR): the sidebar hides links by these grants, so a missing key
  // would hide a page the employee is allowed to use. hasPermission applies the module switch.
  const values = await Promise.all(PERMISSION_KEYS.map((key) => hasPermission(db, user, key)));
  return Object.fromEntries(PERMISSION_KEYS.map((key, index) => [key, values[index]]));
}

/* ================================================================ policy */

export async function getPolicy(db) {
  const row = await db.get('SELECT * FROM hr_policy WHERE id = 1');
  return {
    overtimeThresholdMinutes: Number(row?.overtime_threshold_minutes ?? 15),
    overtimeOnOffDays: row?.overtime_on_off_days !== false,
    autoDeductScheduledBreak: row?.auto_deduct_scheduled_break !== false,
    missingPunchAfterMinutes: Number(row?.missing_punch_after_minutes ?? 240),
    overtimePayMode: row?.overtime_pay_mode || 'NONE',
    overtimeMultiplier: round2(row?.overtime_multiplier ?? 1),
    overtimeFixedHourlyRate: round2(row?.overtime_fixed_hourly_rate ?? 0),
    deductAbsentDays: Boolean(row?.deduct_absent_days),
    deductUnpaidLeave: Boolean(row?.deduct_unpaid_leave),
    deductHalfDays: Boolean(row?.deduct_half_days),
    halfDayDeductionFactor: round2(row?.half_day_deduction_factor ?? 0.5),
  };
}

export async function updatePolicy(db, actor, input) {
  const current = await getPolicy(db);
  const next = { ...current };
  const int = (value, label, max) => {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0 || number > max) throw httpError(`${label} must be a whole number from 0 to ${max}`);
    return number;
  };
  if (input.overtimeThresholdMinutes !== undefined) next.overtimeThresholdMinutes = int(input.overtimeThresholdMinutes, 'Overtime threshold', 600);
  if (input.missingPunchAfterMinutes !== undefined) next.missingPunchAfterMinutes = int(input.missingPunchAfterMinutes, 'Missing punch window', 1440);
  for (const key of ['overtimeOnOffDays', 'autoDeductScheduledBreak', 'deductAbsentDays', 'deductUnpaidLeave', 'deductHalfDays']) {
    if (input[key] !== undefined) next[key] = Boolean(input[key]);
  }
  if (input.overtimePayMode !== undefined) {
    if (!['NONE', 'MULTIPLIER', 'FIXED_HOURLY'].includes(input.overtimePayMode)) throw httpError('Choose an overtime pay mode');
    next.overtimePayMode = input.overtimePayMode;
  }
  const nonNegative = (value, label) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) throw httpError(`${label} must be zero or more`);
    return round2(number);
  };
  if (input.overtimeMultiplier !== undefined) next.overtimeMultiplier = nonNegative(input.overtimeMultiplier, 'Overtime multiplier');
  if (input.overtimeFixedHourlyRate !== undefined) next.overtimeFixedHourlyRate = nonNegative(input.overtimeFixedHourlyRate, 'Overtime hourly rate');
  if (input.halfDayDeductionFactor !== undefined) {
    const factor = nonNegative(input.halfDayDeductionFactor, 'Half-day factor');
    if (factor > 1) throw httpError('Half-day factor must be between 0 and 1');
    next.halfDayDeductionFactor = factor;
  }
  await db.transaction(async (tx) => {
    await tx.run(`
      UPDATE hr_policy SET overtime_threshold_minutes = ?, overtime_on_off_days = ?, auto_deduct_scheduled_break = ?,
        missing_punch_after_minutes = ?, overtime_pay_mode = ?, overtime_multiplier = ?, overtime_fixed_hourly_rate = ?,
        deduct_absent_days = ?, deduct_unpaid_leave = ?, deduct_half_days = ?, half_day_deduction_factor = ?,
        updated_by = ?, updated_at = NOW()
      WHERE id = 1
    `, [next.overtimeThresholdMinutes, next.overtimeOnOffDays, next.autoDeductScheduledBreak, next.missingPunchAfterMinutes,
      next.overtimePayMode, next.overtimeMultiplier, next.overtimeFixedHourlyRate, next.deductAbsentDays, next.deductUnpaidLeave,
      next.deductHalfDays, next.halfDayDeductionFactor, actor.id]);
    await audit(tx, { entityType: 'policy', entityId: 1, action: 'update', oldValue: current, newValue: next, actorId: actor.id });
  });
  return next;
}

/* ================================================================ employees */

export async function listEmployees(db, { includeInactive = false } = {}) {
  const rows = await db.all(`
    SELECT u.id, COALESCE(NULLIF(sp.display_name, ''), u.full_name, u.username) AS name, u.role,
           COALESCE(sp.salon_role, u.role) AS designation, u.is_active, COALESCE(sp.base_salary, 0) AS base_salary
    FROM users u LEFT JOIN staff_profiles sp ON sp.user_id = u.id
    WHERE u.role IN (${EMPLOYEE_ROLES.map(() => '?').join(',')}) ${includeInactive ? '' : 'AND u.is_active = TRUE'}
    ORDER BY name
  `, EMPLOYEE_ROLES);
  return rows.map((row) => ({ id: Number(row.id), name: row.name, role: row.role, designation: row.designation, isActive: row.is_active, baseSalary: round2(row.base_salary) }));
}

async function lockEmployee(tx, staffId) {
  const row = await tx.get(`SELECT id, role, is_active, COALESCE(full_name, username) AS name FROM users WHERE id = ? FOR UPDATE`, [Number(staffId)]);
  if (!row || !EMPLOYEE_ROLES.includes(row.role)) throw httpError('Employee not found', 404);
  if (!row.is_active) throw httpError('This employee is inactive');
  return row;
}

/* ================================================================ shifts */

function mapShift(row) {
  return {
    id: Number(row.id), name: row.name, startTime: String(row.start_time).slice(0, 5), endTime: String(row.end_time).slice(0, 5),
    graceMinutes: Number(row.grace_minutes), breakMinutes: Number(row.break_minutes), workingDays: (row.working_days || []).map(Number),
    effectiveFrom: row.effective_from, effectiveTo: row.effective_to, isActive: row.is_active,
    crossesMidnight: String(row.end_time).slice(0, 5) <= String(row.start_time).slice(0, 5),
  };
}

const SHIFT_SELECT = 'SELECT id, name, start_time::text AS start_time, end_time::text AS end_time, grace_minutes, break_minutes, working_days, effective_from::text AS effective_from, effective_to::text AS effective_to, is_active FROM hr_shifts';

export async function listShifts(db, { includeInactive = true } = {}) {
  const rows = await db.all(`${SHIFT_SELECT} ${includeInactive ? '' : 'WHERE is_active'} ORDER BY is_active DESC, start_time, name`);
  return rows.map(mapShift);
}

function shiftFields(input) {
  const name = text(input.name);
  if (!name) throw httpError('Shift name is required');
  const startTime = timeValue(input.startTime, 'Start time');
  const endTime = timeValue(input.endTime, 'End time');
  if (startTime === endTime) throw httpError('Start and end time cannot be the same');
  const graceMinutes = Number(input.graceMinutes ?? 0);
  const breakMinutes = Number(input.breakMinutes ?? 0);
  if (!Number.isInteger(graceMinutes) || graceMinutes < 0 || graceMinutes > 240) throw httpError('Grace period must be 0–240 minutes');
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 480) throw httpError('Break must be 0–480 minutes');
  const workingDays = [...new Set((Array.isArray(input.workingDays) ? input.workingDays : []).map(Number))].filter((day) => day >= 0 && day <= 6).sort();
  if (!workingDays.length) throw httpError('Choose at least one working day');
  const effectiveFrom = input.effectiveFrom ? dateValue(input.effectiveFrom, 'Effective from') : nepalDateOf();
  const effectiveTo = input.effectiveTo ? dateValue(input.effectiveTo, 'Effective to') : null;
  if (effectiveTo && effectiveTo < effectiveFrom) throw httpError('Effective to must be on or after effective from');
  const length = minutesBetween(nepalInstant('2026-01-01', startTime), endTime <= startTime ? nepalInstant('2026-01-02', endTime) : nepalInstant('2026-01-01', endTime));
  if (breakMinutes >= length) throw httpError('The break is longer than the shift');
  return { name, startTime, endTime, graceMinutes, breakMinutes, workingDays, effectiveFrom, effectiveTo, isActive: input.isActive !== false };
}

export async function saveShift(db, actor, id, input) {
  const fields = shiftFields(input);
  return db.transaction(async (tx) => {
    const duplicate = await tx.get('SELECT id FROM hr_shifts WHERE LOWER(name) = LOWER(?) AND is_active AND id <> ?', [fields.name, Number(id || 0)]);
    if (duplicate && fields.isActive) throw httpError('An active shift with this name already exists', 409);
    const params = [fields.name, fields.startTime, fields.endTime, fields.graceMinutes, fields.breakMinutes, `{${fields.workingDays.join(',')}}`, fields.effectiveFrom, fields.effectiveTo, fields.isActive];
    let shiftId = Number(id || 0);
    if (shiftId) {
      const old = await tx.get(`${SHIFT_SELECT} WHERE id = ? FOR UPDATE`, [shiftId]);
      if (!old) throw httpError('Shift not found', 404);
      await tx.run(`UPDATE hr_shifts SET name = ?, start_time = ?, end_time = ?, grace_minutes = ?, break_minutes = ?, working_days = ?::smallint[],
        effective_from = ?, effective_to = ?, is_active = ?, updated_by = ?, updated_at = NOW() WHERE id = ?`, [...params, actor.id, shiftId]);
      await audit(tx, { entityType: 'shift', entityId: shiftId, action: 'update', oldValue: mapShift(old), newValue: fields, actorId: actor.id, reason: text(input.reason) });
    } else {
      const result = await tx.run(`INSERT INTO hr_shifts(name, start_time, end_time, grace_minutes, break_minutes, working_days, effective_from, effective_to, is_active, created_by, updated_by)
        VALUES (?, ?, ?, ?, ?, ?::smallint[], ?, ?, ?, ?, ?)`, [...params, actor.id, actor.id]);
      shiftId = Number(result.lastInsertRowid);
      await audit(tx, { entityType: 'shift', entityId: shiftId, action: 'create', newValue: fields, actorId: actor.id });
    }
    return mapShift(await tx.get(`${SHIFT_SELECT} WHERE id = ?`, [shiftId]));
  });
}

/* ================================================================ rosters */

export async function listAssignments(db, { staffId = null } = {}) {
  const rows = await db.all(`
    SELECT a.id, a.staff_id, a.shift_id, a.kind, a.effective_from::text AS effective_from, a.effective_to::text AS effective_to,
           a.off_days, a.notes, a.created_at, s.name AS shift_name, COALESCE(u.full_name, u.username) AS created_by_name
    FROM hr_shift_assignments a LEFT JOIN hr_shifts s ON s.id = a.shift_id LEFT JOIN users u ON u.id = a.created_by
    ${staffId ? 'WHERE a.staff_id = ?' : ''}
    ORDER BY a.staff_id, a.kind, a.effective_from DESC
  `, staffId ? [staffId] : []);
  return rows.map((row) => ({
    id: Number(row.id), staffId: Number(row.staff_id), shiftId: row.shift_id ? Number(row.shift_id) : null, shiftName: row.shift_name,
    kind: row.kind, effectiveFrom: row.effective_from, effectiveTo: row.effective_to, offDays: row.off_days ? row.off_days.map(Number) : null,
    notes: row.notes, createdAt: row.created_at, createdBy: row.created_by_name,
  }));
}

/**
 * Give an employee a default shift from a date. The previous open default is CLOSED the day
 * before (never rewritten), so history keeps which shift applied on every past date.
 */
export async function assignDefaultShift(db, actor, { staffId, shiftId, effectiveFrom, offDays = null, notes }) {
  const from = dateValue(effectiveFrom, 'Effective from');
  const off = Array.isArray(offDays) ? [...new Set(offDays.map(Number))].filter((day) => day >= 0 && day <= 6).sort() : null;
  return db.transaction(async (tx) => {
    await lockEmployee(tx, staffId);
    const shift = await tx.get('SELECT id, is_active FROM hr_shifts WHERE id = ?', [Number(shiftId)]);
    if (!shift?.is_active) throw httpError('Choose an active shift');
    const later = await tx.get(`SELECT effective_from::text AS effective_from FROM hr_shift_assignments WHERE staff_id = ? AND kind = 'DEFAULT' AND effective_from >= ?`, [staffId, from]);
    if (later) throw httpError(`This employee already has a shift from ${later.effective_from}. Choose a later start date so history is kept.`, 409);
    const open = await tx.get(`SELECT id, shift_id, effective_from::text AS effective_from FROM hr_shift_assignments WHERE staff_id = ? AND kind = 'DEFAULT' AND (effective_to IS NULL OR effective_to >= ?) ORDER BY effective_from DESC LIMIT 1`, [staffId, from]);
    if (open) await tx.run('UPDATE hr_shift_assignments SET effective_to = ? WHERE id = ?', [addDays(from, -1), open.id]);
    const result = await tx.run(`INSERT INTO hr_shift_assignments(staff_id, shift_id, kind, effective_from, off_days, notes, created_by) VALUES (?, ?, 'DEFAULT', ?, ${off ? '?::smallint[]' : 'NULL'}, ?, ?)`,
      off ? [staffId, shiftId, from, `{${off.join(',')}}`, text(notes), actor.id] : [staffId, shiftId, from, text(notes), actor.id]);
    await audit(tx, { entityType: 'shift_assignment', entityId: Number(result.lastInsertRowid), staffId: Number(staffId), action: 'assign_default', oldValue: open ? { shiftId: open.shift_id, closedOn: addDays(from, -1) } : null, newValue: { shiftId: Number(shiftId), from, offDays: off }, actorId: actor.id, reason: text(notes) });
    return { id: Number(result.lastInsertRowid) };
  });
}

/** One-day roster change: a different shift, or a day off (shiftId null). */
export async function setDayOverride(db, actor, { staffId, date, shiftId = null, reason }) {
  const day = dateValue(date, 'Date');
  const why = requireReason(reason);
  return db.transaction(async (tx) => {
    await lockEmployee(tx, staffId);
    if (shiftId) {
      const shift = await tx.get('SELECT is_active FROM hr_shifts WHERE id = ?', [Number(shiftId)]);
      if (!shift?.is_active) throw httpError('Choose an active shift');
    }
    const old = await tx.get(`SELECT id, shift_id FROM hr_shift_assignments WHERE staff_id = ? AND kind = 'DATE' AND effective_from = ? FOR UPDATE`, [staffId, day]);
    if (old) await tx.run('UPDATE hr_shift_assignments SET shift_id = ?, notes = ?, created_by = ?, created_at = NOW() WHERE id = ?', [shiftId || null, why, actor.id, old.id]);
    else await tx.run(`INSERT INTO hr_shift_assignments(staff_id, shift_id, kind, effective_from, effective_to, notes, created_by) VALUES (?, ?, 'DATE', ?, ?, ?, ?)`, [staffId, shiftId || null, day, day, why, actor.id]);
    await audit(tx, { entityType: 'shift_assignment', staffId: Number(staffId), action: 'day_override', oldValue: old ? { shiftId: old.shift_id } : null, newValue: { date: day, shiftId: shiftId || null, dayOff: !shiftId }, reason: why, actorId: actor.id });
    return { ok: true };
  });
}

export async function removeDayOverride(db, actor, { staffId, date, reason }) {
  const why = requireReason(reason);
  return db.transaction(async (tx) => {
    const old = await tx.get(`SELECT id, shift_id FROM hr_shift_assignments WHERE staff_id = ? AND kind = 'DATE' AND effective_from = ? FOR UPDATE`, [staffId, dateValue(date, 'Date')]);
    if (!old) throw httpError('No override on that date', 404);
    await tx.run('DELETE FROM hr_shift_assignments WHERE id = ?', [old.id]);
    await audit(tx, { entityType: 'shift_assignment', entityId: Number(old.id), staffId: Number(staffId), action: 'remove_override', oldValue: { date, shiftId: old.shift_id }, reason: why, actorId: actor.id });
    return { ok: true };
  });
}

/* ================================================================ holidays */

export async function listHolidays(db, { from = null, to = null } = {}) {
  const rows = await db.all(`SELECT id, holiday_date::text AS date, name, is_mandatory, notes FROM hr_holidays
    ${from && to ? 'WHERE holiday_date BETWEEN ?::date AND ?::date' : ''} ORDER BY holiday_date`, from && to ? [from, to] : []);
  return rows.map((row) => ({ id: Number(row.id), date: row.date, name: row.name, isMandatory: row.is_mandatory, notes: row.notes }));
}

export async function saveHoliday(db, actor, input) {
  const date = dateValue(input.date, 'Date');
  const name = text(input.name);
  if (!name) throw httpError('Holiday name is required');
  return db.transaction(async (tx) => {
    const old = await tx.get('SELECT id, name, is_mandatory FROM hr_holidays WHERE holiday_date = ? FOR UPDATE', [date]);
    if (old) await tx.run('UPDATE hr_holidays SET name = ?, is_mandatory = ?, notes = ? WHERE id = ?', [name, input.isMandatory !== false, text(input.notes), old.id]);
    else await tx.run('INSERT INTO hr_holidays(holiday_date, name, is_mandatory, notes, created_by) VALUES (?, ?, ?, ?, ?)', [date, name, input.isMandatory !== false, text(input.notes), actor.id]);
    await audit(tx, { entityType: 'holiday', entityId: old ? Number(old.id) : null, action: old ? 'update' : 'create', oldValue: old, newValue: { date, name, isMandatory: input.isMandatory !== false }, actorId: actor.id });
    return { ok: true };
  });
}

export async function deleteHoliday(db, actor, id) {
  return db.transaction(async (tx) => {
    const old = await tx.get('SELECT id, holiday_date::text AS date, name FROM hr_holidays WHERE id = ? FOR UPDATE', [Number(id)]);
    if (!old) throw httpError('Holiday not found', 404);
    await tx.run('DELETE FROM hr_holidays WHERE id = ?', [old.id]);
    await audit(tx, { entityType: 'holiday', entityId: Number(old.id), action: 'delete', oldValue: old, actorId: actor.id });
    return { ok: true };
  });
}

/* ================================================================ schedule context */

/**
 * Everything needed to know an employee's expected day, loaded once for a date range:
 * shift history, day overrides, holidays and approved leave.
 */
export async function loadSchedule(db, { staffIds, from, to }) {
  const ids = staffIds.map(Number);
  if (!ids.length) return { dayFor: () => null };
  const placeholders = ids.map(() => '?').join(',');
  const [shiftRows, assignmentRows, holidayRows, leaveRows] = await Promise.all([
    db.all(SHIFT_SELECT),
    db.all(`SELECT staff_id, shift_id, kind, effective_from::text AS effective_from, effective_to::text AS effective_to, off_days
      FROM hr_shift_assignments WHERE staff_id IN (${placeholders}) AND effective_from <= ?::date AND (effective_to IS NULL OR effective_to >= ?::date)`, [...ids, addDays(to, 1), addDays(from, -1)]),
    db.all('SELECT holiday_date::text AS date, name, is_mandatory FROM hr_holidays WHERE holiday_date BETWEEN ?::date AND ?::date', [addDays(from, -1), addDays(to, 1)]),
    db.all(`SELECT r.id, r.staff_id, r.start_date::text AS start_date, r.end_date::text AS end_date, r.partial_day, r.days, t.name AS type_name, t.is_paid
      FROM hr_leave_requests r JOIN hr_leave_types t ON t.id = r.leave_type_id
      WHERE r.status = 'APPROVED' AND r.staff_id IN (${placeholders}) AND r.start_date <= ?::date AND r.end_date >= ?::date`, [...ids, to, from]),
  ]);
  const shifts = new Map(shiftRows.map((row) => [Number(row.id), row]));
  const holidays = new Map(holidayRows.map((row) => [row.date, row]));
  const byStaff = new Map(ids.map((id) => [id, { defaults: [], dates: new Map(), leave: [] }]));
  for (const row of assignmentRows) {
    const entry = byStaff.get(Number(row.staff_id));
    if (row.kind === 'DATE') entry.dates.set(row.effective_from, row);
    else entry.defaults.push(row);
  }
  for (const row of leaveRows) byStaff.get(Number(row.staff_id)).leave.push(row);

  const shiftOn = (staffId, date) => {
    const entry = byStaff.get(Number(staffId));
    if (!entry) return { shift: null, offDay: false, scheduled: false };
    const override = entry.dates.get(date);
    if (override) {
      if (!override.shift_id) return { shift: null, offDay: true, scheduled: true, override: true };
      return { shift: shifts.get(Number(override.shift_id)), offDay: false, scheduled: true, override: true };
    }
    const assignment = entry.defaults.find((row) => row.effective_from <= date && (!row.effective_to || row.effective_to >= date));
    if (!assignment) return { shift: null, offDay: false, scheduled: false };
    const shift = shifts.get(Number(assignment.shift_id));
    const workingDays = assignment.off_days
      ? [0, 1, 2, 3, 4, 5, 6].filter((day) => !assignment.off_days.map(Number).includes(day))
      : (shift?.working_days || []).map(Number);
    const offDay = !workingDays.includes(weekdayOf(date));
    return { shift, offDay, scheduled: true };
  };

  const dayFor = (staffId, date) => {
    const entry = byStaff.get(Number(staffId));
    const { shift, offDay, scheduled, override } = shiftOn(staffId, date);
    const holiday = holidays.get(date) || null;
    const leave = entry?.leave.find((row) => row.start_date <= date && row.end_date >= date) || null;
    const window = shift && !offDay ? shiftWindow(date, shift) : null;
    return {
      date, shift: shift ? mapShift(shift) : null, window, offDay, scheduled, override: Boolean(override),
      holiday: holiday ? { name: holiday.name, isMandatory: holiday.is_mandatory } : null,
      leave: leave ? { id: Number(leave.id), type: leave.type_name, isPaid: leave.is_paid, partial: leave.partial_day !== 'FULL', partialDay: leave.partial_day } : null,
      graceMinutes: shift ? Number(shift.grace_minutes) : 0,
      breakMinutes: shift ? Number(shift.break_minutes) : 0,
    };
  };
  return { dayFor, shiftOn };
}

/* ================================================================ attendance maths */

async function recompute(tx, attendanceId, policy) {
  const record = await tx.get('SELECT * FROM hr_attendance WHERE id = ?', [attendanceId]);
  const breaks = await tx.all('SELECT started_at, ended_at, is_paid FROM hr_attendance_breaks WHERE attendance_id = ?', [attendanceId]);
  const unpaid = breaks.filter((row) => !row.is_paid && row.ended_at).reduce((sum, row) => sum + minutesBetween(row.started_at, row.ended_at), 0);
  const window = record.scheduled_start && record.scheduled_end ? { start: new Date(record.scheduled_start), end: new Date(record.scheduled_end) } : null;
  const offDay = ['OFF_DAY', 'HOLIDAY'].includes(record.day_type);
  const calc = computeAttendance({
    window, graceMinutes: Number(record.grace_minutes), scheduledBreakMinutes: Number(record.scheduled_break_minutes),
    clockIn: record.clock_in, clockOut: record.clock_out, punchedUnpaidBreakMinutes: unpaid, hasPunchedBreaks: breaks.length > 0,
    lateExcused: record.late_excused, earlyLeaveApproved: record.early_leave_approved, offDay, policy,
  });
  const status = record.status_locked ? record.status : recordStatus({ ...record, late_minutes: calc.lateMinutes }, { missingPunchAfterMinutes: policy.missingPunchAfterMinutes });
  await tx.run(`UPDATE hr_attendance SET break_minutes = ?, worked_minutes = ?, late_minutes = ?, early_leave_minutes = ?, overtime_minutes = ?, status = ?, updated_at = NOW() WHERE id = ?`,
    [calc.breakMinutes, calc.workedMinutes, calc.lateMinutes, calc.earlyLeaveMinutes, calc.overtimeMinutes, status, attendanceId]);

  // Potential overtime becomes a PENDING request; an approved or rejected one is never touched.
  const ot = await tx.get('SELECT id, status FROM hr_overtime WHERE attendance_id = ? FOR UPDATE', [attendanceId]);
  if (calc.overtimeMinutes > 0 && record.clock_out) {
    if (!ot) {
      await tx.run(`INSERT INTO hr_overtime(staff_id, attendance_id, work_date, source, scheduled_minutes, worked_minutes, potential_minutes, status)
        VALUES (?, ?, ?, 'ATTENDANCE', ?, ?, ?, 'PENDING')`, [record.staff_id, attendanceId, record.attendance_date, calc.scheduledMinutes, calc.workedMinutes, calc.overtimeMinutes]);
    } else if (ot.status === 'PENDING') {
      await tx.run('UPDATE hr_overtime SET scheduled_minutes = ?, worked_minutes = ?, potential_minutes = ?, updated_at = NOW() WHERE id = ?', [calc.scheduledMinutes, calc.workedMinutes, calc.overtimeMinutes, ot.id]);
    } else {
      await tx.run('UPDATE hr_overtime SET scheduled_minutes = ?, worked_minutes = ?, potential_minutes = ?, updated_at = NOW() WHERE id = ?', [calc.scheduledMinutes, calc.workedMinutes, calc.overtimeMinutes, ot.id]);
    }
  } else if (ot?.status === 'PENDING') {
    await tx.run('DELETE FROM hr_overtime WHERE id = ?', [ot.id]);
  }
  return { ...calc, status };
}

function snapshotFor(day) {
  return {
    shiftId: day.shift && !day.offDay ? day.shift.id : null,
    scheduledStart: day.window ? day.window.start : null,
    scheduledEnd: day.window ? day.window.end : null,
    grace: day.window ? day.graceMinutes : 0,
    breakMinutes: day.window ? day.breakMinutes : 0,
    // A mandatory holiday is a day off for everyone; an optional one only when not rostered.
    dayType: day.holiday?.isMandatory ? 'HOLIDAY' : day.offDay ? 'OFF_DAY' : day.window ? 'WORKING' : day.holiday ? 'HOLIDAY' : 'UNSCHEDULED',
  };
}

function mapRecord(row) {
  return {
    id: Number(row.id), staffId: Number(row.staff_id), date: row.attendance_date, shiftId: row.shift_id ? Number(row.shift_id) : null,
    scheduledStart: row.scheduled_start, scheduledEnd: row.scheduled_end, clockIn: row.clock_in, clockOut: row.clock_out,
    breakMinutes: Number(row.break_minutes), workedMinutes: Number(row.worked_minutes), lateMinutes: Number(row.late_minutes),
    earlyLeaveMinutes: Number(row.early_leave_minutes), overtimeMinutes: Number(row.overtime_minutes), status: row.status,
    statusLocked: row.status_locked, halfDayReason: row.half_day_reason, lateExcused: row.late_excused, earlyLeaveApproved: row.early_leave_approved,
    source: row.source, notes: row.notes, onBreak: Boolean(row.on_break), dayType: row.day_type,
  };
}

const RECORD_SELECT = `SELECT a.*, a.attendance_date::text AS attendance_date,
  EXISTS (SELECT 1 FROM hr_attendance_breaks b WHERE b.attendance_id = a.id AND b.ended_at IS NULL) AS on_break
  FROM hr_attendance a`;

/* ================================================================ clock actions */

/**
 * Clock in / out / break for one employee, now. `source` is EMPLOYEE for a self punch and
 * ADMIN when someone punches on another's behalf. Duplicate protection is server-side: the
 * employee row is locked, and unique indexes forbid a second record for the date or a second
 * open session.
 */
export async function punch(db, actor, { staffId, action, source = 'ADMIN', endBreak = false, reason = null, at = null }) {
  if (!['clock_in', 'clock_out', 'break_start', 'break_end'].includes(action)) throw httpError('Unknown attendance action');
  if (!SOURCES.includes(source)) throw httpError('Unknown attendance source');
  const now = at ? instantValue(at, 'Time') : new Date();
  const policy = await getPolicy(db);
  return db.transaction(async (tx) => {
    const employee = await lockEmployee(tx, staffId);
    const open = await tx.get(`${RECORD_SELECT} WHERE a.staff_id = ? AND a.clock_in IS NOT NULL AND a.clock_out IS NULL`, [employee.id]);

    if (action === 'clock_in') {
      if (open) throw httpError(`${employee.name} is already clocked in since ${new Date(open.clock_in).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit' })} (${open.attendance_date}). Clock out first.`, 409, { code: 'ALREADY_CLOCKED_IN' });
      const schedule = await loadSchedule(tx, { staffIds: [employee.id], from: addDays(nepalDateOf(now), -1), to: nepalDateOf(now) });
      const date = resolveAttendanceDate(now, (d) => {
        const day = schedule.dayFor(employee.id, d);
        return day.window ? day.shift && { start_time: day.shift.startTime, end_time: day.shift.endTime } : null;
      });
      const day = schedule.dayFor(employee.id, date);
      if (day.leave && !day.leave.partial && source === 'EMPLOYEE') throw httpError('You are on approved leave today. Ask a manager if you are working.', 409, { code: 'ON_LEAVE' });
      const existing = await tx.get('SELECT id, clock_out FROM hr_attendance WHERE staff_id = ? AND attendance_date = ? FOR UPDATE', [employee.id, date]);
      if (existing?.clock_out) throw httpError(`Attendance for ${date} is already complete. A manager can correct it if needed.`, 409, { code: 'DAY_COMPLETE' });
      const snap = snapshotFor(day);
      let id;
      if (existing) {
        // A record made by HR for the day (e.g. marked ABSENT) — the punch replaces it, audited.
        const old = await tx.get('SELECT * FROM hr_attendance WHERE id = ?', [existing.id]);
        await tx.run(`UPDATE hr_attendance SET clock_in = ?, status = 'PRESENT', status_locked = FALSE, source = ?, updated_by = ?, updated_at = NOW() WHERE id = ?`, [now, source, actor.id, existing.id]);
        id = Number(existing.id);
        await audit(tx, { entityType: 'attendance', entityId: id, staffId: employee.id, action: 'clock_in_over_record', oldValue: { status: old.status }, newValue: { clockIn: now }, actorId: actor.id, reason: text(reason) });
      } else {
        const result = await tx.run(`INSERT INTO hr_attendance(staff_id, attendance_date, shift_id, day_type, scheduled_start, scheduled_end, grace_minutes, scheduled_break_minutes, clock_in, status, source, created_by, updated_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PRESENT', ?, ?, ?)`,
        [employee.id, date, snap.shiftId, snap.dayType, snap.scheduledStart, snap.scheduledEnd, snap.grace, snap.breakMinutes, now, source, actor.id, actor.id]);
        id = Number(result.lastInsertRowid);
        await audit(tx, { entityType: 'attendance', entityId: id, staffId: employee.id, action: 'clock_in', newValue: { date, clockIn: now, source }, actorId: actor.id });
      }
      await recompute(tx, id, policy);
      return mapRecord(await tx.get(`${RECORD_SELECT} WHERE a.id = ?`, [id]));
    }

    if (!open) throw httpError(`${employee.name} is not clocked in.`, 409, { code: 'NOT_CLOCKED_IN' });
    const activeBreak = await tx.get('SELECT id, started_at FROM hr_attendance_breaks WHERE attendance_id = ? AND ended_at IS NULL FOR UPDATE', [open.id]);

    if (action === 'break_start') {
      if (activeBreak) throw httpError('A break is already running.', 409, { code: 'BREAK_ACTIVE' });
      if (now <= new Date(open.clock_in)) throw httpError('A break cannot start before clock-in.');
      await tx.run('INSERT INTO hr_attendance_breaks(attendance_id, started_at) VALUES (?, ?)', [open.id, now]);
      await audit(tx, { entityType: 'attendance', entityId: Number(open.id), staffId: employee.id, action: 'break_start', newValue: { at: now }, actorId: actor.id });
    } else if (action === 'break_end') {
      if (!activeBreak) throw httpError('There is no active break to end.', 409, { code: 'NO_ACTIVE_BREAK' });
      if (now <= new Date(activeBreak.started_at)) throw httpError('A break must end after it started.');
      await tx.run('UPDATE hr_attendance_breaks SET ended_at = ? WHERE id = ?', [now, activeBreak.id]);
      await audit(tx, { entityType: 'attendance', entityId: Number(open.id), staffId: employee.id, action: 'break_end', newValue: { at: now }, actorId: actor.id });
    } else {
      if (activeBreak) {
        const override = endBreak && await hasPermission(tx, actor, PERMISSIONS.ATTENDANCE_CORRECT);
        if (!override) throw httpError('End the running break before clocking out.', 409, { code: 'BREAK_ACTIVE' });
        await tx.run('UPDATE hr_attendance_breaks SET ended_at = ? WHERE id = ?', [now, activeBreak.id]);
        await audit(tx, { entityType: 'attendance', entityId: Number(open.id), staffId: employee.id, action: 'break_closed_by_override', newValue: { at: now }, reason: requireReason(reason), actorId: actor.id });
      }
      if (now <= new Date(open.clock_in)) throw httpError('Clock-out must be after clock-in.');
      await tx.run('UPDATE hr_attendance SET clock_out = ?, updated_by = ?, updated_at = NOW() WHERE id = ?', [now, actor.id, open.id]);
      await audit(tx, { entityType: 'attendance', entityId: Number(open.id), staffId: employee.id, action: 'clock_out', newValue: { clockOut: now, source }, actorId: actor.id });
    }
    await recompute(tx, Number(open.id), policy);
    return mapRecord(await tx.get(`${RECORD_SELECT} WHERE a.id = ?`, [open.id]));
  });
}

/* ================================================================ manual entry & correction */

function manualFields(input, date) {
  const status = input.status ? String(input.status).toUpperCase() : null;
  if (status && !LOCKABLE_STATUSES.includes(status)) throw httpError('Choose a valid status');
  const clockIn = input.clockIn ? instantValue(input.clockIn, 'Clock in') : null;
  const clockOut = input.clockOut ? instantValue(input.clockOut, 'Clock out') : null;
  if (clockOut && !clockIn) throw httpError('Clock out needs a clock in');
  if (clockIn && clockOut && clockOut <= clockIn) throw httpError('Clock out must be after clock in');
  if (clockIn && (clockIn < nepalInstant(addDays(date, -1), '00:00') || clockIn > nepalInstant(addDays(date, 2), '00:00'))) throw httpError('Clock in is too far from the attendance date');
  if (clockOut && minutesBetween(clockIn, clockOut) > 24 * 60) throw httpError('A session cannot be longer than 24 hours');
  if (clockIn && clockIn > new Date()) throw httpError('Clock in cannot be in the future');
  if (clockOut && clockOut > new Date()) throw httpError('Clock out cannot be in the future');
  const halfDayReason = input.halfDayReason ? String(input.halfDayReason).toUpperCase() : null;
  if (halfDayReason && !HALF_DAY_REASONS.includes(halfDayReason)) throw httpError('Choose a valid half-day reason');
  if (status === 'HALF_DAY' && !halfDayReason) throw httpError('A half day needs a reason (leave, late arrival, early departure or HR decision)');
  if (!status && !clockIn) throw httpError('Enter a clock-in time or choose a status');
  return { status, clockIn, clockOut, halfDayReason: status === 'HALF_DAY' ? halfDayReason : null };
}

/** HR enters a day that has no record yet (forgotten punches, absence override, half day …). */
export async function createManualAttendance(db, actor, input) {
  const date = dateValue(input.date, 'Date');
  if (date > nepalDateOf()) throw httpError('Attendance cannot be entered for a future date');
  const why = requireReason(input.reason);
  const fields = manualFields(input, date);
  const policy = await getPolicy(db);
  return db.transaction(async (tx) => {
    const employee = await lockEmployee(tx, input.staffId);
    const existing = await tx.get('SELECT id FROM hr_attendance WHERE staff_id = ? AND attendance_date = ?', [employee.id, date]);
    if (existing) throw httpError('This day already has an attendance record — correct it instead.', 409, { code: 'RECORD_EXISTS', attendanceId: Number(existing.id) });
    if (fields.clockIn && !fields.clockOut) {
      const open = await tx.get('SELECT id FROM hr_attendance WHERE staff_id = ? AND clock_in IS NOT NULL AND clock_out IS NULL', [employee.id]);
      if (open) throw httpError('This employee already has an open session.', 409, { code: 'ALREADY_CLOCKED_IN' });
    }
    const schedule = await loadSchedule(tx, { staffIds: [employee.id], from: date, to: date });
    const snap = snapshotFor(schedule.dayFor(employee.id, date));
    const locked = Boolean(fields.status);
    const result = await tx.run(`INSERT INTO hr_attendance(staff_id, attendance_date, shift_id, day_type, scheduled_start, scheduled_end, grace_minutes, scheduled_break_minutes,
        clock_in, clock_out, status, status_locked, half_day_reason, late_excused, early_leave_approved, source, notes, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', ?, ?, ?)`,
    [employee.id, date, snap.shiftId, snap.dayType, snap.scheduledStart, snap.scheduledEnd, snap.grace, snap.breakMinutes, fields.clockIn, fields.clockOut,
      fields.status || 'PRESENT', locked, fields.halfDayReason, Boolean(input.lateExcused), Boolean(input.earlyLeaveApproved),
      text(input.notes), actor.id, actor.id]);
    const id = Number(result.lastInsertRowid);
    await audit(tx, { entityType: 'attendance', entityId: id, staffId: employee.id, action: 'manual_create', newValue: { date, ...fields, lateExcused: Boolean(input.lateExcused), earlyLeaveApproved: Boolean(input.earlyLeaveApproved) }, reason: why, actorId: actor.id });
    await recompute(tx, id, policy);
    return mapRecord(await tx.get(`${RECORD_SELECT} WHERE a.id = ?`, [id]));
  });
}

/**
 * Correct an existing record. Every change keeps the original values in the audit log with
 * who, when and why. Status overrides lock the status; `status: null` returns it to automatic.
 */
export async function correctAttendance(db, actor, id, input) {
  const why = requireReason(input.reason);
  const policy = await getPolicy(db);
  return db.transaction(async (tx) => {
    const old = await tx.get(`${RECORD_SELECT} WHERE a.id = ? FOR UPDATE OF a`, [Number(id)]);
    if (!old) throw httpError('Attendance record not found', 404);
    await lockEmployee(tx, old.staff_id);
    const next = {
      clockIn: input.clockIn !== undefined ? (input.clockIn ? instantValue(input.clockIn, 'Clock in') : null) : old.clock_in,
      clockOut: input.clockOut !== undefined ? (input.clockOut ? instantValue(input.clockOut, 'Clock out') : null) : old.clock_out,
      lateExcused: input.lateExcused !== undefined ? Boolean(input.lateExcused) : old.late_excused,
      earlyLeaveApproved: input.earlyLeaveApproved !== undefined ? Boolean(input.earlyLeaveApproved) : old.early_leave_approved,
      status: old.status, statusLocked: old.status_locked, halfDayReason: old.half_day_reason,
    };
    if (input.status !== undefined) {
      if (input.status === null || input.status === 'AUTO') { next.statusLocked = false; next.halfDayReason = null; } else {
        const status = String(input.status).toUpperCase();
        if (!LOCKABLE_STATUSES.includes(status)) throw httpError('Choose a valid status');
        const reason = input.halfDayReason ? String(input.halfDayReason).toUpperCase() : old.half_day_reason;
        if (status === 'HALF_DAY' && !HALF_DAY_REASONS.includes(reason)) throw httpError('A half day needs a reason');
        next.status = status; next.statusLocked = true; next.halfDayReason = status === 'HALF_DAY' ? reason : null;
      }
    }
    if (next.clockOut && !next.clockIn) throw httpError('Clock out needs a clock in');
    if (next.clockIn && next.clockOut && new Date(next.clockOut) <= new Date(next.clockIn)) throw httpError('Clock out must be after clock in');
    if ((next.clockIn && new Date(next.clockIn) > new Date()) || (next.clockOut && new Date(next.clockOut) > new Date())) throw httpError('Punch times cannot be in the future');
    if (next.clockIn && next.clockOut && minutesBetween(next.clockIn, next.clockOut) > 24 * 60) throw httpError('A session cannot be longer than 24 hours');
    if (next.clockOut) {
      const runningBreak = await tx.get('SELECT id FROM hr_attendance_breaks WHERE attendance_id = ? AND ended_at IS NULL', [old.id]);
      // A break still running when HR sets the clock-out ends at that clock-out.
      if (runningBreak) await tx.run("UPDATE hr_attendance_breaks SET ended_at = GREATEST(started_at + INTERVAL '1 minute', ?::timestamptz) WHERE id = ?", [next.clockOut, runningBreak.id]);
    }
    await tx.run(`UPDATE hr_attendance SET clock_in = ?, clock_out = ?, late_excused = ?, early_leave_approved = ?, status = ?, status_locked = ?, half_day_reason = ?,
      updated_by = ?, updated_at = NOW() WHERE id = ?`, [next.clockIn, next.clockOut, next.lateExcused, next.earlyLeaveApproved, next.status, next.statusLocked, next.halfDayReason, actor.id, old.id]);
    const calc = await recompute(tx, Number(old.id), policy);
    const oldValue = { clockIn: old.clock_in, clockOut: old.clock_out, status: old.status, lateExcused: old.late_excused, earlyLeaveApproved: old.early_leave_approved, workedMinutes: old.worked_minutes, lateMinutes: old.late_minutes };
    const newValue = { clockIn: next.clockIn, clockOut: next.clockOut, status: calc.status, lateExcused: next.lateExcused, earlyLeaveApproved: next.earlyLeaveApproved, workedMinutes: calc.workedMinutes, lateMinutes: calc.lateMinutes };
    const action = old.status === 'MISSING_PUNCH' && next.clockOut && !old.clock_out ? 'missing_punch_fixed'
      : input.lateExcused !== undefined && next.lateExcused !== old.late_excused ? 'late_override'
        : input.status !== undefined ? 'status_override' : 'correction';
    await audit(tx, { entityType: 'attendance', entityId: Number(old.id), staffId: Number(old.staff_id), action, oldValue, newValue, reason: why, actorId: actor.id });
    return mapRecord(await tx.get(`${RECORD_SELECT} WHERE a.id = ?`, [old.id]));
  });
}

export async function attendanceHistory(db, attendanceId) {
  const rows = await db.all(`SELECT h.id, h.action, h.old_value, h.new_value, h.reason, h.created_at, COALESCE(u.full_name, u.username, 'System') AS actor
    FROM hr_audit_log h LEFT JOIN users u ON u.id = h.actor_id WHERE h.entity_type = 'attendance' AND h.entity_id = ? ORDER BY h.created_at, h.id`, [Number(attendanceId)]);
  return rows.map((row) => ({ id: Number(row.id), action: row.action, oldValue: row.old_value, newValue: row.new_value, reason: row.reason, at: row.created_at, actor: row.actor }));
}

/* ================================================================ board (the one resolver) */

/**
 * Attendance for employees × dates. Days with a record use it; days without one resolve to
 * ON_LEAVE / HOLIDAY / OFF_DAY / NOT_STARTED / UNSCHEDULED / ABSENT. Absent appears only after
 * the scheduled shift has ended. This is what the dashboard, calendar, reports, employee
 * profile and payroll inputs all read — one definition.
 */
export async function attendanceBoard(db, { from, to, staffId = null, now = new Date() }) {
  const start = dateValue(from, 'From');
  const end = dateValue(to, 'To');
  if (end < start) throw httpError('The end date is before the start date');
  if (datesBetween(start, end).length > 93) throw httpError('Choose a range of at most 93 days');
  const policy = await getPolicy(db);
  const employees = (await listEmployees(db, { includeInactive: false })).filter((row) => !staffId || row.id === Number(staffId));
  if (staffId && !employees.length) {
    const inactive = (await listEmployees(db, { includeInactive: true })).find((row) => row.id === Number(staffId));
    if (!inactive) throw httpError('Employee not found', 404);
    employees.push(inactive);
  }
  const ids = employees.map((row) => row.id);
  const schedule = await loadSchedule(db, { staffIds: ids, from: start, to: end });
  const records = ids.length ? await db.all(`${RECORD_SELECT} WHERE a.staff_id IN (${ids.map(() => '?').join(',')}) AND a.attendance_date BETWEEN ?::date AND ?::date`, [...ids, start, end]) : [];
  const recordMap = new Map(records.map((row) => [`${row.staff_id}|${row.attendance_date}`, row]));
  const overtime = ids.length ? await db.all(`SELECT staff_id, work_date::text AS work_date, status, approved_minutes, potential_minutes FROM hr_overtime
    WHERE staff_id IN (${ids.map(() => '?').join(',')}) AND work_date BETWEEN ?::date AND ?::date`, [...ids, start, end]) : [];
  const otMap = new Map();
  for (const row of overtime) {
    const key = `${row.staff_id}|${row.work_date}`;
    const current = otMap.get(key) || { approved: 0, pending: 0 };
    if (row.status === 'APPROVED') current.approved += Number(row.approved_minutes);
    if (row.status === 'PENDING') current.pending += Number(row.potential_minutes);
    otMap.set(key, current);
  }

  const rows = [];
  for (const employee of employees) {
    for (const date of datesBetween(start, end)) {
      const day = schedule.dayFor(employee.id, date);
      const record = recordMap.get(`${employee.id}|${date}`);
      const ot = otMap.get(`${employee.id}|${date}`) || { approved: 0, pending: 0 };
      let status;
      let mapped = null;
      if (record) {
        mapped = mapRecord(record);
        status = recordStatus(record, { now, missingPunchAfterMinutes: policy.missingPunchAfterMinutes });
        if (!record.status_locked && day.leave?.partial && ['PRESENT', 'LATE'].includes(status)) status = 'HALF_DAY';
      } else {
        status = dayWithoutRecordStatus({ date, window: day.window, onLeave: Boolean(day.leave), holiday: Boolean(day.holiday), offDay: day.offDay, scheduled: day.scheduled, now });
      }
      rows.push({
        staffId: employee.id, name: employee.name, designation: employee.designation, date, status,
        shift: day.shift && !day.offDay ? { id: day.shift.id, name: day.shift.name, startTime: day.shift.startTime, endTime: day.shift.endTime } : null,
        holiday: day.holiday, leave: day.leave, offDay: day.offDay, scheduled: day.scheduled,
        scheduledMinutes: day.window ? Math.max(0, minutesBetween(day.window.start, day.window.end) - day.breakMinutes) : 0,
        record: mapped, approvedOvertimeMinutes: ot.approved, pendingOvertimeMinutes: ot.pending,
      });
    }
  }
  return { from: start, to: end, employees, rows, policy };
}

const COUNTED = ['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'ON_LEAVE', 'HOLIDAY', 'OFF_DAY', 'MISSING_PUNCH', 'NOT_STARTED', 'UNSCHEDULED'];

export function summarizeRows(rows) {
  const counts = Object.fromEntries(COUNTED.map((key) => [key, 0]));
  let workedMinutes = 0; let lateMinutes = 0; let potentialOvertime = 0; let approvedOvertime = 0; let earlyLeaveMinutes = 0;
  for (const row of rows) {
    counts[row.status] = (counts[row.status] || 0) + 1;
    if (row.record) {
      workedMinutes += row.record.workedMinutes;
      lateMinutes += row.record.lateMinutes;
      earlyLeaveMinutes += row.record.earlyLeaveMinutes;
      potentialOvertime += row.record.overtimeMinutes;
    }
    approvedOvertime += row.approvedOvertimeMinutes;
  }
  const present = counts.PRESENT + counts.LATE + counts.HALF_DAY + counts.MISSING_PUNCH;
  const expected = present + counts.ABSENT;
  return {
    counts, present, workedMinutes, lateMinutes, earlyLeaveMinutes, potentialOvertime, approvedOvertime,
    lateDays: counts.LATE,
    attendanceRate: expected ? Math.round((present / expected) * 1000) / 10 : null,
    absenceRate: expected ? Math.round((counts.ABSENT / expected) * 1000) / 10 : null,
  };
}

/** Per-employee totals over a range — employee profile, reports, analytics. */
export function summarizeByEmployee(board) {
  return board.employees.map((employee) => {
    const rows = board.rows.filter((row) => row.staffId === employee.id);
    return { ...employee, ...summarizeRows(rows) };
  });
}

/* ================================================================ leave */

function mapLeaveType(row) {
  return {
    id: Number(row.id), name: row.name, isPaid: row.is_paid, annualAllocationDays: Number(row.annual_allocation_days),
    carryForward: row.carry_forward, maxCarryForwardDays: Number(row.max_carry_forward_days), requiresApproval: row.requires_approval,
    documentRequired: row.document_required, isActive: row.is_active,
  };
}

export async function listLeaveTypes(db) {
  return (await db.all('SELECT * FROM hr_leave_types ORDER BY is_active DESC, name')).map(mapLeaveType);
}

export async function saveLeaveType(db, actor, id, input) {
  const name = text(input.name);
  if (!name) throw httpError('Leave type name is required');
  const allocation = Number(input.annualAllocationDays ?? 0);
  const maxCarry = Number(input.maxCarryForwardDays ?? 0);
  if (!Number.isFinite(allocation) || allocation < 0 || allocation > 365) throw httpError('Annual allocation must be 0–365 days');
  if (!Number.isFinite(maxCarry) || maxCarry < 0 || maxCarry > 365) throw httpError('Carry forward limit must be 0–365 days');
  const values = [name, input.isPaid !== false, allocation, Boolean(input.carryForward), maxCarry, input.requiresApproval !== false, Boolean(input.documentRequired), input.isActive !== false];
  return db.transaction(async (tx) => {
    const duplicate = await tx.get('SELECT id FROM hr_leave_types WHERE LOWER(name) = LOWER(?) AND id <> ?', [name, Number(id || 0)]);
    if (duplicate) throw httpError('A leave type with this name already exists', 409);
    let typeId = Number(id || 0);
    if (typeId) {
      const old = await tx.get('SELECT * FROM hr_leave_types WHERE id = ? FOR UPDATE', [typeId]);
      if (!old) throw httpError('Leave type not found', 404);
      await tx.run(`UPDATE hr_leave_types SET name = ?, is_paid = ?, annual_allocation_days = ?, carry_forward = ?, max_carry_forward_days = ?, requires_approval = ?, document_required = ?, is_active = ?, updated_at = NOW() WHERE id = ?`, [...values, typeId]);
      await audit(tx, { entityType: 'leave_type', entityId: typeId, action: 'update', oldValue: mapLeaveType(old), newValue: { name, allocation }, actorId: actor.id });
    } else {
      const result = await tx.run('INSERT INTO hr_leave_types(name, is_paid, annual_allocation_days, carry_forward, max_carry_forward_days, requires_approval, document_required, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', values);
      typeId = Number(result.lastInsertRowid);
      await audit(tx, { entityType: 'leave_type', entityId: typeId, action: 'create', newValue: { name, allocation }, actorId: actor.id });
    }
    return mapLeaveType(await tx.get('SELECT * FROM hr_leave_types WHERE id = ?', [typeId]));
  });
}

/**
 * Opening allocation for a leave year (calendar year), plus capped carry-forward of last
 * year's remaining balance for types that allow it. Idempotent: an employee gets each at most once.
 */
export async function allocateLeaveYear(db, actor, year) {
  const leaveYear = Number(year);
  if (!Number.isInteger(leaveYear) || leaveYear < 2000 || leaveYear > 2100) throw httpError('Choose a valid year');
  const employees = await listEmployees(db);
  const types = (await listLeaveTypes(db)).filter((type) => type.isActive && (type.annualAllocationDays > 0 || type.carryForward));
  let created = 0;
  await db.transaction(async (tx) => {
    for (const employee of employees) {
      for (const type of types) {
        if (type.annualAllocationDays > 0) {
          const result = await tx.run(`INSERT INTO hr_leave_ledger(staff_id, leave_type_id, leave_year, entry_type, days, note, created_by) VALUES (?, ?, ?, 'ALLOCATION', ?, ?, ?)
            ON CONFLICT DO NOTHING`, [employee.id, type.id, leaveYear, type.annualAllocationDays, `Annual allocation ${leaveYear}`, actor.id]);
          created += result.rowCount || 0;
        }
        if (type.carryForward) {
          const previous = await tx.get('SELECT COALESCE(SUM(days), 0) AS balance FROM hr_leave_ledger WHERE staff_id = ? AND leave_type_id = ? AND leave_year = ?', [employee.id, type.id, leaveYear - 1]);
          const carry = Math.min(Number(previous.balance), type.maxCarryForwardDays);
          if (carry > 0) {
            const result = await tx.run(`INSERT INTO hr_leave_ledger(staff_id, leave_type_id, leave_year, entry_type, days, note, created_by) VALUES (?, ?, ?, 'CARRY_FORWARD', ?, ?, ?)
              ON CONFLICT DO NOTHING`, [employee.id, type.id, leaveYear, carry, `Carried from ${leaveYear - 1}`, actor.id]);
            created += result.rowCount || 0;
          }
        }
      }
    }
    await audit(tx, { entityType: 'leave_ledger', action: 'allocate_year', newValue: { year: leaveYear, entries: created }, actorId: actor.id });
  });
  return { year: leaveYear, entries: created };
}

export async function adjustLeaveBalance(db, actor, { staffId, leaveTypeId, year, days, reason }) {
  const why = requireReason(reason);
  const amount = Number(days);
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 365) throw httpError('Adjustment must be a non-zero number of days');
  return db.transaction(async (tx) => {
    await lockEmployee(tx, staffId);
    const result = await tx.run(`INSERT INTO hr_leave_ledger(staff_id, leave_type_id, leave_year, entry_type, days, note, created_by) VALUES (?, ?, ?, 'ADJUSTMENT', ?, ?, ?)`, [staffId, leaveTypeId, Number(year), amount, why, actor.id]);
    await audit(tx, { entityType: 'leave_ledger', entityId: Number(result.lastInsertRowid), staffId: Number(staffId), action: 'adjust', newValue: { leaveTypeId, year, days: amount }, reason: why, actorId: actor.id });
    return { ok: true };
  });
}

export async function leaveBalances(db, { year, staffId = null }) {
  const leaveYear = Number(year);
  const params = [leaveYear];
  let staffClause = '';
  if (staffId) { staffClause = 'AND l.staff_id = ?'; params.push(Number(staffId)); }
  const ledger = await db.all(`SELECT l.staff_id, l.leave_type_id,
      COALESCE(SUM(l.days) FILTER (WHERE l.entry_type IN ('ALLOCATION', 'CARRY_FORWARD')), 0) AS opening,
      COALESCE(SUM(l.days) FILTER (WHERE l.entry_type = 'ADJUSTMENT'), 0) AS adjusted,
      COALESCE(-SUM(l.days) FILTER (WHERE l.entry_type IN ('USAGE', 'REVERSAL')), 0) AS used,
      COALESCE(SUM(l.days), 0) AS balance
    FROM hr_leave_ledger l WHERE l.leave_year = ? ${staffClause} GROUP BY l.staff_id, l.leave_type_id`, params);
  const pending = await db.all(`SELECT staff_id, leave_type_id, COALESCE(SUM(days), 0) AS days FROM hr_leave_requests
    WHERE status = 'PENDING' AND EXTRACT(YEAR FROM start_date) = ? ${staffId ? 'AND staff_id = ?' : ''} GROUP BY staff_id, leave_type_id`, params);
  const employees = (await listEmployees(db)).filter((row) => !staffId || row.id === Number(staffId));
  const types = (await listLeaveTypes(db)).filter((type) => type.isActive);
  const key = (s, t) => `${s}|${t}`;
  const ledgerMap = new Map(ledger.map((row) => [key(row.staff_id, row.leave_type_id), row]));
  const pendingMap = new Map(pending.map((row) => [key(row.staff_id, row.leave_type_id), Number(row.days)]));
  return employees.map((employee) => ({
    staffId: employee.id, name: employee.name,
    types: types.map((type) => {
      const row = ledgerMap.get(key(employee.id, type.id));
      const opening = Number(row?.opening || 0) + Number(row?.adjusted || 0);
      const used = Number(row?.used || 0);
      const pendingDays = pendingMap.get(key(employee.id, type.id)) || 0;
      return { leaveTypeId: type.id, name: type.name, isPaid: type.isPaid, opening, used, pending: pendingDays, remaining: round2(Number(row?.balance || 0) - pendingDays), balance: Number(row?.balance || 0) };
    }),
  }));
}

function mapLeaveRequest(row) {
  return {
    id: Number(row.id), staffId: Number(row.staff_id), staffName: row.staff_name, leaveTypeId: Number(row.leave_type_id), leaveType: row.type_name,
    isPaid: row.is_paid, startDate: row.start_date, endDate: row.end_date, partialDay: row.partial_day, days: Number(row.days), reason: row.reason,
    attachmentUrl: row.attachment_url, status: row.status, requestedAt: row.requested_at, requestedBy: row.requested_by_name,
    decidedBy: row.decided_by_name, decidedAt: row.decided_at, decisionNote: row.decision_note,
  };
}

const LEAVE_SELECT = `SELECT r.*, r.start_date::text AS start_date, r.end_date::text AS end_date, t.name AS type_name, t.is_paid,
  COALESCE(s.full_name, s.username) AS staff_name, COALESCE(rq.full_name, rq.username) AS requested_by_name, COALESCE(d.full_name, d.username) AS decided_by_name
  FROM hr_leave_requests r JOIN hr_leave_types t ON t.id = r.leave_type_id JOIN users s ON s.id = r.staff_id
  LEFT JOIN users rq ON rq.id = r.requested_by LEFT JOIN users d ON d.id = r.decided_by`;

export async function listLeaveRequests(db, { staffId = null, status = null, from = null, to = null } = {}) {
  const clauses = [];
  const params = [];
  if (staffId) { clauses.push('r.staff_id = ?'); params.push(Number(staffId)); }
  if (status) { clauses.push('r.status = ?'); params.push(status); }
  if (from && to) { clauses.push('r.start_date <= ?::date AND r.end_date >= ?::date'); params.push(to, from); }
  const rows = await db.all(`${LEAVE_SELECT} ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY r.requested_at DESC LIMIT 500`, params);
  return rows.map(mapLeaveRequest);
}

async function countLeaveDays(tx, staffId, startDate, endDate, partialDay) {
  const schedule = await loadSchedule(tx, { staffIds: [staffId], from: startDate, to: endDate });
  const hasRoster = (await tx.get("SELECT 1 AS ok FROM hr_shift_assignments WHERE staff_id = ? AND kind = 'DEFAULT' LIMIT 1", [staffId]))?.ok;
  return leaveDaysFor({
    startDate, endDate, partialDay,
    isWorkingDay: (date) => {
      const day = schedule.dayFor(staffId, date);
      if (day.holiday?.isMandatory) return false;
      if (!hasRoster) return true; // no roster yet: every calendar day counts
      return day.scheduled && !day.offDay;
    },
  });
}

export async function requestLeave(db, actor, input, { onBehalf = false } = {}) {
  const staffId = Number(input.staffId);
  const startDate = dateValue(input.startDate, 'Start date');
  const endDate = dateValue(input.endDate || input.startDate, 'End date');
  if (endDate < startDate) throw httpError('End date is before start date');
  const partialDay = ['FULL', 'FIRST_HALF', 'SECOND_HALF'].includes(input.partialDay) ? input.partialDay : 'FULL';
  if (partialDay !== 'FULL' && startDate !== endDate) throw httpError('A half day must be a single date');
  if (datesBetween(startDate, endDate).length > 60) throw httpError('A single request can cover at most 60 days');
  const reason = text(input.reason);
  return db.transaction(async (tx) => {
    const employee = await lockEmployee(tx, staffId);
    const type = await tx.get('SELECT * FROM hr_leave_types WHERE id = ? AND is_active', [Number(input.leaveTypeId)]);
    if (!type) throw httpError('Choose a leave type');
    if (type.document_required && !text(input.attachmentUrl)) throw httpError(`${type.name} needs a supporting document`);
    const overlap = await tx.get(`SELECT id FROM hr_leave_requests WHERE staff_id = ? AND status IN ('PENDING', 'APPROVED') AND start_date <= ? AND end_date >= ?`, [employee.id, endDate, startDate]);
    if (overlap) throw httpError('This overlaps another pending or approved leave request', 409);
    const days = await countLeaveDays(tx, employee.id, startDate, endDate, partialDay);
    if (days <= 0) throw httpError('Those dates have no working days to take leave on');
    const result = await tx.run(`INSERT INTO hr_leave_requests(staff_id, leave_type_id, start_date, end_date, partial_day, days, reason, attachment_url, status, requested_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`, [employee.id, type.id, startDate, endDate, partialDay, days, reason, text(input.attachmentUrl), actor.id]);
    const id = Number(result.lastInsertRowid);
    await audit(tx, { entityType: 'leave_request', entityId: id, staffId: employee.id, action: onBehalf ? 'request_on_behalf' : 'request', newValue: { leaveType: type.name, startDate, endDate, partialDay, days }, reason, actorId: actor.id });
    const created = mapLeaveRequest(await tx.get(`${LEAVE_SELECT} WHERE r.id = ?`, [id]));
    if (!type.requires_approval) return decideInTx(tx, actor, id, 'APPROVED', 'Auto-approved: this leave type needs no approval');
    return created;
  });
}

async function decideInTx(tx, actor, id, decision, note) {
  const request = await tx.get(`${LEAVE_SELECT} WHERE r.id = ? FOR UPDATE OF r`, [Number(id)]);
  if (!request) throw httpError('Leave request not found', 404);
  await lockEmployee(tx, request.staff_id);
  const leaveYear = Number(request.start_date.slice(0, 4));
  if (decision === 'APPROVED' || decision === 'REJECTED') {
    if (request.status !== 'PENDING') throw httpError(`This request is already ${request.status.toLowerCase()}`, 409);
  }
  if (decision === 'APPROVED') {
    const type = await tx.get('SELECT * FROM hr_leave_types WHERE id = ?', [request.leave_type_id]);
    if (Number(type.annual_allocation_days) > 0 || type.carry_forward) {
      const balance = await tx.get('SELECT COALESCE(SUM(days), 0) AS balance FROM hr_leave_ledger WHERE staff_id = ? AND leave_type_id = ? AND leave_year = ?', [request.staff_id, request.leave_type_id, leaveYear]);
      if (Number(balance.balance) < Number(request.days)) throw httpError(`Only ${Number(balance.balance)} day(s) of ${type.name} left for ${leaveYear}. Allocate or adjust the balance first.`, 409, { code: 'INSUFFICIENT_BALANCE' });
    }
    await tx.run(`INSERT INTO hr_leave_ledger(staff_id, leave_type_id, leave_year, entry_type, days, leave_request_id, note, created_by) VALUES (?, ?, ?, 'USAGE', ?, ?, ?, ?)`,
      [request.staff_id, request.leave_type_id, leaveYear, -Number(request.days), request.id, `${request.start_date} → ${request.end_date}`, actor.id]);
    let timeOffId = null;
    if (request.partial_day === 'FULL') {
      // Blocks online booking for the stylist while on leave (appointments read staff_time_off).
      const timeOff = await tx.run('INSERT INTO staff_time_off(staff_id, starts_at, ends_at, reason, created_by, leave_request_id) VALUES (?, ?, ?, ?, ?, ?)',
        [request.staff_id, nepalInstant(request.start_date, '00:00'), nepalInstant(addDays(request.end_date, 1), '00:00'), `Leave: ${request.type_name}`, actor.id, request.id]);
      timeOffId = Number(timeOff.lastInsertRowid);
    }
    await tx.run(`UPDATE hr_leave_requests SET status = 'APPROVED', decided_by = ?, decided_at = NOW(), decision_note = ?, time_off_id = ? WHERE id = ?`, [actor.id, note, timeOffId, request.id]);
  } else if (decision === 'REJECTED') {
    await tx.run(`UPDATE hr_leave_requests SET status = 'REJECTED', decided_by = ?, decided_at = NOW(), decision_note = ? WHERE id = ?`, [actor.id, note, request.id]);
  } else if (decision === 'CANCELLED') {
    if (!['PENDING', 'APPROVED'].includes(request.status)) throw httpError(`A ${request.status.toLowerCase()} request cannot be cancelled`, 409);
    if (request.status === 'APPROVED') {
      await tx.run(`INSERT INTO hr_leave_ledger(staff_id, leave_type_id, leave_year, entry_type, days, leave_request_id, note, created_by) VALUES (?, ?, ?, 'REVERSAL', ?, ?, ?, ?)`,
        [request.staff_id, request.leave_type_id, leaveYear, Number(request.days), request.id, `Cancelled: ${note}`, actor.id]);
      if (request.time_off_id) await tx.run('DELETE FROM staff_time_off WHERE id = ?', [request.time_off_id]);
    }
    await tx.run(`UPDATE hr_leave_requests SET status = 'CANCELLED', decided_by = ?, decided_at = NOW(), decision_note = ?, time_off_id = NULL WHERE id = ?`, [actor.id, note, request.id]);
  }
  await audit(tx, { entityType: 'leave_request', entityId: Number(request.id), staffId: Number(request.staff_id), action: decision.toLowerCase(), oldValue: { status: request.status }, newValue: { status: decision }, reason: note, actorId: actor.id });
  return mapLeaveRequest(await tx.get(`${LEAVE_SELECT} WHERE r.id = ?`, [request.id]));
}

export async function decideLeave(db, actor, id, decision, note) {
  if (!['APPROVED', 'REJECTED', 'CANCELLED'].includes(decision)) throw httpError('Unknown decision');
  const why = decision === 'APPROVED' ? text(note, 'Approved') : requireReason(note);
  return db.transaction((tx) => decideInTx(tx, actor, id, decision, why));
}

/* ================================================================ overtime */

function mapOvertime(row) {
  return {
    id: Number(row.id), staffId: Number(row.staff_id), staffName: row.staff_name, attendanceId: row.attendance_id ? Number(row.attendance_id) : null,
    date: row.work_date, source: row.source, scheduledMinutes: Number(row.scheduled_minutes), workedMinutes: Number(row.worked_minutes),
    potentialMinutes: Number(row.potential_minutes), requestedMinutes: Number(row.requested_minutes), approvedMinutes: Number(row.approved_minutes),
    status: row.status, reason: row.reason, decidedBy: row.decided_by_name, decidedAt: row.decided_at, decisionNote: row.decision_note,
  };
}

const OT_SELECT = `SELECT o.*, o.work_date::text AS work_date, COALESCE(s.full_name, s.username) AS staff_name, COALESCE(d.full_name, d.username) AS decided_by_name
  FROM hr_overtime o JOIN users s ON s.id = o.staff_id LEFT JOIN users d ON d.id = o.decided_by`;

export async function listOvertime(db, { from, to, status = null, staffId = null }) {
  const params = [dateValue(from, 'From'), dateValue(to, 'To')];
  let extra = '';
  if (status) { extra += ' AND o.status = ?'; params.push(status); }
  if (staffId) { extra += ' AND o.staff_id = ?'; params.push(Number(staffId)); }
  const rows = await db.all(`${OT_SELECT} WHERE o.work_date BETWEEN ?::date AND ?::date ${extra} ORDER BY o.work_date DESC, o.id DESC`, params);
  return rows.map(mapOvertime);
}

export async function requestOvertime(db, actor, { staffId, date, minutes, reason }) {
  const day = dateValue(date, 'Date');
  const why = requireReason(reason);
  const requested = Number(minutes);
  if (!Number.isInteger(requested) || requested <= 0 || requested > 16 * 60) throw httpError('Overtime must be 1–960 minutes');
  return db.transaction(async (tx) => {
    const employee = await lockEmployee(tx, staffId);
    const result = await tx.run(`INSERT INTO hr_overtime(staff_id, work_date, source, requested_minutes, potential_minutes, status, reason, requested_by) VALUES (?, ?, 'REQUEST', ?, ?, 'PENDING', ?, ?)`,
      [employee.id, day, requested, requested, why, actor.id]);
    await audit(tx, { entityType: 'overtime', entityId: Number(result.lastInsertRowid), staffId: employee.id, action: 'request', newValue: { date: day, minutes: requested }, reason: why, actorId: actor.id });
    return mapOvertime(await tx.get(`${OT_SELECT} WHERE o.id = ?`, [result.lastInsertRowid]));
  });
}

export async function decideOvertime(db, actor, id, { decision, approvedMinutes, note }) {
  if (!['APPROVED', 'REJECTED'].includes(decision)) throw httpError('Unknown decision');
  return db.transaction(async (tx) => {
    const row = await tx.get('SELECT * FROM hr_overtime WHERE id = ? FOR UPDATE', [Number(id)]);
    if (!row) throw httpError('Overtime not found', 404);
    if (row.status !== 'PENDING') throw httpError(`This overtime is already ${row.status.toLowerCase()}`, 409);
    let minutes = 0;
    let why = text(note);
    if (decision === 'APPROVED') {
      minutes = approvedMinutes === undefined || approvedMinutes === null || approvedMinutes === '' ? Number(row.potential_minutes) : Number(approvedMinutes);
      if (!Number.isInteger(minutes) || minutes <= 0) throw httpError('Approved minutes must be a whole number above zero');
      if (minutes > Number(row.potential_minutes)) throw httpError(`Cannot approve more than the ${row.potential_minutes} minutes worked over the shift`);
      if (minutes !== Number(row.potential_minutes) && !why) throw httpError('A reason is required when approving a different amount');
    } else {
      why = requireReason(note);
    }
    await tx.run('UPDATE hr_overtime SET status = ?, approved_minutes = ?, decided_by = ?, decided_at = NOW(), decision_note = ?, updated_at = NOW() WHERE id = ?', [decision, minutes, actor.id, why, row.id]);
    await audit(tx, { entityType: 'overtime', entityId: Number(row.id), staffId: Number(row.staff_id), action: decision.toLowerCase(), oldValue: { status: row.status, potentialMinutes: row.potential_minutes }, newValue: { status: decision, approvedMinutes: minutes }, reason: why, actorId: actor.id });
    return mapOvertime(await tx.get(`${OT_SELECT} WHERE o.id = ?`, [row.id]));
  });
}

/* ================================================================ payroll inputs */

function monthBounds(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) throw httpError('Month must be YYYY-MM');
  // BS months (years 2070+) come from the payroll form when Settings > Calendar is BS.
  if (Number(month.slice(0, 4)) >= 2070) {
    const [year, value] = month.split('-').map(Number);
    return { from: bsToAdIso(`${month}-01`), to: bsToAdIso(`${month}-${String(bsDaysInMonth(year, value)).padStart(2, '0')}`) };
  }
  const from = `${month}-01`;
  const next = new Date(`${from}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const to = addDays(next.toISOString().slice(0, 10), -1);
  return { from, to };
}

/**
 * Attendance as payroll INPUT for a month. Nothing here writes salary, expenses or cash —
 * payroll decides what to use. The suggested adjustment follows hr_policy only: with the
 * default policy (all deductions off, overtime pay NONE) it is zero.
 */
export async function payrollInputs(db, { month, staffId = null }) {
  const { from, to } = monthBounds(month);
  const board = await attendanceBoard(db, { from, to, staffId });
  const policy = board.policy;
  const today = nepalDateOf();
  return board.employees.map((employee) => {
    const rows = board.rows.filter((row) => row.staffId === employee.id);
    const summary = summarizeRows(rows);
    const expectedDays = rows.filter((row) => row.scheduled && !row.offDay && !(row.holiday?.isMandatory)).length;
    const scheduledMinutes = rows.filter((row) => row.scheduled && !row.offDay && !(row.holiday?.isMandatory)).reduce((sum, row) => sum + row.scheduledMinutes, 0);
    const paidLeaveDays = rows.filter((row) => row.leave?.isPaid && row.status !== 'HALF_DAY').reduce((sum, row) => sum + (row.leave.partial ? 0.5 : 1), 0);
    const unpaidLeaveDays = rows.filter((row) => row.leave && !row.leave.isPaid).reduce((sum, row) => sum + (row.leave.partial ? 0.5 : 1), 0);
    const halfDays = summary.counts.HALF_DAY;
    const absentDays = summary.counts.ABSENT;
    const dailyRate = expectedDays ? round2(employee.baseSalary / expectedDays) : 0;
    const hourlyRate = scheduledMinutes ? employee.baseSalary / (scheduledMinutes / 60) : 0;
    const deductionDays = (policy.deductAbsentDays ? absentDays : 0) + (policy.deductUnpaidLeave ? unpaidLeaveDays : 0) + (policy.deductHalfDays ? halfDays * policy.halfDayDeductionFactor : 0);
    const attendanceDeduction = round2(deductionDays * dailyRate);
    const approvedHours = summary.approvedOvertime / 60;
    const overtimePay = policy.overtimePayMode === 'MULTIPLIER' ? round2(approvedHours * hourlyRate * policy.overtimeMultiplier)
      : policy.overtimePayMode === 'FIXED_HOURLY' ? round2(approvedHours * policy.overtimeFixedHourlyRate) : 0;
    return {
      staffId: employee.id, name: employee.name, month, from, to, complete: to < today,
      baseSalary: employee.baseSalary, expectedDays, presentDays: summary.present, lateDays: summary.lateDays, halfDays,
      paidLeaveDays, unpaidLeaveDays, absentDays, holidays: summary.counts.HOLIDAY, offDays: summary.counts.OFF_DAY,
      missingPunches: summary.counts.MISSING_PUNCH, notYetDays: summary.counts.NOT_STARTED, unscheduledDays: summary.counts.UNSCHEDULED,
      workedMinutes: summary.workedMinutes, lateMinutes: summary.lateMinutes,
      approvedOvertimeMinutes: summary.approvedOvertime, pendingOvertimeMinutes: rows.reduce((sum, row) => sum + row.pendingOvertimeMinutes, 0),
      suggestion: { dailyRate, deductionDays: round2(deductionDays), attendanceDeduction, overtimePay, policy },
    };
  });
}
