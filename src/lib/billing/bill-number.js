/**
 * Bill numbers: S-001, S-002 … S-999, then S-1000 and up — short, and still in strict order.
 * The number is the document_sequences counter, so it never repeats or skips. Bills issued
 * before this format keep their original SALON-0000123 number (an issued invoice number is
 * never rewritten).
 */
export function formatBillNumber(value) {
  return `S-${String(Number(value)).padStart(3, '0')}`;
}
