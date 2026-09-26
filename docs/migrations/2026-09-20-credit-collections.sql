BEGIN;
CREATE TABLE IF NOT EXISTS customer_credit_collections (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','online')),
  provider TEXT,
  reference_number TEXT,
  cash_tendered NUMERIC(14,2),
  change_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (change_amount >= 0),
  business_day_id BIGINT REFERENCES business_days(id) ON DELETE SET NULL,
  store_session_id BIGINT REFERENCES store_sessions(id) ON DELETE SET NULL,
  ledger_id BIGINT REFERENCES customer_credit_ledger(id) ON DELETE RESTRICT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (payment_method='online' OR cash_tendered >= amount)
);
CREATE INDEX IF NOT EXISTS idx_credit_collections_session ON customer_credit_collections(store_session_id,payment_method);
COMMIT;
