import test from 'node:test';
import assert from 'node:assert/strict';
import { migrationBody, migrationFiles } from '../../scripts/migration-utils.mjs';

test('runner only exposes reviewed forward migrations',()=>{
  assert.deepEqual(migrationFiles(),['2026-08-11-salary-advances.sql','2026-09-20-production-foundations.sql','2026-09-20-payment-allocation-backfill.sql','2026-09-20-credit-collections.sql','2026-09-20-payment-corrections.sql','2026-09-20-permission-matrix.sql']);
});
test('runner owns the transaction wrapper',()=>{
  const body=migrationBody('BEGIN;\nSELECT 1;\nCOMMIT;');
  assert.equal(body,'SELECT 1;');
});
