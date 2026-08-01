-- OPTIONAL repair for historical bills whose cash / QR split does not reconcile.
--
-- DO NOT RUN THIS BLIND.
--   1. Run docs/qa/2026-07-31-financial-consistency-diagnostics.sql first.
--   2. Read sections 2, 3, 4 and 5 and decide, bill by bill, which rows are genuinely wrong.
--   3. Put ONLY those confirmed bill IDs in the confirmed_bill_ids list below.
--   4. Run this file once. It is idempotent: re-running it changes nothing further.
--
-- What it does NOT do:
--   * It never invents a discount. A bill whose grand_total disagrees with
--     subtotal - discount (diagnostic section 1) is NOT touched here — that needs a human
--     decision about which figure is right, and guessing would corrupt the sales history.
--   * It never changes grand_total, subtotal or discount_amount. It only redistributes the
--     already-known grand_total across cash_amount / qr_amount according to payment_method,
--     and sets total_paid to the amount actually collected.
--
-- Reporting reads through the same normalisation at query time (see billCashSql / billQrSql
-- in src/lib/reports/finance-summary.js), so reports are already correct without this repair.
-- Run it only if you want the stored columns to match what the reports display.

BEGIN;

WITH confirmed_bill_ids AS (
  -- Replace this list with the IDs you confirmed from the diagnostic output.
  -- Example: SELECT unnest(ARRAY[1234, 1235, 1240]::bigint[]) AS id
  SELECT unnest(ARRAY[]::bigint[]) AS id
),
target AS (
  SELECT b.id,
         b.payment_method,
         b.grand_total,
         b.cash_amount,
         b.qr_amount
  FROM salon_bills b
  JOIN confirmed_bill_ids c ON c.id = b.id
  WHERE LOWER(COALESCE(b.status, '')) IN ('paid', 'completed')
    -- Only rows that actually fail to reconcile are eligible, so a mistaken ID is a no-op.
    AND ABS(COALESCE(b.cash_amount, 0) + COALESCE(b.qr_amount, 0) - COALESCE(b.grand_total, 0)) > 0.01
    -- A split bill has no safe automatic answer unless one side is already recorded,
    -- so split rows are only repaired when exactly one portion is known.
    AND (
      LOWER(COALESCE(b.payment_method, '')) IN ('cash', 'online', 'card')
      OR (
        LOWER(COALESCE(b.payment_method, '')) = 'split'
        AND ((COALESCE(b.cash_amount, 0) > 0) <> (COALESCE(b.qr_amount, 0) > 0))
      )
    )
)
UPDATE salon_bills b
SET cash_amount = CASE
      WHEN LOWER(COALESCE(t.payment_method, '')) = 'cash' THEN t.grand_total
      WHEN LOWER(COALESCE(t.payment_method, '')) IN ('online', 'card') THEN 0
      WHEN COALESCE(t.cash_amount, 0) > 0 THEN t.cash_amount
      ELSE GREATEST(0, t.grand_total - COALESCE(t.qr_amount, 0))
    END,
    qr_amount = CASE
      WHEN LOWER(COALESCE(t.payment_method, '')) = 'cash' THEN 0
      WHEN LOWER(COALESCE(t.payment_method, '')) IN ('online', 'card') THEN t.grand_total
      WHEN COALESCE(t.qr_amount, 0) > 0 THEN t.qr_amount
      ELSE GREATEST(0, t.grand_total - COALESCE(t.cash_amount, 0))
    END,
    total_paid = t.grand_total
FROM target t
WHERE b.id = t.id;

-- Verify before committing: this must return zero rows for the confirmed IDs.
-- SELECT id, payment_method, cash_amount, qr_amount, grand_total
-- FROM salon_bills
-- WHERE ABS(COALESCE(cash_amount, 0) + COALESCE(qr_amount, 0) - COALESCE(grand_total, 0)) > 0.01
--   AND LOWER(COALESCE(status, '')) IN ('paid', 'completed');

COMMIT;
