-- One-time PostgreSQL migration for existing Salon POS databases.
-- Run this with a database owner/admin account before using split payment billing.
-- Runtime API routes must not execute ALTER TABLE statements on hosted PostgreSQL.

BEGIN;

ALTER TABLE salon_bills
  ADD COLUMN IF NOT EXISTS cash_amount NUMERIC DEFAULT 0;

ALTER TABLE salon_bills
  ADD COLUMN IF NOT EXISTS qr_amount NUMERIC DEFAULT 0;

ALTER TABLE salon_bills
  ADD COLUMN IF NOT EXISTS qr_type TEXT;

ALTER TABLE salon_bills
  ADD COLUMN IF NOT EXISTS total_paid NUMERIC DEFAULT 0;

ALTER TABLE salon_bills
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'paid';

UPDATE salon_bills
SET
  total_paid = COALESCE(NULLIF(total_paid, 0), amount_paid, grand_total, 0),
  cash_amount = CASE
    WHEN payment_method = 'cash' THEN COALESCE(NULLIF(cash_amount, 0), grand_total, 0)
    ELSE COALESCE(cash_amount, 0)
  END,
  qr_amount = CASE
    WHEN payment_method = 'online' THEN COALESCE(NULLIF(qr_amount, 0), grand_total, 0)
    ELSE COALESCE(qr_amount, 0)
  END,
  payment_status = COALESCE(payment_status, 'paid');

COMMIT;
