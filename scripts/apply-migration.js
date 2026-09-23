#!/usr/bin/env node
/**
 * Apply one reviewed migration file to the database in DATABASE_URL.
 *
 * This exists for local and staging work only. Production migrations are applied by hand
 * (psql or phpPgAdmin) after a backup — see docs/MIGRATION_GUIDE.md. Nothing in the running
 * application ever calls this: no migration may run from an API request or at Passenger
 * startup.
 *
 * Safety: refuses to run against a non-local host unless ALLOW_REMOTE_MIGRATION=1 is set, so
 * a stray command cannot reach production.
 *
 *   node scripts/apply-migration.js docs/migrations/2026-08-11-salary-advances.sql
 */

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1'];

function readDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return null;
  const match = fs.readFileSync(envPath, 'utf8').match(/^DATABASE_URL=(.*)$/m);
  return match ? match[1].trim().replace(/^["']|["']$/g, '') : null;
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node scripts/apply-migration.js <path-to-migration.sql>');
    process.exit(1);
  }
  const fullPath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(fullPath)) {
    console.error(`Migration not found: ${fullPath}`);
    process.exit(1);
  }

  const connectionString = readDatabaseUrl();
  if (!connectionString) {
    console.error('DATABASE_URL is not set and could not be read from .env.local');
    process.exit(1);
  }

  const host = new URL(connectionString).hostname;
  const isLocal = LOCAL_HOSTS.includes(host);
  if (!isLocal && process.env.ALLOW_REMOTE_MIGRATION !== '1') {
    console.error(
      `Refusing to run against non-local host "${host}".\n`
      + 'Production migrations are applied by hand after a backup (docs/MIGRATION_GUIDE.md).\n'
      + 'Set ALLOW_REMOTE_MIGRATION=1 only if you are certain this is a disposable staging database.'
    );
    process.exit(1);
  }

  const sql = fs.readFileSync(fullPath, 'utf8');
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const info = await pool.query('SELECT current_database() AS db, current_user AS usr');
    console.log(`Database : ${info.rows[0].db} @ ${host} (user ${info.rows[0].usr})`);
    console.log(`Migration: ${path.basename(fullPath)}`);
    // Each migration file carries its own BEGIN/COMMIT, so it is sent as one statement batch.
    const result = await pool.query(sql);
    const rows = Array.isArray(result) ? result[result.length - 1]?.rows : result.rows;
    if (rows && rows.length) {
      console.log('\nOutput:');
      rows.forEach((row) => console.log('  ' + JSON.stringify(row)));
    }
    console.log('\nApplied successfully. These migrations are idempotent — re-running is safe.');
  } catch (error) {
    console.error(`\nFAILED: ${error.message}`);
    console.error('The migration is wrapped in a transaction, so nothing was committed.');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
