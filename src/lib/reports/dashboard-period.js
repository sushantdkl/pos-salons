import { BS_MONTH_NAMES, adToBsParts } from '../dates/calendar.js';
import { getServerCalendarSystem } from '../dates/calendar-setting.js';
import { bsMonthRange } from '../db/postgres-dates.js';
/**
 * THE period vocabulary for Dashboard, Summary, Analytics and Reports. The SQL bounds for each
 * value live in periodBoundsSql (lib/db/postgres-dates.js); this file owns labels and the
 * human-readable date range. 'today' follows the open Business Day where a caller passes one.
 */
export const DASHBOARD_PERIODS = {
  today: { value: 'today', label: 'Today', recentTitle: "Today's Recent Transactions", description: 'Current Business Day (or Nepal calendar day).', startOffsetDays: 0 },
  yesterday: { value: 'yesterday', label: 'Yesterday', recentTitle: "Yesterday's Transactions", description: 'The previous Nepal calendar day.', startOffsetDays: -1, endOffsetDays: -1 },
  '3days': { value: '3days', label: 'Last 3 Days', recentTitle: 'Transactions from the Last 3 Days', description: 'Today plus the previous two Nepal calendar days.', startOffsetDays: -2 },
  '7days': { value: '7days', label: 'Last 7 Days', recentTitle: 'Transactions from the Last 7 Days', description: 'Today plus the previous six Nepal calendar days.', startOffsetDays: -6 },
  '30days': { value: '30days', label: 'Last 30 Days', recentTitle: 'Transactions from the Last 30 Days', description: 'Today plus the previous 29 Nepal calendar days.', startOffsetDays: -29 },
  this_week: { value: 'this_week', label: 'This Week', recentTitle: "This Week's Transactions", description: 'Sunday of this week through today (Nepal week).', startOfWeek: true },
  month: { value: 'month', label: 'This Month', recentTitle: "This Month's Transactions", description: 'First day of the current Nepal month through now.', startOfMonth: true },
  last_month: { value: 'last_month', label: 'Last Month', recentTitle: "Last Month's Transactions", description: 'The whole previous calendar month.', lastMonth: true },
  custom: { value: 'custom', label: 'Custom Range', recentTitle: 'Transactions for the Selected Range', description: 'A custom Nepal calendar date range.', custom: true },
};

export const DASHBOARD_PERIOD_OPTIONS = Object.values(DASHBOARD_PERIODS).map(({ value, label }) => ({ value, label }));

export function resolveDashboardPeriod(value) {
  if (value === 'week') return '7days';
  if (value === 'this_month') return 'month';
  return DASHBOARD_PERIODS[value] ? value : 'today';
}

/** A custom range is only valid when both ends are present and start <= end. */
export function isValidCustomRange(startDate, endDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(endDate || ''))) {
    return false;
  }
  return startDate <= endDate;
}

function partsFromIso(iso) {
  const [year, month, day] = String(iso).slice(0, 10).split('-').map(Number);
  return { year, month, day };
}

export function nepalDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = Number(part.value);
    return acc;
  }, {});
  return { year: parts.year, month: parts.month, day: parts.day };
}

function addCalendarDays(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function displayDate(parts) {
  if (getServerCalendarSystem() === 'BS') {
    try {
      const bs = adToBsParts(isoDate(parts));
      return `${bs.day} ${BS_MONTH_NAMES[bs.month - 1]}`;
    } catch { /* fall back to AD */ }
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
}

export function getDashboardPeriodMeta(periodValue, startDate, endDate) {
  const period = resolveDashboardPeriod(periodValue);
  const meta = DASHBOARD_PERIODS[period];

  if (meta.custom) {
    if (isValidCustomRange(startDate, endDate)) {
      return {
        ...meta,
        value: period,
        startDate,
        endDate,
        displayRange: `${displayDate(partsFromIso(startDate))} - ${displayDate(partsFromIso(endDate))}`,
      };
    }
    // No valid range yet — show a neutral prompt instead of a bogus date span.
    return { ...meta, value: period, displayRange: 'Select a start and end date' };
  }

  const today = nepalDateParts();
  let start;
  let end = today;
  if ((meta.startOfMonth || meta.lastMonth) && getServerCalendarSystem() === 'BS') {
    try {
      const range = bsMonthRange(period);
      start = partsFromIso(range.start);
      end = meta.lastMonth ? partsFromIso(range.end) : today;
    } catch { /* fall back to the AD month below */ }
  }
  if (start) { /* BS month resolved above */ }
  else if (meta.startOfMonth) start = { ...today, day: 1 };
  else if (meta.startOfWeek) {
    const weekday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
    start = addCalendarDays(today, -weekday);
  } else if (meta.lastMonth) {
    const firstThisMonth = { ...today, day: 1 };
    end = addCalendarDays(firstThisMonth, -1);
    start = { ...end, day: 1 };
  } else {
    start = addCalendarDays(today, meta.startOffsetDays || 0);
    if (meta.endOffsetDays) end = addCalendarDays(today, meta.endOffsetDays);
  }

  return {
    ...meta,
    value: period,
    startDate: isoDate(start),
    endDate: isoDate(end),
    displayRange: sameDay(start, end) ? displayDate(start) : `${displayDate(start)} - ${displayDate(end)}`,
  };
}

function isoDate(parts) {
  return [parts.year, String(parts.month).padStart(2, '0'), String(parts.day).padStart(2, '0')].join('-');
}

function sameDay(a, b) {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

export function salonDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
