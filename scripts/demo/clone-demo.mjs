/**
 * Copy the freshly seeded <db>_qa into <db>_demo (CREATE DATABASE ... TEMPLATE), replacing any
 * previous demo copy. Local hosts only. Your own <db> is never read or written.
 */
import pg from 'pg';

const source = new URL(process.env.DATABASE_URL || '');
if (!['localhost', '127.0.0.1', '::1'].includes(source.hostname)) throw new Error('Demo databases are local only.');
const base = source.pathname.replace(/^\//, '');
if (!/^[a-z0-9_]+$/i.test(base)) throw new Error(`Unexpected database name: ${base}`);
const qaDb = `${base}_qa`;
const demoDb = `${base}_demo`;

const adminUrl = new URL(source);
adminUrl.pathname = '/postgres';
const admin = new pg.Client({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 10000 });
await admin.connect();
try {
  for (const name of [qaDb, demoDb]) await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [name]);
  await admin.query(`DROP DATABASE IF EXISTS "${demoDb}"`);
  await admin.query(`CREATE DATABASE "${demoDb}" TEMPLATE "${qaDb}"`);
  console.log(`${demoDb} ready (copied from ${qaDb})`);
} finally {
  await admin.end();
}
