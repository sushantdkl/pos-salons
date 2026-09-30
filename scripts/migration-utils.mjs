import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { TRACKED_MIGRATIONS } from '../src/lib/db/migrations-manifest.js';

export const migrationsDirectory = path.join(process.cwd(), 'docs', 'migrations');

// The ordered migration list lives in src/lib/db/migrations-manifest.js so the runner and
// /api/health (pending-migration check) can never disagree.
export const trackedMigrations = TRACKED_MIGRATIONS;

export function migrationFiles() {
  for (const name of trackedMigrations) {
    if (!fs.existsSync(path.join(migrationsDirectory, name))) {
      throw new Error(`Tracked migration is missing: ${name}`);
    }
  }
  return [...trackedMigrations];
}

export function migrationContents(file) {
  return fs.readFileSync(path.join(migrationsDirectory, file), 'utf8');
}

export function migrationChecksum(sql) {
  // Line endings are normalised: a Windows checkout (core.autocrlf) turns every file into
  // CRLF, which must not make an unchanged, already-applied migration look edited.
  return crypto.createHash('sha256').update(String(sql).replace(/\r\n/g, '\n')).digest('hex');
}

export function migrationBody(sql) {
  // Repository SQL files are also usable manually and therefore carry their
  // own transaction wrapper. The runner owns the real atomic transaction.
  return sql
    .replace(/^\s*BEGIN\s*;?/i, '')
    .replace(/COMMIT\s*;?\s*$/i, '')
    .trim();
}

export function poolConfig() {
  const connectionString = process.env.DATABASE_URL || '';
  if (!/^postgres(ql)?:\/\//i.test(connectionString)) throw new Error('Set DATABASE_URL to a PostgreSQL connection string.');
  const host = new URL(connectionString).hostname;
  const local = ['localhost', '127.0.0.1', '::1'].includes(host);
  return {
    connectionString,
    ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : local || process.env.PG_SSL === 'false' ? false : { rejectUnauthorized: false },
  };
}
