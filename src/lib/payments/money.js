export function toMinor(value, label = 'Amount') {
  if (value === '' || value === null || value === undefined) throw new Error(`${label} is required`);
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a valid number`);
  const minor = Math.round(number * 100);
  if (Math.abs(number * 100 - minor) > 0.000001) throw new Error(`${label} supports at most two decimal places`);
  return minor;
}

export const fromMinor = (value) => Number((Number(value || 0) / 100).toFixed(2));
