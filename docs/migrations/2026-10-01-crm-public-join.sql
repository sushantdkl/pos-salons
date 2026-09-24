-- Review & Rewards QR: let a new customer join the loyalty programme from the QR page before
-- their first paid visit (name + mobile only; visits still come only from paid bills).
-- Forward-only and idempotent. Owner can switch it off in Customer Reviews settings.

BEGIN;

ALTER TABLE crm_settings ADD COLUMN IF NOT EXISTS public_join_enabled BOOLEAN NOT NULL DEFAULT TRUE;

COMMIT;
