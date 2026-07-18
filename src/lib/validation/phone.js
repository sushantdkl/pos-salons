export const PHONE_ERROR_MESSAGE =
  'Please enter a valid Nepal mobile number (10 digits, starting with 96, 97, or 98).';

/**
 * Nepal mobile numbers are 10 digits.
 * Active / commonly used prefixes:
 * - 98x / 97x: NTC & Ncell (and related ranges)
 * - 96x: Smart Cell ranges still in use with customers (961, 962, 988, etc.)
 */
const NEPAL_MOBILE = /^9[6-8]\d{8}$/;

export function normalizePhone(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/[A-Za-z]/.test(raw)) return null;
  if (!/^\+?[0-9\s().-]+$/.test(raw)) return null;

  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00977')) digits = digits.slice(5);
  if (digits.startsWith('977')) digits = digits.slice(3);
  // Domestic leading zero: 09841234567 → 9841234567
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);

  if (!NEPAL_MOBILE.test(digits)) return null;
  return digits;
}

export function isValidPhone(value) {
  return Boolean(normalizePhone(value));
}

export function phoneOrNull(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  return normalizePhone(raw);
}

export function sanitizePhoneInput(value) {
  const raw = String(value || '');
  const hasPlus = raw.trim().startsWith('+');
  const digits = raw.replace(/\D/g, '').slice(0, hasPlus ? 13 : 11);
  return hasPlus ? `+${digits}` : digits;
}
