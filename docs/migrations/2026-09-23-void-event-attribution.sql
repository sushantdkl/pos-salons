-- Void events are attributed to the store session that processed them.
--
-- A void is reported as a deduction on the day/session it happens; the voided bill stays a
-- sale on the day it was sold. Refunds already carry store_session_id; this gives the void
-- correction itself the same attribution so a session's revenue can show its voids.
-- Forward-only and safe for existing rows.
BEGIN;

ALTER TABLE financial_corrections
  ADD COLUMN IF NOT EXISTS store_session_id BIGINT REFERENCES store_sessions(id) ON DELETE SET NULL;

-- Existing voids: take the session from the refund the void paid out.
UPDATE financial_corrections fc
SET store_session_id = pr.store_session_id
FROM (
  SELECT correction_id, MIN(store_session_id) AS store_session_id
  FROM payment_refunds
  WHERE store_session_id IS NOT NULL
  GROUP BY correction_id
) pr
WHERE pr.correction_id = fc.id AND fc.store_session_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_financial_corrections_session
  ON financial_corrections(store_session_id, correction_type);
CREATE INDEX IF NOT EXISTS idx_financial_corrections_day
  ON financial_corrections(business_day_id, correction_type);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_day ON payment_refunds(business_day_id, method);
CREATE INDEX IF NOT EXISTS idx_credit_collections_day ON customer_credit_collections(business_day_id, payment_method);

COMMIT;
