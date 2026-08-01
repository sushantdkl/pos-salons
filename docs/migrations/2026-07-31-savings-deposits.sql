-- Savings / deposit tracking, kept separate from operating expenses.
-- Run once through phpPgAdmin or psql. Do not execute DDL during normal app requests.
--
-- What this does:
--   1. Creates the savings_deposits table (Bank Deposit / Sahakari Deposit / Other Saving).
--   2. Adds the indexes the savings page and financial summaries rely on.
--   3. Imports legacy savings that were stored inside `expenses` as record_type = 'CASH_TRANSFER'
--      into savings_deposits. The source expense rows are LEFT UNTOUCHED — every reporting query
--      already excludes record_type = 'CASH_TRANSFER' from operating expenses, so nothing is
--      double-counted. The import is idempotent through legacy_expense_id.

BEGIN;

CREATE TABLE IF NOT EXISTS savings_deposits (
  id BIGSERIAL PRIMARY KEY,
  deposit_type TEXT NOT NULL CHECK (deposit_type IN ('BANK_DEPOSIT', 'SAHAKARI_DEPOSIT', 'OTHER_SAVING')),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  source_account TEXT NOT NULL CHECK (source_account IN ('CASH', 'ESEWA_PHONEPAY', 'BANK_QR', 'OTHER_ONLINE')),
  institution_name TEXT,
  reference_number TEXT,
  notes TEXT,
  deposit_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANCELLED')),
  legacy_expense_id BIGINT REFERENCES expenses(id) ON DELETE SET NULL,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  cancelled_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_savings_deposit_date ON savings_deposits(deposit_date);
CREATE INDEX IF NOT EXISTS idx_savings_type_date ON savings_deposits(deposit_type, deposit_date);
CREATE INDEX IF NOT EXISTS idx_savings_source_date ON savings_deposits(source_account, deposit_date);
CREATE INDEX IF NOT EXISTS idx_savings_status_date ON savings_deposits(status, deposit_date);
CREATE INDEX IF NOT EXISTS idx_savings_created_by_date ON savings_deposits(created_by, deposit_date);

-- Duplicate-submission guard is enforced in the API inside the write transaction
-- (identical creator + type + source + amount + date within a short window), because a salon can
-- legitimately record two identical deposits on the same day.

-- One savings_deposits row per imported legacy expense row.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_savings_legacy_expense
  ON savings_deposits (legacy_expense_id)
  WHERE legacy_expense_id IS NOT NULL;

-- Import legacy DAILY_SAVING / CASH_TRANSFER expense rows.
INSERT INTO savings_deposits (
  deposit_type, amount, source_account, institution_name, reference_number,
  notes, deposit_date, status, legacy_expense_id, created_by, updated_by, created_at, updated_at
)
SELECT
  'OTHER_SAVING',
  e.amount,
  CASE
    WHEN e.payment_method = 'cash' THEN 'CASH'
    WHEN e.payment_method = 'bank_transfer' THEN 'BANK_QR'
    WHEN e.payment_method = 'online' THEN 'OTHER_ONLINE'
    ELSE 'CASH'
  END,
  NULLIF(e.paid_to, ''),
  NULLIF(e.reference_number, ''),
  NULLIF(CONCAT_WS(' | ', NULLIF(e.title, ''), NULLIF(e.notes, ''), 'Imported from expenses record ' || e.id::text), ''),
  e.expense_date,
  CASE WHEN e.deleted_at IS NULL THEN 'ACTIVE' ELSE 'CANCELLED' END,
  e.id,
  e.created_by,
  e.updated_by,
  e.created_at,
  NOW()
FROM expenses e
WHERE COALESCE(e.record_type, 'EXPENSE') = 'CASH_TRANSFER'
  AND e.amount > 0
  AND NOT EXISTS (
    SELECT 1 FROM savings_deposits s WHERE s.legacy_expense_id = e.id
  );

COMMIT;
