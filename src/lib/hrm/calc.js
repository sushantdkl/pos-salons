/**
 * ATTENDANCE MATHS — pure functions, no imports, unit-tested (tests/unit/hrm.test.js).
 * The server is the only place these run; the browser never computes an authoritative value.
 *
 * Time: Nepal has one fixed offset (+05:45, no daylight saving), so a wall-clock time on a
 * Nepal date is an exact instant. Durations are whole MINUTES (integers), never float hours.
 *
 * Rules (the policy lives in hr_policy; these are the definitions):
 *   Logical date  — a record belongs to the date its shift STARTS. A punch before a
 *                   cross-midnight shift's end belongs to the previous date's shift.
 *   Late          — minutes after (shift start + grace). 10:00 start, 10 min grace:
 *                   10:08 → 0, 10:17 → 7, 10:20 → 10. Zero when HR excuses it.
 *   Early leave   — minutes before scheduled end. Zero when HR approved the early departure.
 *   Worked        — clock out − clock in − unpaid break. Unpaid break = punched unpaid breaks;
 *                   if none were punched and policy says so, the shift's scheduled break is
 *                   deducted once the span is longer than half the shift.
 *   Overtime      — POTENTIAL only: worked − scheduled when that is at least the policy
 *                   threshold (below it: 0). On an off day or holiday, all worked
 *                   time is potential overtime when policy says so; with no shift assigned there is
 *                   nothing to measure against, so none. Payroll uses approved minutes only.
 */

export const NEPAL_OFFSET = '+05:45';
const MINUTE = 60000;

export function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

export function nepalDateOf(instant = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date(instant));
}

export function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, for a Nepal calendar date. */
export function weekdayOf(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function datesBetween(from, to) {
  const out = [];
  for (let date = from; date <= to; date = addDays(date, 1)) out.push(date);
  return out;
}

function hhmm(time) {
  return String(time || '').slice(0, 5);
}

/** A Nepal wall-clock date + time as an exact instant. */
export function nepalInstant(date, time) {
  return new Date(`${date}T${hhmm(time)}:00${NEPAL_OFFSET}`);
}

/** Scheduled window of a shift on a logical date; end rolls to the next day when end <= start. */
export function shiftWindow(date, shift) {
  if (!shift) return null;
  const start = nepalInstant(date, shift.start_time ?? shift.startTime);
  const crossesMidnight = hhmm(shift.end_time ?? shift.endTime) <= hhmm(shift.start_time ?? shift.startTime);
  const end = nepalInstant(crossesMidnight ? addDays(date, 1) : date, shift.end_time ?? shift.endTime);
  return { start, end, crossesMidnight };
}

export function minutesBetween(a, b) {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / MINUTE);
}

export function scheduledMinutes(window, breakMinutes = 0) {
  if (!window) return 0;
  return Math.max(0, minutesBetween(window.start, window.end) - Number(breakMinutes || 0));
}

/**
 * Which logical date a punch at `instant` belongs to. `shiftForDate(date)` returns the shift
 * scheduled on that date (or null). The previous date wins only while its cross-midnight shift
 * is still running; otherwise the punch belongs to today's Nepal date.
 */
export function resolveAttendanceDate(instant, shiftForDate) {
  const today = nepalDateOf(instant);
  const yesterday = addDays(today, -1);
  const previous = shiftForDate(yesterday);
  const window = previous ? shiftWindow(yesterday, previous) : null;
  if (window?.crossesMidnight && new Date(instant) < window.end) return yesterday;
  return today;
}

