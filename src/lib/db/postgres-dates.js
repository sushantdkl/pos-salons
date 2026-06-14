/** Postgres date filters (replaces SQLite DATE('now', ...) patterns). */

export const BILL_DATE_EXPR = 'COALESCE(transaction_time, created_at)';
export const BILL_DATE_EXPR_B = 'COALESCE(b.transaction_time, b.created_at)';

export function currentWeekStartSql() {
  return "(date_trunc('week', CURRENT_DATE + INTERVAL '1 day') - INTERVAL '1 day')::date";
}

export function periodDateFilter(period, startDate, endDate, dateExpression = BILL_DATE_EXPR) {
  const expression = `(${dateExpression})`;
  if (period === 'today') return { clause: `${expression} >= CURRENT_DATE AND ${expression} < CURRENT_DATE + INTERVAL '1 day'`, params: [] };
  if (period === 'week') return { clause: `${expression} >= ${currentWeekStartSql()} AND ${expression} < ${currentWeekStartSql()} + INTERVAL '7 days'`, params: [] };
  if (period === 'month') return { clause: `${expression} >= date_trunc('month', CURRENT_DATE) AND ${expression} < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'`, params: [] };
  if (period === 'custom' && startDate && endDate) {
    return { clause: `${expression} >= ?::date AND ${expression} < (?::date + INTERVAL '1 day')`, params: [startDate, endDate] };
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
  return `(${BILL_DATE_EXPR}) >= CURRENT_DATE - INTERVAL '${days} days' AND (${BILL_DATE_EXPR}) < CURRENT_DATE - INTERVAL '${days} days' + INTERVAL '1 day'`;
}
