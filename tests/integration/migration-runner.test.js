import test from 'node:test';
import assert from 'node:assert/strict';
import { migrationBody, migrationFiles } from '../../scripts/migration-utils.mjs';
import { TRACKED_MIGRATIONS } from '../../src/lib/db/migrations-manifest.js';

test('runner only exposes reviewed forward migrations',()=>{
  assert.deepEqual(migrationFiles(), TRACKED_MIGRATIONS);
  assert.equal(new Set(TRACKED_MIGRATIONS).size, TRACKED_MIGRATIONS.length);
  assert.ok(TRACKED_MIGRATIONS.every((file) => /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.sql$/.test(file)));
});
test('runner owns the transaction wrapper',()=>{
  const body=migrationBody('BEGIN;\nSELECT 1;\nCOMMIT;');
  assert.equal(body,'SELECT 1;');
});
