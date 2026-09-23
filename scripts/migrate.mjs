import pg from 'pg';
import { migrationBody, migrationChecksum, migrationContents, migrationFiles, poolConfig } from './migration-utils.mjs';

const client = new pg.Client(poolConfig());
const lock = [917245, 20260920];
await client.connect();
try {
  await client.query('SELECT pg_advisory_lock($1, $2)', lock);
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY, checksum TEXT, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  for (const file of migrationFiles()) {
    const version = file.replace(/\.sql$/, '');
    const sql = migrationContents(file);
    const checksum = migrationChecksum(sql);
    const prior = await client.query('SELECT checksum FROM schema_migrations WHERE version=$1', [version]);
    if (prior.rowCount) {
      if (prior.rows[0].checksum && prior.rows[0].checksum !== checksum) throw new Error(`Migration checksum mismatch: ${file}`);
      console.log(`skip ${file}`);
      continue;
    }
    await client.query('BEGIN');
    try {
      await client.query(migrationBody(sql));
      await client.query('INSERT INTO schema_migrations(version, checksum) VALUES ($1, $2)', [version, checksum]);
      await client.query('COMMIT');
      console.log(`applied ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await client.query('SELECT pg_advisory_unlock($1, $2)', lock).catch(() => {});
  await client.end();
}
