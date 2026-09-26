/**
 * Create a disposable QA copy of the local salon database.
 *
 *   node --env-file=.env.local scripts/qa/create-qa-db.mjs [--reset]
 *
 * Clones DATABASE_URL's database into `<name>_qa` with CREATE DATABASE ... TEMPLATE, so the
 * QA copy has the real schema, migrations and reference data (services, products, staff)
 * while every test bill, close and reopen lands in the copy — never in the source.
 * --reset drops an existing QA copy first. Refuses to run against a non-local host.
 */
import pg from 'pg';

const source = process.env.DATABASE_URL || '';
if (!/^postgres(ql)?:\/\//i.test(source)) throw new Error('Set DATABASE_URL to a PostgreSQL connection string.');

const url = new URL(source);
if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
  throw new Error(`Refusing to clone a non-local database (${url.hostname}). QA copies are local only.`);
}

const sourceDb = url.pathname.replace(/^\//, '');
const qaDb = `${sourceDb}_qa`;
if (!/^[a-z0-9_]+$/i.test(sourceDb)) throw new Error(`Unexpected database name: ${sourceDb}`);

const adminUrl = new URL(source);
adminUrl.pathname = '/postgres';
const admin = new pg.Client({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 10000 });
await admin.connect();

try {
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [qaDb]);
  if (exists.rowCount && process.argv.includes('--reset')) {
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [qaDb]);
    await admin.query(`DROP DATABASE "${qaDb}"`);
    console.log(`dropped ${qaDb}`);
  } else if (exists.rowCount) {
    console.log(`${qaDb} already exists (pass --reset to recreate it)`);
    process.exit(0);
  }

  // TEMPLATE needs the source to be idle; a running dev server holds connections open.
  const busy = await admin.query(
    'SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
    [sourceDb]
  );
  if (busy.rows[0].n > 0) {
    throw new Error(`${sourceDb} has ${busy.rows[0].n} open connection(s). Stop the dev server and retry.`);
  }

  await admin.query(`CREATE DATABASE "${qaDb}" TEMPLATE "${sourceDb}"`);
  console.log(`created ${qaDb} from ${sourceDb}`);
} finally {
  await admin.end();
}

const qaUrl = new URL(source);
qaUrl.pathname = `/${qaDb}`;
console.log(`QA DATABASE_URL: ${qaUrl.protocol}//${qaUrl.username}:***@${qaUrl.host}/${qaDb}`);
