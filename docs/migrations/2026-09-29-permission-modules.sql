-- Staff Permissions become two-level: a MODULE switch (module.<group>) must be on before any
-- permission inside it counts. Existing grants keep working: a module starts ON for a role
-- wherever that role already has at least one permission in it, otherwise OFF.
-- Forward-only and idempotent.

BEGIN;

WITH groups(module_key, permission_key) AS (
  VALUES
    ('module.billing', 'billing.create'), ('module.billing', 'billing.credit.create'), ('module.billing', 'billing.credit.override'), ('module.billing', 'billing.correct'),
    ('module.reports', 'reports.view'),
    ('module.advances', 'payroll.view'), ('module.advances', 'payroll.advances.create'),
    ('module.hrm', 'attendance.view'), ('module.hrm', 'attendance.create'), ('module.hrm', 'attendance.edit'), ('module.hrm', 'attendance.correct'),
    ('module.hrm', 'attendance.approve'), ('module.hrm', 'shift.manage'), ('module.hrm', 'leave.view'), ('module.hrm', 'leave.request'),
    ('module.hrm', 'leave.approve'), ('module.hrm', 'overtime.view'), ('module.hrm', 'overtime.approve'),
    ('module.crm', 'loyalty.view'), ('module.crm', 'loyalty.adjust'), ('module.crm', 'loyalty.manage'),
    ('module.crm', 'reviews.view'), ('module.crm', 'reviews.moderate'), ('module.crm', 'reviews.manage'),
    ('module.payroll', 'payroll.payments.create'), ('module.payroll', 'payroll.records.correct'), ('module.payroll', 'payroll.records.delete')
),
roles(role_name) AS (VALUES ('cashier'), ('barber'), ('stylist'), ('beautician'))
INSERT INTO role_permissions(role, permission_key, allowed)
SELECT r.role_name, m.module_key,
       EXISTS (SELECT 1 FROM groups g JOIN role_permissions rp ON rp.permission_key = g.permission_key
               WHERE g.module_key = m.module_key AND rp.role = r.role_name AND rp.allowed)
FROM roles r CROSS JOIN (SELECT DISTINCT module_key FROM groups) m
ON CONFLICT (role, permission_key) DO NOTHING;

-- Full payroll stays blocked for the cashier at module level too (mandatory policy).
UPDATE role_permissions SET allowed = FALSE WHERE role = 'cashier' AND permission_key = 'module.payroll';

COMMIT;
