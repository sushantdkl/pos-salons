-- Counted-cash note breakdown per store session close.
--
-- Stores the number of each note counted at Close Store, e.g.
--   {"1000": 3, "500": 2, "100": 4, "50": 0, "20": 1, "10": 0, "5": 0, "1": 3}
-- counted_cash stays the authoritative total; when a breakdown is supplied the server
-- derives counted_cash from it, so the two can never disagree.
-- Forward-only; NULL for every historical close (no breakdown was recorded then).
BEGIN;

ALTER TABLE store_sessions ADD COLUMN IF NOT EXISTS cash_denominations JSONB;

COMMIT;
