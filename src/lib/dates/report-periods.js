import { adToBsParts, bsDaysInMonth, bsToAdIso, nepalDateString, normalizeCalendarSystem } from './calendar.js';

const shift = (date, days) => {
  const value = new Date(`${date}T12:00:00+05:45`);
  value.setUTCDate(value.getUTCDate() + days);
  return nepalDateString(value);
};

export function resolveReportPeriod(period = 'today', options = {}) {
  const calendar = normalizeCalendarSystem(options.calendarSystem);
  const today = nepalDateString(options.now || new Date());
  if (period === 'custom') {
    if (!options.start || !options.end) throw new Error('Custom range requires start and end dates');
    return { start: options.start <= options.end ? options.start : options.end, end: options.start <= options.end ? options.end : options.start, period };
  }
  if (period === 'yesterday') return { start: shift(today, -1), end: shift(today, -1), period };
  const rolling = { last3: 3, last7: 7, last30: 30 }[period];
  if (rolling) return { start: shift(today, -(rolling - 1)), end: today, period };
  if (period === 'this_week') {
    const weekday = new Date(`${today}T12:00:00+05:45`).getUTCDay();
    const offset = calendar === 'BS' ? (weekday + 1) % 7 : (weekday + 6) % 7;
    return { start: shift(today, -offset), end: today, period };
  }
  if (period === 'this_month' || period === 'last_month') {
    if (calendar === 'BS') {
      const now = adToBsParts(today);
      let year = now.year;
      let month = now.month;
      if (period === 'last_month') { month -= 1; if (month === 0) { month = 12; year -= 1; } }
      return { start: bsToAdIso(`${year}-${String(month).padStart(2, '0')}-01`), end: period === 'this_month' ? today : bsToAdIso(`${year}-${String(month).padStart(2, '0')}-${bsDaysInMonth(year, month)}`), period };
    }
    if (period === 'this_month') return { start: `${today.slice(0, 7)}-01`, end: today, period };
    const end = shift(`${today.slice(0, 7)}-01`, -1);
    return { start: `${end.slice(0, 7)}-01`, end, period };
  }
  if (period === 'quarter') {
    if (calendar === 'BS') {
      const now = adToBsParts(today); const month = Math.floor((now.month - 1) / 3) * 3 + 1;
      return { start: bsToAdIso(`${now.year}-${String(month).padStart(2, '0')}-01`), end: today, period };
    }
    const [year, month] = today.split('-').map(Number);
    return { start: `${year}-${String(Math.floor((month - 1) / 3) * 3 + 1).padStart(2, '0')}-01`, end: today, period };
  }
  if (period === 'year') return { start: calendar === 'BS' ? bsToAdIso(`${adToBsParts(today).year}-01-01`) : `${today.slice(0, 4)}-01-01`, end: today, period };
  return { start: today, end: today, period: 'today' };
}

export function nepalRangeUtcBounds(start, end = start) {
  const startDate = new Date(`${start}T00:00:00+05:45`);
  const endDate = new Date(`${end}T00:00:00+05:45`);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  return { startUtc: startDate.toISOString(), endUtcExclusive: endDate.toISOString() };
}
