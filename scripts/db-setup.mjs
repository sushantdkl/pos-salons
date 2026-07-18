import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Client } = pg;
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(filename) {
  const filePath = path.join(rootDir, filename);
  if (!existsSync(filePath)) return;

  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) process.env[key] = value;
  }
}

function parseDatabaseUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  const database = url.pathname.replace(/^\//, '');
  if (!database) {
    throw new Error('DATABASE_URL must include a database name.');
  }

  return {
    database,
    adminUrl: (() => {
      const copy = new URL(databaseUrl);
      copy.pathname = '/postgres';
      return copy.toString();
    })(),
  };
}

async function ensureDatabase(adminUrl, database) {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();

  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
    if (existing.rowCount) {
      console.log(`Database "${database}" already exists.`);
      return;
    }

    const safeName = database.replace(/"/g, '""');
    await client.query(`CREATE DATABASE "${safeName}"`);
    console.log(`Created database "${database}".`);
  } finally {
    await client.end();
  }
}

async function runSqlFile(databaseUrl, relativePath) {
  const filePath = path.join(rootDir, relativePath);
  const sql = readFileSync(filePath, 'utf8');
  const client = new Client({ connectionString: databaseUrl });

  await client.connect();
  try {
    await client.query(sql);
    console.log(`Applied ${relativePath}`);
  } finally {
    await client.end();
  }
}

async function main() {
  loadEnvFile('.env.local');
  loadEnvFile('.env');

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is missing. Set it in .env.local before running db:setup.');
  }

  const { database, adminUrl } = parseDatabaseUrl(databaseUrl);

  console.log(`Using database: ${database}`);
  await ensureDatabase(adminUrl, database);
  await runSqlFile(databaseUrl, 'docs/postgresql-schema.sql');
  await runSqlFile(databaseUrl, 'docs/postgresql-seed.sql');
  console.log('Local PostgreSQL schema and seed are ready.');
}

main().catch((error) => {
  console.error('Database setup failed:', error.message);
  process.exit(1);
});
