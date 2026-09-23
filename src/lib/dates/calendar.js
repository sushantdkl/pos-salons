import bikramSambat from 'bikram-sambat';

export const NEPAL_TIME_ZONE = 'Asia/Kathmandu';
export const BS_MONTH_NAMES = ['Baisakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];
const pad = (value) => String(value).padStart(2, '0');

export function normalizeCalendarSystem(value) {
  return String(value || '').toUpperCase() === 'BS' ? 'BS' : 'AD';
}

export function isCanonicalAdDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() + 1 === m && date.getUTCDate() === d;
}

export function adToBsParts(adDate) {
  if (!isCanonicalAdDate(adDate)) throw new Error('Invalid AD date');
  return bikramSambat.toBik(adDate);
}

export function adToBsIso(adDate) {
  const value = adToBsParts(adDate);
  return `${value.year}-${pad(value.month)}-${pad(value.day)}`;
}

export function bsDaysInMonth(year, month) {
  return bikramSambat.daysInMonth(Number(year), Number(month));
}

export function isValidBsDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return false;
  try {
    const [, y, m, d] = match.map(Number);
    return m >= 1 && m <= 12 && d >= 1 && d <= bsDaysInMonth(y, m);
  } catch { return false; }
}

export function bsToAdIso(value) {
  if (!isValidBsDate(value)) throw new Error('Invalid BS date');
  return bikramSambat.toGreg_text(...value.split('-').map(Number));
}

export function nepalDateString(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date');
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: NEPAL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

export function canonicalDateInput(value, calendarSystem = 'AD') {
  if (normalizeCalendarSystem(calendarSystem) === 'BS') return bsToAdIso(value);
  if (!isCanonicalAdDate(value)) throw new Error('Invalid AD date');
  return value;
}

export function formatCalendarDate(value, calendarSystem = 'AD') {
  const ad = isCanonicalAdDate(value) ? value : nepalDateString(value);
  if (normalizeCalendarSystem(calendarSystem) === 'BS') return `${adToBsIso(ad)} BS`;
  const [y, m, d] = ad.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' });
}
