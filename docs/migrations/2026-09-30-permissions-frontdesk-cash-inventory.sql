-- Staff Permissions catch up with features added since the matrix was designed:
--   Front desk & customers (tokens / appointments / customers), Daily cash (expenses / savings),
--   Inventory & suppliers (stock / suppliers & purchases).
-- Nothing changes for anyone on day one: the cashier keeps everything it could already do
-- (all ON except suppliers, which were admin-only before); service staff stay OFF.
-- Forward-only and idempotent.

BEGIN;

INSERT INTO role_permissions(role, permission_key, allowed)
SELECT r.role_name, p.permission_key,
       r.role_name = 'cashier' AND p.permission_key NOT IN ('suppliers.manage')
FROM (VALUES ('cashier'), ('barber'), ('stylist'), ('beautician')) r(role_name)
CROSS JOIN (VALUES
  ('module.frontdesk'), ('tokens.manage'), ('appointments.manage'), ('customers.manage'),
  ('module.cash'), ('expenses.daily'), ('savings.deposit'),
  ('module.inventory'), ('stock.manage'), ('suppliers.manage')
) p(permission_key)
ON CONFLICT (role, permission_key) DO NOTHING;

COMMIT;
