import crypto from 'node:crypto';
import pg from 'pg';
import { poolConfig } from './migration-utils.mjs';

const client = new pg.Client(poolConfig());
const token = `authz-check-${crypto.randomUUID()}`;
await client.connect();
try {
  const cashier = await client.query("SELECT id FROM users WHERE role='cashier' AND is_active=TRUE LIMIT 1");
  if (!cashier.rowCount) throw new Error('No active cashier is available for authorization verification.');
  await client.query("INSERT INTO sessions(user_id,token,expires_at) VALUES($1,$2,NOW()+INTERVAL '5 minutes')", [cashier.rows[0].id, token]);
  const response = await fetch(`${process.env.APP_BASE_URL || 'http://127.0.0.1:3003'}/api/admin/expenses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'salary', staffId: cashier.rows[0].id, amountPaid: 1 }),
  });
  if (response.status !== 403) throw new Error(`Expected HTTP 403, received ${response.status}.`);
  console.log('Cashier full-salary direct-request denial passed (HTTP 403).');
} finally {
  await client.query('DELETE FROM sessions WHERE token=$1', [token]).catch(() => {});
  await client.end();
}
