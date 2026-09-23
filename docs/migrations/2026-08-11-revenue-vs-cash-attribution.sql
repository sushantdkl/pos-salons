-- Revenue attribution vs cash-movement attribution for salon bills.
--
-- Problem this fixes: a backdated Admin bill (service happened on an earlier date) was
-- stamped with the CURRENT open business day / store session. Calendar reports placed the
-- sale on its real date while every Business-Day-scoped figure counted it as today's
-- revenue, so the two never reconciled.
--
-- After this migration a bill carries BOTH attributions:
--   business_day_id / store_session_id  -> where the CASH physically moved (unchanged)
--   revenue_business_day_id             -> which business day owns the SALE
--   payment_received_at                 -> when the money was actually taken
--
-- Idempotent and purely additive: existing rows are backfilled so that every current
-- report returns exactly the same numbers as before. Apply manually to the cPanel
-- PostgreSQL database (phpPgAdmin / psql) BEFORE deploying the code that uses it.
-- Never run from an API request or at Passenger/application startup.

BEGIN;

ALTER TABLE salon_bills
  ADD COLUMN IF NOT EXISTS revenue_business_day_id BIGINT REFERENCES business_days(id) ON DELETE SET NULL;

ALTER TABLE salon_bills
  ADD COLUMN IF NOT EXISTS payment_received_at TIMESTAMPTZ;

-- Backfill: every existing bill keeps its current behaviour. Historical bills were all
-- recorded on the day they happened, so revenue day = the day already stamped on the row.
UPDATE salon_bills
SET revenue_business_day_id = business_day_id
WHERE revenue_business_day_id IS NULL
  AND business_day_id IS NOT NULL;

UPDATE salon_bills
SET payment_received_at = COALESCE(transaction_time, created_at)
WHERE payment_received_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bills_revenue_business_day ON salon_bills(revenue_business_day_id);
CREATE INDEX IF NOT EXISTS idx_bills_payment_received_at ON salon_bills(payment_received_at);

COMMIT;
