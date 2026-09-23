-- Production foundations for permissions, canonical payment allocations,
-- customer credit, immutable corrections, document snapshots and advance controls.
-- Forward-only and safe for existing rows. Apply before the matching application code.
BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  checksum TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role TEXT NOT NULL CHECK (role IN ('cashier', 'barber', 'stylist', 'beautician')),
  permission_key TEXT NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role, permission_key)
);

CREATE TABLE IF NOT EXISTS permission_audit (
  id BIGSERIAL PRIMARY KEY,
  role TEXT NOT NULL,
  permission_key TEXT NOT NULL,
  previous_value BOOLEAN,
  new_value BOOLEAN NOT NULL,
  actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO role_permissions (role, permission_key, allowed) VALUES
  ('cashier', 'billing.create', TRUE),
  ('cashier', 'billing.credit.create', TRUE),
  ('cashier', 'billing.credit.override', FALSE),
  ('cashier', 'billing.correct', FALSE),
  ('cashier', 'reports.view', TRUE),
  ('cashier', 'payroll.view', TRUE),
  ('cashier', 'payroll.advances.create', TRUE),
  ('cashier', 'payroll.payments.create', FALSE),
  ('cashier', 'payroll.records.correct', FALSE),
  ('cashier', 'payroll.records.delete', FALSE)
ON CONFLICT (role, permission_key) DO NOTHING;

ALTER TABLE salon_bills ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE salon_bills ADD COLUMN IF NOT EXISTS credit_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE salon_bills ADD COLUMN IF NOT EXISTS document_snapshot JSONB;
ALTER TABLE salon_bill_items ADD COLUMN IF NOT EXISTS unit_cost_snapshot NUMERIC(14,2);
CREATE UNIQUE INDEX IF NOT EXISTS ux_salon_bills_idempotency
  ON salon_bills(idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE salon_bills DROP CONSTRAINT IF EXISTS salon_bills_payment_method_check;
ALTER TABLE salon_bills ADD CONSTRAINT salon_bills_payment_method_check
  CHECK (payment_method IN ('cash', 'card', 'online', 'credit', 'split'));

CREATE TABLE IF NOT EXISTS salon_payment_allocations (
  id BIGSERIAL PRIMARY KEY,
  bill_id BIGINT NOT NULL REFERENCES salon_bills(id) ON DELETE RESTRICT,
  method TEXT NOT NULL CHECK (method IN ('cash', 'online', 'credit')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  provider TEXT,
  reference_number TEXT,
  cash_tendered NUMERIC(14,2),
  change_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (change_amount >= 0),
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  business_day_id BIGINT REFERENCES business_days(id) ON DELETE SET NULL,
  store_session_id BIGINT REFERENCES store_sessions(id) ON DELETE SET NULL,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (method = 'cash' OR cash_tendered IS NULL),
  CHECK (method <> 'cash' OR cash_tendered >= amount)
);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_bill ON salon_payment_allocations(bill_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_day_method ON salon_payment_allocations(business_day_id, method);

CREATE TABLE IF NOT EXISTS customer_credit_ledger (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  bill_id BIGINT REFERENCES salon_bills(id) ON DELETE RESTRICT,
  allocation_id BIGINT REFERENCES salon_payment_allocations(id) ON DELETE RESTRICT,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('credit_sale', 'credit_collection', 'writeoff', 'reversal')),
  debit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  due_date DATE,
  note TEXT,
  business_day_id BIGINT REFERENCES business_days(id) ON DELETE SET NULL,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);
CREATE INDEX IF NOT EXISTS idx_customer_credit_customer_date ON customer_credit_ledger(customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS financial_corrections (
  id BIGSERIAL PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id BIGINT NOT NULL,
  correction_type TEXT NOT NULL CHECK (correction_type IN ('void', 'refund', 'payment_reversal', 'advance_reversal', 'payroll_reversal')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  metadata JSONB,
  business_day_id BIGINT REFERENCES business_days(id) ON DELETE SET NULL,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_financial_corrections_source ON financial_corrections(source_type, source_id);

CREATE TABLE IF NOT EXISTS document_sequences (
  document_type TEXT PRIMARY KEY,
  next_value BIGINT NOT NULL CHECK (next_value > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO document_sequences(document_type, next_value) VALUES ('salon_bill', 1)
ON CONFLICT (document_type) DO NOTHING;

ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS payroll_period_start DATE;
ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS payroll_period_end DATE;
ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS eligible_salary_snapshot NUMERIC(14,2);
ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS ceiling_percent_snapshot NUMERIC(5,2);
ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS source_identifier TEXT;
ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS reversed_by_correction_id BIGINT REFERENCES financial_corrections(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_salary_advances_idempotency
  ON salary_advances(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_advance_application_pair
  ON salary_advance_applications(advance_id, salary_payment_id);

INSERT INTO system_settings(setting_key, setting_value) VALUES
  ('calendar_system', 'AD'),
  ('business_timezone', 'Asia/Kathmandu'),
  ('receipt_paper_size', '80'),
  ('statement_paper_size', 'a4'),
  ('advance_ceiling_percent', ''),
  ('advance_eligible_basis', 'base_salary')
ON CONFLICT (setting_key) DO NOTHING;

COMMIT;
