import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const migrationsDirectory = path.join(process.cwd(), 'docs', 'migrations');

// Older SQL files in this repository were operational/manual scripts, not a
// replayable migration chain. Only files explicitly added here may be applied
// by the production runner.
export const trackedMigrations = [
  '2026-08-11-salary-advances.sql',
  '2026-09-20-production-foundations.sql',
  '2026-09-20-payment-allocation-backfill.sql',
  '2026-09-20-credit-collections.sql',
  '2026-09-20-payment-corrections.sql',
  '2026-09-20-permission-matrix.sql',
  '2026-09-23-void-event-attribution.sql',
  '2026-09-24-cash-denominations.sql',
];

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
  return crypto.createHash('sha256').update(sql).digest('hex');
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
