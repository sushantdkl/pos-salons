-- Final production sync enhancements for existing cPanel PostgreSQL databases.
-- Run once through phpPgAdmin or psql. Do not execute DDL during normal app requests.

BEGIN;

ALTER TABLE salon_bill_items
  ADD COLUMN IF NOT EXISTS staff_name_snapshot TEXT;

ALTER TABLE salon_bills
  ADD COLUMN IF NOT EXISTS backdated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS backdated_reason TEXT;

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS record_type TEXT DEFAULT 'EXPENSE';

ALTER TABLE expenses
  DROP CONSTRAINT IF EXISTS expenses_record_type_check;

ALTER TABLE expenses
  ADD CONSTRAINT expenses_record_type_check
  CHECK (record_type IN ('EXPENSE', 'CASH_TRANSFER'));

UPDATE expenses
SET record_type = CASE
  WHEN category = 'DAILY_SAVING' THEN 'CASH_TRANSFER'
  ELSE COALESCE(record_type, 'EXPENSE')
END
WHERE record_type IS NULL OR category = 'DAILY_SAVING';

UPDATE salon_bill_items i
SET staff_name_snapshot = COALESCE(NULLIF(sp.display_name, ''), u.full_name)
FROM users u
LEFT JOIN staff_profiles sp ON sp.user_id = u.id
WHERE i.staff_id = u.id
  AND (i.staff_name_snapshot IS NULL OR i.staff_name_snapshot = '');

INSERT INTO salon_services (
  name, category, price, duration_minutes, description,
  is_active, is_package, show_on_website, featured_on_website, website_description
)
SELECT
  'Haircut + Wash',
  'Haircut',
  200,
  30,
  'Haircut with hair wash.',
  TRUE,
  FALSE,
  TRUE,
  TRUE,
  'Haircut with hair wash.'
WHERE NOT EXISTS (
  SELECT 1 FROM salon_services WHERE lower(name) = lower('Haircut + Wash')
);

CREATE INDEX IF NOT EXISTS idx_bills_transaction_time_status ON salon_bills(transaction_time, status);
CREATE INDEX IF NOT EXISTS idx_bills_cashier_date ON salon_bills(cashier_id, transaction_time);
CREATE INDEX IF NOT EXISTS idx_bills_token_status ON salon_bills(token_id, status);
CREATE INDEX IF NOT EXISTS idx_bill_items_staff_service ON salon_bill_items(staff_id, item_type);
CREATE INDEX IF NOT EXISTS idx_expenses_created_by_date ON expenses(created_by, expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_record_type_date ON expenses(record_type, expense_date);

COMMIT;
