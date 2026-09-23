/**
 * The ordered list of forward-only migrations (docs/migrations/*.sql) the app expects to be
 * applied. `npm run db:migrate` applies them; /api/health reports any still pending.
 * Plain ESM with no path aliases so scripts/ can import it directly.
 *
 * Older SQL files in docs/migrations were operational/manual scripts, not a replayable chain;
 * only files listed here are applied by the runner.
 */
export const TRACKED_MIGRATIONS = [
  '2026-08-11-salary-advances.sql',
  '2026-09-20-production-foundations.sql',
  '2026-09-20-payment-allocation-backfill.sql',
  '2026-09-20-credit-collections.sql',
  '2026-09-20-payment-corrections.sql',
  '2026-09-20-permission-matrix.sql',
  '2026-09-23-void-event-attribution.sql',
  '2026-09-24-cash-denominations.sql',
  '2026-09-25-appointments.sql',
];