export function computeAttendance({
  window = null,
  graceMinutes = 0,
  scheduledBreakMinutes = 0,
  clockIn,
  clockOut = null,
  punchedUnpaidBreakMinutes = 0,
  hasPunchedBreaks = false,
  lateExcused = false,
  earlyLeaveApproved = false,
  offDay = false,
  policy = {},
} = {}) {
  const threshold = Number(policy.overtimeThresholdMinutes ?? 15);
  const autoBreak = policy.autoDeductScheduledBreak !== false;
  const overtimeOnOffDays = policy.overtimeOnOffDays !== false;
  const scheduled = offDay ? 0 : scheduledMinutes(window, scheduledBreakMinutes);

  let late = 0;
  if (window && !offDay && clockIn && !lateExcused) {
    const lateFrom = new Date(window.start.getTime() + Number(graceMinutes || 0) * MINUTE);
    late = Math.max(0, minutesBetween(lateFrom, clockIn));
  }
  if (!clockIn || !clockOut) {
    return { lateMinutes: late, earlyLeaveMinutes: 0, workedMinutes: 0, breakMinutes: punchedUnpaidBreakMinutes, overtimeMinutes: 0, scheduledMinutes: scheduled };
  }

  let early = 0;
  if (window && !offDay && !earlyLeaveApproved) early = Math.max(0, minutesBetween(clockOut, window.end));

  const span = Math.max(0, minutesBetween(clockIn, clockOut));
  let unpaidBreak = Number(punchedUnpaidBreakMinutes || 0);
  if (!hasPunchedBreaks && autoBreak && !offDay && scheduledBreakMinutes > 0 && window) {
    const shiftLength = minutesBetween(window.start, window.end);
    if (span > shiftLength / 2) unpaidBreak = Number(scheduledBreakMinutes);
  }
  const worked = Math.max(0, span - unpaidBreak);

  let overtime = 0;
  if (offDay) overtime = overtimeOnOffDays ? worked : 0;
  else if (!window) overtime = 0; // no shift assigned: nothing to measure overtime against
  else {
    const extra = worked - scheduled;
    overtime = extra >= threshold && extra > 0 ? extra : 0;
  }
  return { lateMinutes: late, earlyLeaveMinutes: early, workedMinutes: worked, breakMinutes: unpaidBreak, overtimeMinutes: overtime, scheduledMinutes: scheduled };
}

/**
 * Status of a stored record. HR-set statuses (locked) win. An open session becomes
 * MISSING_PUNCH once its scheduled end (+ policy minutes) has passed — nothing is invented.
 */
export function recordStatus(record, { now = new Date(), missingPunchAfterMinutes = 240 } = {}) {
  if (record.status_locked) return record.status;
  if (!record.clock_in) return record.status;
  if (!record.clock_out) {
    const deadline = record.scheduled_end
      ? new Date(new Date(record.scheduled_end).getTime() + missingPunchAfterMinutes * MINUTE)
      : new Date(new Date(record.clock_in).getTime() + 16 * 60 * MINUTE);
    if (new Date(now) > deadline) return 'MISSING_PUNCH';
  }
  return Number(record.late_minutes) > 0 ? 'LATE' : 'PRESENT';
}

/**
 * Status of a day with NO attendance record, in priority order. Absent is only declared once
 * the scheduled shift has fully ended — never for today's shift still in progress or the future.
 */
export function dayWithoutRecordStatus({ date, window, onLeave, holiday, offDay, scheduled, now = new Date() }) {
  if (onLeave) return 'ON_LEAVE';
  if (holiday) return 'HOLIDAY';
  if (offDay) return 'OFF_DAY';
  if (!scheduled || !window) return 'UNSCHEDULED';
  if (new Date(now) < window.end || date > nepalDateOf(now)) return 'NOT_STARTED';
  return 'ABSENT';
}

export function formatMinutes(minutes) {
  const value = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(value / 60);
  const m = value % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Working days a leave request consumes: scheduled days that are not holidays; half days = 0.5. */
export function leaveDaysFor({ startDate, endDate, partialDay = 'FULL', isWorkingDay }) {
  if (partialDay !== 'FULL') return isWorkingDay(startDate) ? 0.5 : 0;
  return datesBetween(startDate, endDate).filter((date) => isWorkingDay(date)).length;
}
