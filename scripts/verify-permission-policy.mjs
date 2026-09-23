import crypto from 'node:crypto';
import pg from 'pg';
import { poolConfig } from './migration-utils.mjs';

const client = new pg.Client(poolConfig());
const token = `permission-policy-${crypto.randomUUID()}`;
await client.connect();
try {
  const admin = await client.query("SELECT id FROM users WHERE role='admin' AND is_active=TRUE LIMIT 1");
  if (!admin.rowCount) throw new Error('No active Admin is available for permission-policy verification.');
  await client.query("INSERT INTO sessions(user_id,token,expires_at) VALUES($1,$2,NOW()+INTERVAL '5 minutes')", [admin.rows[0].id, token]);
  const response = await fetch(`${process.env.APP_BASE_URL || 'http://127.0.0.1:3003'}/api/admin/permissions`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'cashier', changes: [{ permission: 'payroll.payments.create', allowed: true }] }),
  });
  if (response.status !== 422) throw new Error(`Expected protected cashier permission HTTP 422, received ${response.status}.`);
  const permission = await client.query("SELECT allowed FROM role_permissions WHERE role='cashier' AND permission_key='payroll.payments.create'");
  if (!permission.rowCount || permission.rows[0].allowed) throw new Error('Protected cashier payroll permission was changed.');
  console.log('Cashier payroll permission lock passed (HTTP 422; database remains denied).');
} finally {
  await client.query('DELETE FROM sessions WHERE token=$1', [token]).catch(() => {});
  await client.end();
}
