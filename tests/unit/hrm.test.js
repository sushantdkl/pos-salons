import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAttendance, dayWithoutRecordStatus, formatMinutes, leaveDaysFor, nepalInstant, recordStatus,
  resolveAttendanceDate, shiftWindow,
} from '../../src/lib/hrm/calc.js';

const DAY = { start_time: '10:00', end_time: '19:00' };
const EVENING = { start_time: '18:00', end_time: '02:00' };
const at = (date, time) => nepalInstant(date, time);

test('normal day: 9:58 → 19:05 on a 10–7 shift with a 60 min break', () => {
  const window = shiftWindow('2026-09-10', DAY);
  const r = computeAttendance({ window, graceMinutes: 10, scheduledBreakMinutes: 60, clockIn: at('2026-09-10', '09:58'), clockOut: at('2026-09-10', '19:05') });
  assert.equal(r.lateMinutes, 0);
  assert.equal(r.earlyLeaveMinutes, 0);
  assert.equal(r.workedMinutes, 547 - 60);
  assert.equal(r.scheduledMinutes, 480);
  assert.equal(r.overtimeMinutes, 0, '7 extra minutes is under the 15 minute threshold');
  assert.equal(formatMinutes(r.workedMinutes), '8h 7m');
});

test('grace: 10:08 is on time, 10:17 is 7 late, 10:20 is 10 late', () => {
  const window = shiftWindow('2026-09-10', DAY);
  const late = (time) => computeAttendance({ window, graceMinutes: 10, clockIn: at('2026-09-10', time) }).lateMinutes;
  assert.equal(late('10:08'), 0);
  assert.equal(late('10:17'), 7);
  assert.equal(late('10:20'), 10);
  assert.equal(computeAttendance({ window, graceMinutes: 10, clockIn: at('2026-09-10', '10:20'), lateExcused: true }).lateMinutes, 0);
});

test('early leave: 18:30 out on a 19:00 shift is 30 early unless approved', () => {
  const window = shiftWindow('2026-09-10', DAY);
  const base = { window, clockIn: at('2026-09-10', '10:00'), clockOut: at('2026-09-10', '18:30') };
  assert.equal(computeAttendance(base).earlyLeaveMinutes, 30);
  assert.equal(computeAttendance({ ...base, earlyLeaveApproved: true }).earlyLeaveMinutes, 0);
});

test('cross-midnight: 17:55 → 02:05 is one session on the start date', () => {
  const window = shiftWindow('2026-09-10', EVENING);
  assert.equal(window.crossesMidnight, true);
  assert.equal(window.end.toISOString(), at('2026-09-11', '02:00').toISOString());
  const r = computeAttendance({ window, clockIn: at('2026-09-10', '17:55'), clockOut: at('2026-09-11', '02:05') });
  assert.equal(r.workedMinutes, 490);
  assert.equal(r.lateMinutes, 0);
  assert.equal(r.overtimeMinutes, 0);
  const shiftFor = () => EVENING;
  assert.equal(resolveAttendanceDate(at('2026-09-11', '01:30'), shiftFor), '2026-09-10', 'punch before 2 AM belongs to the evening before');
  assert.equal(resolveAttendanceDate(at('2026-09-11', '17:55'), shiftFor), '2026-09-11');
  assert.equal(resolveAttendanceDate(at('2026-09-11', '09:00'), () => DAY), '2026-09-11');
});

test('overtime is potential only above the threshold', () => {
  const window = shiftWindow('2026-09-10', DAY);
  const r = computeAttendance({ window, clockIn: at('2026-09-10', '10:00'), clockOut: at('2026-09-10', '20:30') });
  assert.equal(r.overtimeMinutes, 90);
  const offDay = computeAttendance({ window, offDay: true, clockIn: at('2026-09-10', '11:00'), clockOut: at('2026-09-10', '14:00') });
  assert.equal(offDay.overtimeMinutes, 180);
  assert.equal(computeAttendance({ window, offDay: true, clockIn: at('2026-09-10', '11:00'), clockOut: at('2026-09-10', '14:00'), policy: { overtimeOnOffDays: false } }).overtimeMinutes, 0);
});

test('punched breaks replace the scheduled break', () => {
  const window = shiftWindow('2026-09-10', DAY);
  const r = computeAttendance({ window, scheduledBreakMinutes: 60, clockIn: at('2026-09-10', '10:00'), clockOut: at('2026-09-10', '19:00'), hasPunchedBreaks: true, punchedUnpaidBreakMinutes: 20 });
  assert.equal(r.workedMinutes, 520);
  assert.equal(r.overtimeMinutes, 40);
});

test('missing punch only after the shift end plus the policy window; nothing invented', () => {
  const record = { clock_in: at('2026-09-10', '10:00'), clock_out: null, scheduled_end: at('2026-09-10', '19:00'), late_minutes: 0 };
  assert.equal(recordStatus(record, { now: at('2026-09-10', '15:00') }), 'PRESENT');
  assert.equal(recordStatus(record, { now: at('2026-09-10', '23:30') }), 'MISSING_PUNCH');
  assert.equal(recordStatus({ ...record, status_locked: true, status: 'HALF_DAY' }, { now: at('2026-09-12', '10:00') }), 'HALF_DAY');
});

test('no record: leave, holiday, off day, not started, absent', () => {
  const window = shiftWindow('2026-09-10', DAY);
  const base = { date: '2026-09-10', window, scheduled: true };
  assert.equal(dayWithoutRecordStatus({ ...base, onLeave: true, now: at('2026-09-11', '10:00') }), 'ON_LEAVE');
  assert.equal(dayWithoutRecordStatus({ ...base, holiday: true, now: at('2026-09-11', '10:00') }), 'HOLIDAY');
  assert.equal(dayWithoutRecordStatus({ ...base, offDay: true, now: at('2026-09-11', '10:00') }), 'OFF_DAY');
  assert.equal(dayWithoutRecordStatus({ ...base, now: at('2026-09-10', '12:00') }), 'NOT_STARTED', 'not absent while the shift is still running');
  assert.equal(dayWithoutRecordStatus({ ...base, now: at('2026-09-10', '19:30') }), 'ABSENT');
  assert.equal(dayWithoutRecordStatus({ ...base, scheduled: false, window: null, now: at('2026-09-11', '10:00') }), 'UNSCHEDULED');
});

test('leave days skip non-working days; a half day is 0.5', () => {
  const isWorkingDay = (date) => date !== '2026-09-13';
  assert.equal(leaveDaysFor({ startDate: '2026-09-11', endDate: '2026-09-14', isWorkingDay }), 3);
  assert.equal(leaveDaysFor({ startDate: '2026-09-11', endDate: '2026-09-11', partialDay: 'FIRST_HALF', isWorkingDay }), 0.5);
});
