BEGIN;

INSERT INTO role_permissions(role, permission_key, allowed)
SELECT role_name, permission_key, FALSE
FROM (VALUES ('cashier'),('barber'),('stylist'),('beautician')) roles(role_name)
CROSS JOIN (VALUES
  ('billing.create'),('billing.credit.create'),('billing.credit.override'),('billing.correct'),
  ('reports.view'),('payroll.view'),('payroll.advances.create'),
  ('payroll.payments.create'),('payroll.records.correct'),('payroll.records.delete')
) permissions(permission_key)
ON CONFLICT(role,permission_key) DO NOTHING;

UPDATE role_permissions SET allowed=TRUE
WHERE role='cashier' AND permission_key IN (
  'billing.create','billing.credit.create','reports.view','payroll.view','payroll.advances.create'
);

-- Mandatory policy: these cannot be delegated to Cashier.
UPDATE role_permissions SET allowed=FALSE
WHERE role='cashier' AND permission_key IN (
  'payroll.payments.create','payroll.records.correct','payroll.records.delete'
);

COMMIT;
