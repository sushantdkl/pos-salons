-- Separate Kanchan's login permissions from cashier operations.
-- Run once in phpPgAdmin or psql after the base schema/seed is already applied.
-- This preserves historical bills, tokens, commission, and service attribution.

BEGIN;

UPDATE users
SET
  role = 'beautician',
  updated_at = NOW()
WHERE username = 'kanchan'
  AND role <> 'beautician';

UPDATE staff_profiles
SET
  salon_role = 'beautician',
  assigned_services = 'Normal Cleansing,Deep Cleansing,Wine Facial,Fruit Facial,Lotus Facial,Threading',
  updated_at = NOW()
WHERE user_id = (
  SELECT id
  FROM users
  WHERE username = 'kanchan'
  LIMIT 1
);

COMMIT;

-- Manual deployment step:
-- Create a real dedicated Cashier account from Admin > Staff Management.
-- Choose the actual staff name and PIN for the salon. Do not reuse Kanchan as a cashier fallback.
