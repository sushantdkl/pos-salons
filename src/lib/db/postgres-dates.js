/** Postgres date filters (replaces SQLite DATE('now', ...) patterns). */
import { adToBsParts, bsDaysInMonth, bsToAdIso, nepalDateString } from '../dates/calendar.js';
import { getServerCalendarSystem } from '../dates/calendar-setting.js';

export const BILL_DATE_EXPR = 'COALESCE(transaction_time, created_at)';
export const BILL_DATE_EXPR_B = 'COALESCE(b.transaction_time, b.created_at)';
export const SALON_TIMEZONE = 'Asia/Kathmandu';

const TODAY = `(CURRENT_TIMESTAMP AT TIME ZONE '${SALON_TIMEZONE}')::date`;

export function currentWeekStartSql() {
  return `date_trunc('week', (CURRENT_TIMESTAMP AT TIME ZONE '${SALON_TIMEZONE}'))::date`;
}

/**
 * THE period definition: inclusive start / exclusive end Nepal calendar dates as SQL.
 * Every period filter in the app (bill timestamps, DATE columns, chart buckets) is derived
 * from this one function, so no two screens can disagree on what "This Week" means.
 *
 *   today · yesterday · 3days · 7days (alias week) · 30days
 *   this_week  Sunday -> today (the Nepal working week starts on Sunday)
 *   month      1st of this month -> end of month (the BS month when Settings → Calendar is BS)
 *   last_month the whole previous calendar month (BS or AD, same rule)
 *   custom     startDate..endDate inclusive
 */
/**
 * BS month bounds (inclusive AD start / end) for 'month' and 'last_month' when Settings →
 * Calendar is BS. The dates are computed here and inlined as validated literals.
 */
export function bsMonthRange(period, today = nepalDateString()) {
  const now = adToBsParts(today);
  let { year, month } = now;
  if (period === 'last_month') { month -= 1; if (month === 0) { month = 12; year -= 1; } }
  const pad = (value) => String(value).padStart(2, '0');
  return { start: bsToAdIso(`${year}-${pad(month)}-01`), end: bsToAdIso(`${year}-${pad(month)}-${pad(bsDaysInMonth(year, month))}`) };
}

const literalDate = (iso) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error('Invalid period date');
  return `'${iso}'::date`;
};

export function periodBoundsSql(period, startDate, endDate) {
  if ((period === 'month' || period === 'last_month') && getServerCalendarSystem() === 'BS') {
    try {
      const range = bsMonthRange(period);
      return { startSql: literalDate(range.start), endSql: `(${literalDate(range.end)} + INTERVAL '1 day')::date`, params: [] };
    } catch { /* outside the BS table: fall back to the AD month */ }
  }
  const days = (n) => ({ startSql: `(${TODAY} - INTERVAL '${n} days')::date`, endSql: `(${TODAY} + INTERVAL '1 day')::date`, params: [] });
  switch (period) {
    case 'yesterday':
      return { startSql: `(${TODAY} - INTERVAL '1 day')::date`, endSql: TODAY, params: [] };
    case '3days':
      return days(2);
    case '7days':
    case 'week':
      return days(6);
    case '30days':
      return days(29);
    case 'this_week':
      return { startSql: `(${TODAY} - EXTRACT(DOW FROM ${TODAY})::int)`, endSql: `(${TODAY} + INTERVAL '1 day')::date`, params: [] };
    case 'month':
      return { startSql: `date_trunc('month', ${TODAY})::date`, endSql: `(date_trunc('month', ${TODAY}) + INTERVAL '1 month')::date`, params: [] };
    case 'last_month':
      return { startSql: `(date_trunc('month', ${TODAY}) - INTERVAL '1 month')::date`, endSql: `date_trunc('month', ${TODAY})::date`, params: [] };
    case 'custom':
      if (startDate && endDate) return { startSql: '?::date', endSql: "(?::date + INTERVAL '1 day')::date", params: [startDate, endDate] };
      return { startSql: TODAY, endSql: `(${TODAY} + INTERVAL '1 day')::date`, params: [] };
    case 'today':
    default:
      return { startSql: TODAY, endSql: `(${TODAY} + INTERVAL '1 day')::date`, params: [] };
  }
}

/** Filter on a DATE-valued SQL expression (a DATE column or a Nepal-date cast). */
export function periodDateColumnFilter(period, column, startDate, endDate) {
  const bounds = periodBoundsSql(period, startDate, endDate);
  return { clause: `${column} >= ${bounds.startSql} AND ${column} < ${bounds.endSql}`, params: bounds.params };
}

/** Filter on a TIMESTAMPTZ expression, compared on its Nepal calendar date. */
export function periodDateFilter(period, startDate, endDate, dateExpression = BILL_DATE_EXPR) {
  return periodDateColumnFilter(period, `((${dateExpression}) AT TIME ZONE '${SALON_TIMEZONE}')::date`, startDate, endDate);
}

export function reportsBillDateFilter(period, startDate, endDate) {
  return periodDateFilter(period, startDate, endDate, BILL_DATE_EXPR);
}

// Getters so "month" follows the calendar setting at query time (BS or AD).
export const STAFF_PERF_PERIODS = {
  get today() { return periodDateFilter('today', null, null, BILL_DATE_EXPR_B).clause; },
  get week() { return periodDateFilter('week', null, null, BILL_DATE_EXPR_B).clause; },
  get month() { return periodDateFilter('month', null, null, BILL_DATE_EXPR_B).clause; },
  lifetime: 'TRUE',
};

export function billDateDaysAgo(days) {
  const localDate = `((${BILL_DATE_EXPR}) AT TIME ZONE '${SALON_TIMEZONE}')::date`;
  return `${localDate} = ((CURRENT_TIMESTAMP AT TIME ZONE '${SALON_TIMEZONE}')::date - INTERVAL '${days} days')::date`;
}
