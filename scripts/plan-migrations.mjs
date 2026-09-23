import pg from 'pg';
import { migrationChecksum, migrationContents, migrationFiles, poolConfig } from './migration-utils.mjs';

const client = new pg.Client(poolConfig());
await client.connect();
try {
  const exists = await client.query("SELECT to_regclass('public.schema_migrations') AS table_name");
  const applied = exists.rows[0]?.table_name
    ? await client.query('SELECT version, checksum FROM schema_migrations ORDER BY version')
    : { rows: [] };
  const appliedByVersion = new Map(applied.rows.map((row) => [row.version, row.checksum]));
  for (const file of migrationFiles()) {
    const version = file.replace(/\.sql$/, '');
    const checksum = migrationChecksum(migrationContents(file));
    const prior = appliedByVersion.get(version);
    const state = prior == null ? 'PENDING' : prior && prior !== checksum ? 'CHECKSUM_MISMATCH' : 'APPLIED';
    console.log(`${state.padEnd(18)} ${file}`);
  }
} finally {
  await client.end();
}
