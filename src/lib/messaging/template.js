/**
 * Reminder message templates. Pure functions (no imports) so they are unit-testable.
 *
 * Placeholders: {name} customer name · {salon} salon name · {amount} credit due ·
 * {service} chosen service · {staff} chosen stylist. Unknown placeholders are left as typed;
 * a placeholder with no value (e.g. {service} when none is chosen) is removed cleanly.
 */

export const DEFAULT_REMINDER_TEMPLATE = 'Namaste {name}, this is a friendly reminder from {salon}. We look forward to seeing you.';
export const CREDIT_REMINDER_TEMPLATE = 'Namaste {name}, this is a friendly reminder from {salon} that Rs {amount} is due on your account. Thank you!';
export const TEMPLATE_PLACEHOLDERS = ['{name}', '{salon}', '{amount}', '{service}', '{staff}'];

function formatAmount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return number.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fillMessageTemplate(template, values = {}) {
  const map = {
    name: String(values.name || '').trim(),
    salon: String(values.salon || '').trim(),
    amount: values.amount === undefined || values.amount === null || values.amount === '' ? '' : formatAmount(values.amount),
    service: String(values.service || '').trim(),
    staff: String(values.staff || '').trim(),
  };
  return String(template || '')
    .replace(/\{(name|salon|amount|service|staff)\}/g, (_, key) => map[key])
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([,.!?])/g, '$1')
    .trim();
}
