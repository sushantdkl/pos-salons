/**
 * Commission, product cost and profit are owner information. A non-admin sees them in reports
 * only when Staff Permissions grants “Show commission, cost & profit in reports”; otherwise the
 * fields are removed from the payload itself (hiding a column in the page would not be enough).
 */
const SENSITIVE_KEY = /commission|profit|(^|_)cost($|_)|^cost|margin/i;

export const SENSITIVE_REPORT_FIELDS = ['commission', 'cost', 'profit', 'gross_profit', 'commission_amount', 'margin'];

export function isSensitiveReportField(key) {
  return SENSITIVE_KEY.test(String(key));
}

/** Deep copy without any commission / cost / profit field. */
export function redactReport(value) {
  if (Array.isArray(value)) return value.map(redactReport);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !isSensitiveReportField(key))
    .map(([key, inner]) => [key, redactReport(inner)]));
}
