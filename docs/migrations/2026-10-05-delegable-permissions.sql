-- Staff Permissions cover every admin sidebar item that can be delegated.
--   New: appointments.settings, services.manage, reminders.send (Front desk),
--        reports.overview, reports.business_days, reports.staff, reports.analytics,
--        reports.sensitive (Reports), reports.advances (Salary advances),
--        module.website with website.manage and documents.manage.
-- Nothing changes for anyone on day one: the cashier keeps editing services and sending
-- reminders (it could already); every new report, the website and printer settings start OFF.
-- Service staff (barber / stylist / beautician) start OFF for all of them.
-- Forward-only and idempotent.

BEGIN;

INSERT INTO role_permissions(role, permission_key, allowed)
SELECT r.role_name, p.permission_key,
       r.role_name = 'cashier' AND p.permission_key IN ('services.manage', 'reminders.send')
FROM (VALUES ('cashier'), ('barber'), ('stylist'), ('beautician')) r(role_name)
CROSS JOIN (VALUES
  ('appointments.settings'), ('services.manage'), ('reminders.send'),
  ('reports.overview'), ('reports.business_days'), ('reports.staff'), ('reports.analytics'), ('reports.sensitive'),
  ('reports.advances'),
  ('module.website'), ('website.manage'), ('documents.manage')
) p(permission_key)
ON CONFLICT (role, permission_key) DO NOTHING;

COMMIT;
