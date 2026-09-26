/**
 * Nepali rupee notes counted at Close Store, largest first. Shared by the counting UI and the
 * server, which re-derives the counted total from the breakdown — the browser's sum is never
 * trusted for a financial record.
 */
export const CASH_DENOMINATIONS = [1000, 500, 100, 50, 20, 10, 5, 1];

const MAX_NOTES = 100000;

export function emptyDenominations() {
  return Object.fromEntries(CASH_DENOMINATIONS.map((value) => [String(value), '']));
}

/** Total of a { "1000": 3, ... } map, in rupees. Blank / invalid counts are zero. */
export function denominationTotal(counts) {
  if (!counts || typeof counts !== 'object') return 0;
  return CASH_DENOMINATIONS.reduce((sum, value) => {
    const quantity = Number(counts[value] ?? counts[String(value)] ?? 0);
    return sum + (Number.isInteger(quantity) && quantity > 0 ? quantity * value : 0);
  }, 0);
}

/**
 * Validate a submitted breakdown. Returns null when none was supplied, otherwise
 * { counts, total } with every denomination present as a whole, non-negative number.
 */
export function normalizeDenominations(input) {
  if (input === undefined || input === null || input === '') return null;
  if (typeof input !== 'object' || Array.isArray(input)) {
    const error = new Error('Cash denominations must be a note count per denomination.');
    error.status = 400;
    throw error;
  }
  const allowed = new Set(CASH_DENOMINATIONS.map(String));
  for (const key of Object.keys(input)) {
    if (!allowed.has(String(key))) {
      const error = new Error(`Unknown denomination: Rs ${key}`);
      error.status = 400;
      throw error;
    }
  }
  const counts = {};
  for (const value of CASH_DENOMINATIONS) {
    const raw = input[value] ?? input[String(value)];
    const quantity = raw === '' || raw === undefined || raw === null ? 0 : Number(raw);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_NOTES) {
      const error = new Error(`Enter a whole number of Rs ${value} notes.`);
      error.status = 400;
      throw error;
    }
    counts[String(value)] = quantity;
  }
  return { counts, total: denominationTotal(counts) };
}
