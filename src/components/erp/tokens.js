/**
 * ERP semantic tones — colour carries MEANING, never decoration.
 *
 *   inflow   emerald  money in, success, matched
 *   outflow  rose     money out, refunds, shortage
 *   cash     amber    physical cash, drawer, reconciliation, attention
 *   online   sky      online / digital / bank, informational
 *   ledger   indigo   accounting, ledgers, reports
 *   hrm      violet   payroll, staff
 *   ops      teal     services, salon operations
 *   neutral  stone    context values
 *
 * Every class string is a static literal so Tailwind keeps it. `hex` feeds charts.
 */
export const TONES = {
  inflow: { text: 'text-emerald-700', strong: 'text-emerald-800', soft: 'bg-emerald-50', band: 'bg-emerald-50/70', border: 'border-emerald-200', ring: 'ring-emerald-200', dot: 'bg-emerald-500', hex: '#059669' },
  outflow: { text: 'text-rose-700', strong: 'text-rose-800', soft: 'bg-rose-50', band: 'bg-rose-50/70', border: 'border-rose-200', ring: 'ring-rose-200', dot: 'bg-rose-500', hex: '#e11d48' },
  cash: { text: 'text-amber-700', strong: 'text-amber-800', soft: 'bg-amber-50', band: 'bg-amber-50/70', border: 'border-amber-200', ring: 'ring-amber-200', dot: 'bg-amber-500', hex: '#d97706' },
  online: { text: 'text-sky-700', strong: 'text-sky-800', soft: 'bg-sky-50', band: 'bg-sky-50/70', border: 'border-sky-200', ring: 'ring-sky-200', dot: 'bg-sky-500', hex: '#0284c7' },
  ledger: { text: 'text-indigo-700', strong: 'text-indigo-800', soft: 'bg-indigo-50', band: 'bg-indigo-50/70', border: 'border-indigo-200', ring: 'ring-indigo-200', dot: 'bg-indigo-500', hex: '#4f46e5' },
  hrm: { text: 'text-violet-700', strong: 'text-violet-800', soft: 'bg-violet-50', band: 'bg-violet-50/70', border: 'border-violet-200', ring: 'ring-violet-200', dot: 'bg-violet-500', hex: '#7c3aed' },
  ops: { text: 'text-teal-700', strong: 'text-teal-800', soft: 'bg-teal-50', band: 'bg-teal-50/70', border: 'border-teal-200', ring: 'ring-teal-200', dot: 'bg-teal-500', hex: '#0d9488' },
  neutral: { text: 'text-stone-700', strong: 'text-stone-900', soft: 'bg-stone-50', band: 'bg-stone-50', border: 'border-stone-200', ring: 'ring-stone-200', dot: 'bg-stone-400', hex: '#78716c' },
};

export function tone(name) {
  return TONES[name] || TONES.neutral;
}

/** Categorical chart palette — distinct hues, ordered for adjacent contrast. */
export const CHART_SERIES = ['#0d9488', '#4f46e5', '#d97706', '#e11d48', '#0284c7', '#7c3aed', '#65a30d', '#78716c'];

/** Shared status vocabulary: one label and one tone per status, everywhere. */
export const STATUS = {
  OPEN: { label: 'Open', tone: 'inflow' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
  CLOSED_SAME_DAY: { label: 'Closed · same day', tone: 'cash' },
  NO_DAY: { label: 'No business day', tone: 'neutral' },
  MATCHED: { label: 'Matched', tone: 'inflow' },
  SHORT: { label: 'Short', tone: 'outflow' },
  OVER: { label: 'Over', tone: 'cash' },
  PENDING: { label: 'Pending count', tone: 'neutral' },
  PAID: { label: 'Paid', tone: 'inflow' },
  CANCELLED: { label: 'Voided', tone: 'outflow' },
  ESTIMATED: { label: 'Estimated', tone: 'cash' },
  ACTUAL: { label: 'Actual', tone: 'inflow' },
};

const moneyFormatter = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const countFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

function toNumber(value) {
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** "Rs 3,497.50" — Nepali/Indian digit grouping; never "Rs NaN". */
export function money(value) {
  const amount = toNumber(value);
  const text = moneyFormatter.format(Math.abs(amount));
  return amount < 0 ? `-Rs ${text}` : `Rs ${text}`;
}

/** Compact money for chart axes: Rs 1.2L / Rs 45K. */
export function moneyShort(value) {
  const amount = toNumber(value);
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 10000000) return `${sign}Rs ${(abs / 10000000).toFixed(1)}Cr`;
  if (abs >= 100000) return `${sign}Rs ${(abs / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `${sign}Rs ${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}K`;
  return `${sign}Rs ${abs.toFixed(0)}`;
}

export function count(value) {
  return countFormatter.format(toNumber(value));
}

export function percent(value, digits = 1) {
  return `${toNumber(value).toFixed(digits)}%`;
}

export function toNum(value) {
  return toNumber(value);
}
