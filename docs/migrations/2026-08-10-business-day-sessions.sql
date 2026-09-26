-- Business Day + Store Session lifecycle and cash reconciliation.
-- Idempotent: safe to run more than once. Apply manually to the cPanel PostgreSQL
-- database (phpPgAdmin / psql) BEFORE deploying the code that uses it.
-- Never run from an API request or at Passenger/application startup.

BEGIN;

-- One reporting/accounting operational day. May contain several store sessions.
CREATE TABLE IF NOT EXISTS business_days (
  id BIGSERIAL PRIMARY KEY,
  business_date DATE NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  opened_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  opening_cash NUMERIC DEFAULT 0 CHECK (opening_cash >= 0),
  previous_closing_cash NUMERIC DEFAULT 0,
  opening_note TEXT,
  closed_at TIMESTAMPTZ,
  closed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  expected_cash NUMERIC DEFAULT 0,
  counted_cash NUMERIC DEFAULT 0,
  cash_difference NUMERIC DEFAULT 0,
  closing_note TEXT,
  force_closed BOOLEAN DEFAULT FALSE,
  force_close_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- One physical Open Store -> Close Store cycle inside a business day.
CREATE TABLE IF NOT EXISTS store_sessions (
  id BIGSERIAL PRIMARY KEY,
  business_day_id BIGINT NOT NULL REFERENCES business_days(id) ON DELETE CASCADE,
  session_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  opened_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  starting_cash NUMERIC DEFAULT 0 CHECK (starting_cash >= 0),
  previous_session_closing_cash NUMERIC DEFAULT 0,
  opening_note TEXT,
  closed_at TIMESTAMPTZ,
  closed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  expected_cash NUMERIC DEFAULT 0,
  counted_cash NUMERIC DEFAULT 0,
  cash_difference NUMERIC DEFAULT 0,
  closing_note TEXT,
  force_closed BOOLEAN DEFAULT FALSE,
  force_close_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (business_day_id, session_number)
);

-- At most one OPEN business day and one OPEN store session at any time.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_business_day ON business_days (status) WHERE status = 'OPEN';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_store_session ON store_sessions (status) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_business_days_date ON business_days (business_date);
CREATE INDEX IF NOT EXISTS idx_store_sessions_day ON store_sessions (business_day_id);

-- Attribute operational transactions to their business day / store session.
-- Nullable so every existing production row and all current code keep working.
ALTER TABLE salon_bills      ADD COLUMN IF NOT EXISTS business_day_id  BIGINT REFERENCES business_days(id)  ON DELETE SET NULL;
ALTER TABLE salon_bills      ADD COLUMN IF NOT EXISTS store_session_id BIGINT REFERENCES store_sessions(id) ON DELETE SET NULL;
ALTER TABLE expenses         ADD COLUMN IF NOT EXISTS business_day_id  BIGINT REFERENCES business_days(id)  ON DELETE SET NULL;
ALTER TABLE expenses         ADD COLUMN IF NOT EXISTS store_session_id BIGINT REFERENCES store_sessions(id) ON DELETE SET NULL;
ALTER TABLE savings_deposits ADD COLUMN IF NOT EXISTS business_day_id  BIGINT REFERENCES business_days(id)  ON DELETE SET NULL;
ALTER TABLE savings_deposits ADD COLUMN IF NOT EXISTS store_session_id BIGINT REFERENCES store_sessions(id) ON DELETE SET NULL;
ALTER TABLE walk_in_tokens   ADD COLUMN IF NOT EXISTS business_day_id  BIGINT REFERENCES business_days(id)  ON DELETE SET NULL;
ALTER TABLE walk_in_tokens   ADD COLUMN IF NOT EXISTS store_session_id BIGINT REFERENCES store_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bills_business_day    ON salon_bills(business_day_id);
CREATE INDEX IF NOT EXISTS idx_bills_store_session   ON salon_bills(store_session_id);
CREATE INDEX IF NOT EXISTS idx_expenses_business_day ON expenses(business_day_id);
CREATE INDEX IF NOT EXISTS idx_expenses_store_session ON expenses(store_session_id);
CREATE INDEX IF NOT EXISTS idx_savings_business_day  ON savings_deposits(business_day_id);
CREATE INDEX IF NOT EXISTS idx_savings_store_session ON savings_deposits(store_session_id);
CREATE INDEX IF NOT EXISTS idx_tokens_business_day   ON walk_in_tokens(business_day_id);
CREATE INDEX IF NOT EXISTS idx_tokens_store_session  ON walk_in_tokens(store_session_id);

COMMIT;
