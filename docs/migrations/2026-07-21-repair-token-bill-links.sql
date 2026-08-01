-- Repair safe token-to-bill synchronization issues.
-- Run once in phpPgAdmin or psql after deploying the token billing fix.
-- This does not guess relationships by customer, amount, or token number.
-- It only repairs rows where salon_bills.token_id already points to a real token.

BEGIN;

UPDATE salon_bills
SET is_printed = FALSE
WHERE is_printed IS NULL;

UPDATE walk_in_tokens wt
SET
  status = 'BILLED',
  invoice_id = sb.id,
  billed_at = COALESCE(wt.billed_at, sb.transaction_time, sb.created_at, NOW()),
  updated_at = NOW()
FROM salon_bills sb
WHERE sb.token_id = wt.id
  AND sb.status = 'paid'
  AND (
    wt.status <> 'BILLED'
    OR wt.invoice_id IS DISTINCT FROM sb.id
    OR wt.billed_at IS NULL
  );

COMMIT;

-- Review-only diagnostics:
-- Bills that reference a missing token:
-- SELECT sb.id, sb.bill_number, sb.token_id
-- FROM salon_bills sb
-- LEFT JOIN walk_in_tokens wt ON wt.id = sb.token_id
-- WHERE sb.token_id IS NOT NULL AND wt.id IS NULL;
--
-- Tokens marked billed without a matching paid bill:
-- SELECT wt.id, wt.token_number, wt.invoice_id
-- FROM walk_in_tokens wt
-- LEFT JOIN salon_bills sb ON sb.id = wt.invoice_id AND sb.token_id = wt.id AND sb.status = 'paid'
-- WHERE wt.status = 'BILLED' AND wt.invoice_id IS NOT NULL AND sb.id IS NULL;
