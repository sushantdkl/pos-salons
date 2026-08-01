/** Postgres date filters (replaces SQLite DATE('now', ...) patterns). */

export const BILL_DATE_EXPR = 'COALESCE(transaction_time, created_at)';
export const BILL_DATE_EXPR_B = 'COALESCE(b.transaction_time, b.created_at)';
export const SALON_TIMEZONE = 'Asia/Kathmandu';

export function currentWeekStartSql() {
  return `date_trunc('week', (CURRENT_TIMESTAMP AT TIME ZONE '${SALON_TIMEZONE}'))::date`;
}

export function periodDateFilter(period, startDate, endDate, dateExpression = BILL_DATE_EXPR) {
  const localDate = `((${dateExpression}) AT TIME ZONE '${SALON_TIMEZONE}')::date`;
  const today = `(CURRENT_TIMESTAMP AT TIME ZONE '${SALON_TIMEZONE}')::date`;
  if (period === 'today') return { clause: `${localDate} = ${today}`, params: [] };
  if (period === '3days') return { clause: `${localDate} >= ${today} - INTERVAL '2 days' AND ${localDate} < ${today} + INTERVAL '1 day'`, params: [] };
  if (period === '7days' || period === 'week') return { clause: `${localDate} >= ${today} - INTERVAL '6 days' AND ${localDate} < ${today} + INTERVAL '1 day'`, params: [] };
  if (period === 'month') return { clause: `${localDate} >= date_trunc('month', ${today})::date AND ${localDate} < (date_trunc('month', ${today}) + INTERVAL '1 month')::date`, params: [] };
  if (period === 'custom' && startDate && endDate) {
    return { clause: `${localDate} >= ?::date AND ${localDate} <= ?::date`, params: [startDate, endDate] };
  }
  return { clause: 'TRUE', params: [] };
}

/**
 * Inclusive start / exclusive end Nepal calendar dates for a period, as SQL expressions.
 * These are the same boundaries periodDateFilter uses, exposed separately so a chart can
 * generate one row per calendar day in the range — including days with no sales.
 */
export function periodBoundsSql(period, startDate, endDate) {
  const today = `(CURRENT_TIMESTAMP AT TIME ZONE '${SALON_TIMEZONE}')::date`;
  if (period === 'today') return { startSql: today, endSql: `${today} + INTERVAL '1 day'`, params: [] };
  if (period === '3days') return { startSql: `${today} - INTERVAL '2 days'`, endSql: `${today} + INTERVAL '1 day'`, params: [] };
  if (period === '7days' || period === 'week') return { startSql: `${today} - INTERVAL '6 days'`, endSql: `${today} + INTERVAL '1 day'`, params: [] };
  if (period === 'month') {
    return {
      startSql: `date_trunc('month', ${today})::date`,
      endSql: `(date_trunc('month', ${today}) + INTERVAL '1 month')::date`,
      params: [],
    };
  }
  if (period === 'custom' && startDate && endDate) {
    return { startSql: '?::date', endSql: "?::date + INTERVAL '1 day'", params: [startDate, endDate] };
  }
  return { startSql: today, endSql: `${today} + INTERVAL '1 day'`, params: [] };
}

export function periodDateColumnFilter(period, column, startDate, endDate) {
  const today = `(CURRENT_TIMESTAMP AT TIME ZONE '${SALON_TIMEZONE}')::date`;
  if (period === 'today') return { clause: `${column} = ${today}`, params: [] };
  if (period === '3days') return { clause: `${column} >= ${today} - INTERVAL '2 days' AND ${column} < ${today} + INTERVAL '1 day'`, params: [] };
  if (period === '7days' || period === 'week') return { clause: `${column} >= ${today} - INTERVAL '6 days' AND ${column} < ${today} + INTERVAL '1 day'`, params: [] };
  if (period === 'month') return { clause: `${column} >= date_trunc('month', ${today})::date AND ${column} < date_trunc('month', ${today})::date + INTERVAL '1 month'`, params: [] };
  // A DATE column (expense_date, deposit_date) compares directly to the Nepal calendar dates.
  if (period === 'custom' && startDate && endDate) {
    return { clause: `${column} >= ?::date AND ${column} <= ?::date`, params: [startDate, endDate] };
  }
  return { clause: 'TRUE', params: [] };
}

export function reportsBillDateFilter(period, startDate, endDate) {
  return periodDateFilter(period, startDate, endDate, BILL_DATE_EXPR);
}

export const STAFF_PERF_PERIODS = {
  today: periodDateFilter('today', null, null, BILL_DATE_EXPR_B).clause,
  week: periodDateFilter('week', null, null, BILL_DATE_EXPR_B).clause,
  month: periodDateFilter('month', null, null, BILL_DATE_EXPR_B).clause,
  lifetime: 'TRUE',
};

export function billDateDaysAgo(days) {
  const localDate = `((${BILL_DATE_EXPR}) AT TIME ZONE '${SALON_TIMEZONE}')::date`;
  return `${localDate} = ((CURRENT_TIMESTAMP AT TIME ZONE '${SALON_TIMEZONE}')::date - INTERVAL '${days} days')::date`;
}
