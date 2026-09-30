-- Commission-based staff, advances against earned commission, owner-managed expense
-- categories, and the Cash In / Cash Out + Cash Exchange ledger.
--
-- staff_profiles.pay_type     'salary' (default, unchanged behaviour) or 'commission'.
--                             Staff with no base salary but a commission % start as commission.
-- salary_advances.basis       which rule capped the advance: base salary or earned commission.
-- expense_categories          the category list the Expenses page offers. Built-ins are
--                             system rows (cannot be removed); payroll rows are locked.
-- cash_movements              money that moves cash / online WITHOUT being a sale or an expense:
--                               CASH_IN   owner / bank / safe money added to the drawer
--                               CASH_OUT  owner withdrawal, bank deposit, move to safe
--                               EXCHANGE  a customer swaps online for cash (or the reverse);
--                                         the optional charge is the salon's fee income.
--                             A correction is a linked REVERSAL row with negated amounts, so a
--                             closed business day is never rewritten.
-- Forward-only and idempotent.

BEGIN;

ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS pay_type TEXT NOT NULL DEFAULT 'salary';
DO $$ BEGIN
  ALTER TABLE staff_profiles ADD CONSTRAINT staff_profiles_pay_type_check CHECK (pay_type IN ('salary', 'commission'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
UPDATE staff_profiles SET pay_type = 'commission'
WHERE pay_type = 'salary' AND COALESCE(base_salary, 0) = 0 AND COALESCE(commission_percentage, 0) > 0;

ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS basis TEXT NOT NULL DEFAULT 'salary';
ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS override_reason TEXT;
DO $$ BEGIN
  ALTER TABLE salary_advances ADD CONSTRAINT salary_advances_basis_check CHECK (basis IN ('salary', 'commission'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS expense_categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  group_label TEXT NOT NULL DEFAULT 'Anything else',
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO expense_categories (name, label, group_label, is_system, is_locked, is_active, sort_order) VALUES
  ('Rent', 'Rent', 'Running costs', TRUE, FALSE, TRUE, 10),
  ('Electricity', 'Electricity', 'Running costs', TRUE, FALSE, TRUE, 11),
  ('Water', 'Water', 'Running costs', TRUE, FALSE, TRUE, 12),
  ('Internet', 'Internet', 'Running costs', TRUE, FALSE, TRUE, 13),
  ('Maintenance', 'Maintenance', 'Salon upkeep', TRUE, FALSE, TRUE, 20),
  ('Cleaning', 'Cleaning', 'Salon upkeep', TRUE, FALSE, TRUE, 21),
  ('Equipment', 'Equipment', 'Salon upkeep', TRUE, FALSE, TRUE, 22),
  ('Marketing', 'Marketing', 'Salon upkeep', TRUE, FALSE, TRUE, 23),
  ('Product Purchase', 'Product Purchase', 'Stock & staff', TRUE, FALSE, TRUE, 30),
  ('Staff Salary', 'Staff Salary', 'Stock & staff', TRUE, TRUE, TRUE, 31),
  ('Staff Commission', 'Staff Commission', 'Stock & staff', TRUE, TRUE, TRUE, 32),
  ('TEA_SNACKS', 'Tea & snacks', 'Daily petty cash', TRUE, FALSE, TRUE, 40),
  ('WATER_JAR', 'Water jar', 'Daily petty cash', TRUE, FALSE, TRUE, 41),
  ('TRANSPORT', 'Transport', 'Daily petty cash', TRUE, FALSE, TRUE, 42),
  ('PETTY_PURCHASE', 'Petty purchase', 'Daily petty cash', TRUE, FALSE, TRUE, 43),
  ('Other', 'Other', 'Anything else', TRUE, FALSE, TRUE, 90),
  -- Legacy duplicates stay valid for old records but are not offered for new ones.
  ('CLEANING', 'Cleaning (old)', 'Salon upkeep', TRUE, FALSE, FALSE, 95),
  ('MAINTENANCE', 'Maintenance (old)', 'Salon upkeep', TRUE, FALSE, FALSE, 96),
  ('OTHER_EXPENSE', 'Other (old)', 'Anything else', TRUE, FALSE, FALSE, 97)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS cash_movements (
  id BIGSERIAL PRIMARY KEY,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('CASH_IN', 'CASH_OUT', 'EXCHANGE')),
  reason TEXT NOT NULL,
  exchange_direction TEXT CHECK (exchange_direction IS NULL OR exchange_direction IN ('ONLINE_TO_CASH', 'CASH_TO_ONLINE')),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  charge NUMERIC NOT NULL DEFAULT 0 CHECK (charge >= 0),
  -- Signed legs. An original row is >= 0; a reversal row carries the negated legs.
  cash_in NUMERIC NOT NULL DEFAULT 0,
  cash_out NUMERIC NOT NULL DEFAULT 0,
  online_in NUMERIC NOT NULL DEFAULT 0,
  online_out NUMERIC NOT NULL DEFAULT 0,
  fee_income NUMERIC NOT NULL DEFAULT 0,
  note TEXT NOT NULL,
  reference_number TEXT,
  movement_date DATE NOT NULL DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')::date),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVERSED', 'REVERSAL')),
  reverses_id BIGINT REFERENCES cash_movements(id) ON DELETE RESTRICT,
  reversed_by_id BIGINT REFERENCES cash_movements(id) ON DELETE SET NULL,
  business_day_id BIGINT REFERENCES business_days(id) ON DELETE SET NULL,
  store_session_id BIGINT REFERENCES store_sessions(id) ON DELETE SET NULL,
  idempotency_key TEXT UNIQUE,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cash_movements_session ON cash_movements(store_session_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_day ON cash_movements(business_day_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_date ON cash_movements(movement_date);
CREATE INDEX IF NOT EXISTS idx_cash_movements_type ON cash_movements(movement_type);

-- Cash In / Out and Cash Exchange are delegable. Off for every non-admin role on day one.
INSERT INTO role_permissions(role, permission_key, allowed)
SELECT r.role_name, p.permission_key, FALSE
FROM (VALUES ('cashier'), ('barber'), ('stylist'), ('beautician')) r(role_name)
CROSS JOIN (VALUES ('cash.movements'), ('cash.exchange')) p(permission_key)
ON CONFLICT (role, permission_key) DO NOTHING;

COMMIT;
