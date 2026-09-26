import test from 'node:test';
import assert from 'node:assert/strict';
import { adToBsIso, bsToAdIso, isCanonicalAdDate, isValidBsDate, nepalDateString } from '../../src/lib/dates/calendar.js';
import { nepalRangeUtcBounds, resolveReportPeriod } from '../../src/lib/dates/report-periods.js';

test('AD and BS conversion round trips without changing canonical storage date', () => {
  const ad = '2026-09-20';
  assert.equal(bsToAdIso(adToBsIso(ad)), ad);
  assert.equal(isCanonicalAdDate('2024-02-29'), true);
  assert.equal(isCanonicalAdDate('2023-02-29'), false);
});

test('invalid BS month lengths are rejected', () => {
  assert.equal(isValidBsDate('2083-13-01'), false);
  assert.equal(isValidBsDate('2083-01-99'), false);
});

test('Nepal midnight produces inclusive/exclusive UTC bounds', () => {
  assert.deepEqual(nepalRangeUtcBounds('2026-09-20'), { startUtc: '2026-09-19T18:15:00.000Z', endUtcExclusive: '2026-09-20T18:15:00.000Z' });
  assert.equal(nepalDateString('2026-09-19T18:20:00.000Z'), '2026-09-20');
});

test('custom reversed ranges are normalized and BS month starts use BS boundary', () => {
  assert.deepEqual(resolveReportPeriod('custom', { start: '2026-09-20', end: '2026-09-01' }), { start: '2026-09-01', end: '2026-09-20', period: 'custom' });
  const range = resolveReportPeriod('this_month', { calendarSystem: 'BS', now: new Date('2026-09-20T12:00:00+05:45') });
  assert.equal(range.start, bsToAdIso('2083-06-01'));
});

test('display dates follow the salon calendar', async () => {
  const { fmtDate, fmtDateTime, fmtDayNumber } = await import('../../src/lib/dates/display.js');
  assert.equal(fmtDate('2026-09-24', { system: 'AD' }), '24 Sept 2026');
  assert.match(fmtDate('2026-09-24', { system: 'BS' }), /^\d{1,2} Ashwin 2083$/);
  assert.match(fmtDate('2026-09-24', { system: 'BS', year: false, weekday: 'short' }), /^Thu, \d{1,2} Ashwin$/);
  // A timestamp is read in Nepal time: 20:00 UTC on the 23rd is already the 24th in Kathmandu.
  assert.equal(fmtDate('2026-09-23T20:00:00Z', { system: 'AD' }), '24 Sept 2026');
  assert.match(fmtDateTime('2026-09-23T20:00:00Z', { system: 'BS' }), /Ashwin 2083, 1:45 am$/);
  assert.equal(fmtDayNumber('2026-09-24', { system: 'AD' }), '24');
  assert.equal(fmtDate(null), '—');
  assert.equal(fmtDate('not a date'), '—');
});
