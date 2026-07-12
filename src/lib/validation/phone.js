export const PHONE_ERROR_MESSAGE = 'Please enter a valid phone number.';

export function normalizePhone(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/[A-Za-z]/.test(raw)) return null;
  if (!/^\+?[0-9\s().-]+$/.test(raw)) return null;

  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00977')) digits = digits.slice(2);
  if (digits.startsWith('977')) digits = digits.slice(3);

  if (!/^(97|98)\d{8}$/.test(digits)) return null;
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
  const digits = raw.replace(/\D/g, '').slice(0, hasPlus ? 13 : 10);
  return hasPlus ? `+${digits}` : digits;
}
