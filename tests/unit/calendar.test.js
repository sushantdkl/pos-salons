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
