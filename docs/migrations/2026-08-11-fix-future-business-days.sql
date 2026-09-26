-- Repair legacy business days dated in the future (Nepal time).
--
-- Before the guard added on 2026-08-11, running "Start Next Business Day" twice in one
-- calendar day produced a business day dated tomorrow. Its transactions report under that
-- future business day and therefore fall outside every calendar-window report (Last 3 Days,
-- Last 7 Days, This Month) until the calendar catches up.
--
-- This migration repairs ONLY the unambiguous case: a future-dated business day that has NO
-- transactions attached at all. Nothing can be misattributed by moving an empty day, so it is
-- pulled back to the first free date on or before today.
--
-- A future-dated day that HAS traded is NOT touched. Re-dating real trading history would
-- silently move revenue between periods, which is exactly the class of error the rest of this
-- work removed. Those days are reported by the final query so an admin can decide.
--
-- Idempotent: re-running it finds nothing left to fix. Additive: no schema changes.
-- Apply manually. Never run from an API request or at Passenger/application startup.

BEGIN;

-- 1. Empty future-dated days: move to today when today is free, otherwise delete the
--    duplicate (an empty day that collides with a real one carries no information).
WITH nepal AS (
  SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')::date AS today
),
empty_future AS (
  SELECT bd.id
  FROM business_days bd, nepal n
  WHERE bd.business_date > n.today
    AND NOT EXISTS (SELECT 1 FROM salon_bills      x WHERE x.business_day_id = bd.id)
    AND NOT EXISTS (SELECT 1 FROM salon_bills      x WHERE x.revenue_business_day_id = bd.id)
    AND NOT EXISTS (SELECT 1 FROM expenses         x WHERE x.business_day_id = bd.id)
    AND NOT EXISTS (SELECT 1 FROM savings_deposits x WHERE x.business_day_id = bd.id)
    AND NOT EXISTS (SELECT 1 FROM walk_in_tokens   x WHERE x.business_day_id = bd.id)
    -- Only a day whose sessions never counted any cash is safe to move.
    AND NOT EXISTS (
      SELECT 1 FROM store_sessions s
      WHERE s.business_day_id = bd.id
        AND (COALESCE(s.counted_cash, 0) <> 0 OR COALESCE(s.expected_cash, 0) <> 0)
    )
),
-- Keep the earliest empty future day as the one to re-date; any others are redundant.
keeper AS (
  SELECT bd.id
  FROM business_days bd
  JOIN empty_future ef ON ef.id = bd.id
  ORDER BY bd.business_date ASC, bd.id ASC
  LIMIT 1
)
UPDATE business_days bd
SET business_date = n.today, updated_at = NOW()
FROM nepal n, keeper k
WHERE bd.id = k.id
  AND NOT EXISTS (SELECT 1 FROM business_days x WHERE x.business_date = n.today AND x.id <> bd.id);

-- 2. Remaining empty future-dated days that could not be re-dated (the target date was
--    already taken). They hold nothing, so their sessions and the day itself are removed.
WITH nepal AS (
  SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')::date AS today
),
still_empty AS (
  SELECT bd.id
  FROM business_days bd, nepal n
  WHERE bd.business_date > n.today
    AND NOT EXISTS (SELECT 1 FROM salon_bills      x WHERE x.business_day_id = bd.id)
    AND NOT EXISTS (SELECT 1 FROM salon_bills      x WHERE x.revenue_business_day_id = bd.id)
    AND NOT EXISTS (SELECT 1 FROM expenses         x WHERE x.business_day_id = bd.id)
    AND NOT EXISTS (SELECT 1 FROM savings_deposits x WHERE x.business_day_id = bd.id)
    AND NOT EXISTS (SELECT 1 FROM walk_in_tokens   x WHERE x.business_day_id = bd.id)
    AND NOT EXISTS (
      SELECT 1 FROM store_sessions s
      WHERE s.business_day_id = bd.id
        AND (COALESCE(s.counted_cash, 0) <> 0 OR COALESCE(s.expected_cash, 0) <> 0)
    )
)
DELETE FROM business_days WHERE id IN (SELECT id FROM still_empty);
-- store_sessions rows cascade with the business day (ON DELETE CASCADE).

COMMIT;

-- 3. Report anything left. These future-dated days HAVE traded and were deliberately not
--    changed. Review each one: it is real history, and moving it would shift revenue between
--    reporting periods.
SELECT
  bd.id,
  bd.business_date,
  bd.status,
  (SELECT COUNT(*) FROM store_sessions s WHERE s.business_day_id = bd.id)  AS sessions,
  (SELECT COUNT(*) FROM salon_bills   x WHERE x.business_day_id = bd.id)   AS bills,
  (SELECT COUNT(*) FROM expenses      x WHERE x.business_day_id = bd.id)   AS expenses,
  'Future-dated business day with transactions - review manually'          AS note
FROM business_days bd
WHERE bd.business_date > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')::date
ORDER BY bd.business_date;
