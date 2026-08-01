export const DASHBOARD_PERIODS = {
  today: {
    value: 'today',
    label: 'Today',
    recentTitle: "Today's Recent Transactions",
    description: 'Current Nepal calendar day through now.',
    startOffsetDays: 0,
  },
  '3days': {
    value: '3days',
    label: 'Last 3 Days',
    recentTitle: 'Transactions from the Last 3 Days',
    description: 'Today plus the previous two Nepal calendar days.',
    startOffsetDays: -2,
  },
  '7days': {
    value: '7days',
    label: 'Last 7 Days',
    recentTitle: 'Transactions from the Last 7 Days',
    description: 'Today plus the previous six Nepal calendar days.',
    startOffsetDays: -6,
  },
  month: {
    value: 'month',
    label: 'This Month',
    recentTitle: "This Month's Transactions",
    description: 'First day of the current Nepal month through now.',
    startOfMonth: true,
  },
  custom: {
    value: 'custom',
    label: 'Custom Range',
    recentTitle: 'Transactions for the Selected Range',
    description: 'A custom Nepal calendar date range.',
    custom: true,
  },
};

export const DASHBOARD_PERIOD_OPTIONS = Object.values(DASHBOARD_PERIODS).map(({ value, label }) => ({ value, label }));

export function resolveDashboardPeriod(value) {
  if (value === 'week') return '7days';
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
  const start = meta.startOfMonth ? { ...today, day: 1 } : addCalendarDays(today, meta.startOffsetDays || 0);

  return {
    ...meta,
    value: period,
    displayRange: `${displayDate(start)} - ${displayDate(today)}`,
  };
}

export function salonDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
