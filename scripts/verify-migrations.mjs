import pg from 'pg';
import { migrationFiles, poolConfig } from './migration-utils.mjs';

const client = new pg.Client(poolConfig());
await client.connect();
try {
  const result = await client.query('SELECT version FROM schema_migrations ORDER BY version');
  const applied = new Set(result.rows.map((row) => `${row.version}.sql`));
  const pending = migrationFiles().filter((file) => !applied.has(file));
  const required = await client.query(`SELECT
    to_regclass('public.role_permissions') AS permissions,
    to_regclass('public.salon_payment_allocations') AS allocations,
    to_regclass('public.customer_credit_ledger') AS credit,
    to_regclass('public.financial_corrections') AS corrections`);
  if (pending.length) throw new Error(`Pending migrations: ${pending.join(', ')}`);
  if (Object.values(required.rows[0]).some((value) => !value)) throw new Error('One or more production foundation tables are missing.');
  const reconciliation = await client.query(`SELECT COUNT(*)::int AS mismatches FROM (
    SELECT b.id FROM salon_bills b LEFT JOIN salon_payment_allocations a ON a.bill_id=b.id
    WHERE b.status='paid' GROUP BY b.id,b.grand_total
    HAVING ABS(COALESCE(SUM(a.amount),0)-b.grand_total) > 0.005
  ) differences`);
  if (Number(reconciliation.rows[0].mismatches) > 0) throw new Error('One or more paid bills do not reconcile to payment allocations.');
  const cashierPayroll = await client.query(`SELECT permission_key,allowed FROM role_permissions WHERE role='cashier' AND permission_key IN ('payroll.payments.create','payroll.records.correct','payroll.records.delete')`);
  if (cashierPayroll.rowCount !== 3 || cashierPayroll.rows.some((row) => row.allowed)) throw new Error('Cashier payroll-denial permissions are not intact.');
  console.log('Migration verification passed.');
} finally {
  await client.end();
}
