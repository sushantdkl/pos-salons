/** Postgres date filters (replaces SQLite DATE('now', ...) patterns). */

export const BILL_DATE_EXPR = 'COALESCE(transaction_time, created_at)';
export const BILL_DATE_EXPR_B = 'COALESCE(b.transaction_time, b.created_at)';
export const SALON_TIMEZONE = 'Asia/Kathmandu';

export function currentWeekStartSql() {
  return `(date_trunc('week', ((CURRENT_TIMESTAMP AT TIME ZONE '${SALON_TIMEZONE}')::date + INTERVAL '1 day')) - INTERVAL '1 day')::date`;
}

export function periodDateFilter(period, startDate, endDate, dateExpression = BILL_DATE_EXPR) {
  const localDate = `((${dateExpression}) AT TIME ZONE '${SALON_TIMEZONE}')::date`;
  const today = `(CURRENT_TIMESTAMP AT TIME ZONE '${SALON_TIMEZONE}')::date`;
  if (period === 'today') return { clause: `${localDate} = ${today}`, params: [] };
  if (period === 'week') return { clause: `${localDate} >= ${currentWeekStartSql()} AND ${localDate} < ${currentWeekStartSql()} + INTERVAL '7 days'`, params: [] };
  if (period === 'month') return { clause: `${localDate} >= date_trunc('month', ${today})::date AND ${localDate} < (date_trunc('month', ${today}) + INTERVAL '1 month')::date`, params: [] };
  if (period === 'custom' && startDate && endDate) {
    return { clause: `${localDate} >= ?::date AND ${localDate} <= ?::date`, params: [startDate, endDate] };
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
