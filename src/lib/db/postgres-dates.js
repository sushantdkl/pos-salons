/** Postgres date filters (replaces SQLite DATE('now', ...) patterns). */

export function reportsBillDateFilter(period, startDate, endDate) {
  if (period === 'today') return { clause: 'created_at::date = CURRENT_DATE', params: [] };
  if (period === 'week') return { clause: "created_at::date >= CURRENT_DATE - INTERVAL '6 days'", params: [] };
  if (period === 'month') return { clause: "created_at::date >= CURRENT_DATE - INTERVAL '29 days'", params: [] };
  if (period === 'custom' && startDate && endDate) {
    return { clause: 'created_at::date BETWEEN ?::date AND ?::date', params: [startDate, endDate] };
  }
  return { clause: 'TRUE', params: [] };
}

export const STAFF_PERF_PERIODS = {
  today: 'b.created_at::date = CURRENT_DATE',
  week: "b.created_at::date >= CURRENT_DATE - INTERVAL '6 days'",
  month: "b.created_at::date >= CURRENT_DATE - INTERVAL '29 days'",
  lifetime: 'TRUE',
};

export function billDateDaysAgo(days) {
  return `created_at::date = CURRENT_DATE - INTERVAL '${days} days'`;
}
