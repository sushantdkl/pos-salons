-- Fix the payment method of a settled bill (e.g. cash pressed instead of eSewa during a rush).
--   * financial_corrections gains the 'payment_method_change' type. It is an audit row only:
--     every report counts voids with correction_type = 'void', so a method change never shows
--     up as a void or a refund.
--   * New delegated permission billing.payment_method.change — ON for the cashier (the person
--     who makes the mistake at the counter), OFF for service staff. Voiding stays billing.correct.
-- Forward-only and idempotent.

BEGIN;

ALTER TABLE financial_corrections DROP CONSTRAINT IF EXISTS financial_corrections_correction_type_check;
ALTER TABLE financial_corrections ADD CONSTRAINT financial_corrections_correction_type_check
  CHECK (correction_type IN ('void', 'refund', 'payment_reversal', 'advance_reversal', 'payroll_reversal', 'payment_method_change'));

INSERT INTO role_permissions(role, permission_key, allowed)
SELECT r.role_name, 'billing.payment_method.change', r.role_name = 'cashier'
FROM (VALUES ('cashier'), ('barber'), ('stylist'), ('beautician')) r(role_name)
ON CONFLICT (role, permission_key) DO NOTHING;

COMMIT;
