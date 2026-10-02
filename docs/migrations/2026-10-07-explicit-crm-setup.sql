-- Loyalty promises must come from a real owner-created program, not sample settings.
-- The editable starter feedback form remains available so reviews work out of the box.

BEGIN;

ALTER TABLE crm_settings ALTER COLUMN public_rewards_enabled SET DEFAULT FALSE;
ALTER TABLE crm_settings ALTER COLUMN claim_codes_enabled SET DEFAULT FALSE;
ALTER TABLE crm_settings ALTER COLUMN public_join_enabled SET DEFAULT FALSE;
ALTER TABLE crm_settings ALTER COLUMN qr_subtext SET DEFAULT 'Scan to leave a review.';
ALTER TABLE crm_settings ALTER COLUMN qr_footer SET DEFAULT '';

UPDATE crm_settings
SET public_rewards_enabled = FALSE,
    claim_codes_enabled = FALSE,
    public_join_enabled = FALSE,
    qr_subtext = 'Scan to leave a review.',
    qr_footer = '',
    updated_at = NOW()
WHERE id = 1
  AND updated_by IS NULL
  AND NOT EXISTS (SELECT 1 FROM loyalty_programs);

COMMIT;
