BEGIN;
CREATE TABLE IF NOT EXISTS payment_refunds (
  id BIGSERIAL PRIMARY KEY,
  bill_id BIGINT NOT NULL REFERENCES salon_bills(id) ON DELETE RESTRICT,
  correction_id BIGINT NOT NULL REFERENCES financial_corrections(id) ON DELETE RESTRICT,
  method TEXT NOT NULL CHECK (method IN ('cash','online')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  business_day_id BIGINT REFERENCES business_days(id) ON DELETE SET NULL,
  store_session_id BIGINT REFERENCES store_sessions(id) ON DELETE SET NULL,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_session ON payment_refunds(store_session_id,method);
COMMIT;
