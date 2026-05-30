export function sanitizeText(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value)
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 500);
}

export function toPositiveNumber(value, fieldName) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${fieldName} must be zero or greater`);
  }
  return number;
}

export function toPositiveInteger(value, fieldName) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${fieldName} must be a positive whole number`);
  }
  return number;
}
