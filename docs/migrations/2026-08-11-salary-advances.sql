-- Advance Salary.
--
-- ACCOUNTING MODEL (unchanged): this POS recognises salary expense on a CASH BASIS — an
-- `expenses` row with category 'Staff Salary' is written only when money actually moves
-- (see saveSalaryPayment in src/app/api/admin/expenses/route.js). `salary_payments.total_payable`
-- is a payable figure and is never expensed on its own.
--
-- An advance is therefore a real salary payment made early: it writes ONE expense row when it
-- is paid, exactly like any other salary payment. The later monthly settlement APPLIES the
-- advance as a deduction so only the REMAINING amount is paid and expensed again.
--
--   advance paid        Rs 8,000  -> expense Rs 8,000   (cash/online out now)
--   settlement of       Rs 30,000 -> advance applied Rs 8,000, paid Rs 22,000 -> expense Rs 22,000
--   total salary expense Rs 30,000                       <- recognised exactly once
--
-- Because the advance uses the ordinary expenses table, cash/online outflow, Expected Cash in
-- Drawer, Business Day scoping and every existing report stay correct with no new money maths.
--
-- Idempotent and additive. Apply manually to PostgreSQL BEFORE deploying the code that uses
-- it. Never run from an API request or at Passenger/application startup.

BEGIN;

-- One advance payment to one staff member. `applied_amount` is maintained by the settlement
-- flow; `amount - applied_amount` is what is still outstanding.
CREATE TABLE IF NOT EXISTS salary_advances (
  id BIGSERIAL PRIMARY KEY,
  staff_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  applied_amount NUMERIC NOT NULL DEFAULT 0 CHECK (applied_amount >= 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'online', 'bank_transfer', 'mixed')),
  cash_amount NUMERIC DEFAULT 0 CHECK (cash_amount >= 0),
  online_amount NUMERIC DEFAULT 0 CHECK (online_amount >= 0),
  payment_date DATE NOT NULL,
  reference_number TEXT,
  note TEXT,
  -- OUTSTANDING: nothing applied yet. PARTIALLY_APPLIED / APPLIED: settled against salary.
  -- CANCELLED: reversed before it was applied.
  status TEXT NOT NULL DEFAULT 'OUTSTANDING'
    CHECK (status IN ('OUTSTANDING', 'PARTIALLY_APPLIED', 'APPLIED', 'CANCELLED')),
  -- The cash-basis salary expense this advance created.
  expense_id BIGINT REFERENCES expenses(id) ON DELETE SET NULL,
  -- Where the money physically moved, so drawer reconciliation stays correct.
  business_day_id BIGINT REFERENCES business_days(id) ON DELETE SET NULL,
  store_session_id BIGINT REFERENCES store_sessions(id) ON DELETE SET NULL,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  cancelled_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT salary_advances_applied_within_amount CHECK (applied_amount <= amount)
);

-- Which advance was applied to which salary settlement, and for how much. This is the audit
-- trail: advance history is never lost when an advance is deducted.
CREATE TABLE IF NOT EXISTS salary_advance_applications (
  id BIGSERIAL PRIMARY KEY,
  advance_id BIGINT NOT NULL REFERENCES salary_advances(id) ON DELETE CASCADE,
  salary_payment_id BIGINT NOT NULL REFERENCES salary_payments(id) ON DELETE CASCADE,
  amount_applied NUMERIC NOT NULL CHECK (amount_applied > 0),
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ties the cash-out expense row back to its advance, so payroll reporting can separate
-- "advance paid" from "regular salary paid" without double counting either.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS advance_id BIGINT REFERENCES salary_advances(id) ON DELETE SET NULL;

-- How much advance a settlement absorbed. Kept separate from the free-form `deduction`
-- column so an advance deduction is never confused with a disciplinary/other deduction.
ALTER TABLE salary_payments ADD COLUMN IF NOT EXISTS advance_applied NUMERIC NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_salary_advances_staff ON salary_advances(staff_id);
CREATE INDEX IF NOT EXISTS idx_salary_advances_status ON salary_advances(status);
CREATE INDEX IF NOT EXISTS idx_salary_advances_date ON salary_advances(payment_date);
CREATE INDEX IF NOT EXISTS idx_salary_advances_business_day ON salary_advances(business_day_id);
CREATE INDEX IF NOT EXISTS idx_advance_applications_advance ON salary_advance_applications(advance_id);
CREATE INDEX IF NOT EXISTS idx_advance_applications_salary ON salary_advance_applications(salary_payment_id);
CREATE INDEX IF NOT EXISTS idx_expenses_advance ON expenses(advance_id);

COMMIT;
