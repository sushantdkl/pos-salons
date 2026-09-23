import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { TRACKED_MIGRATIONS } from '@/lib/db/migrations-manifest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Deployment health: the app is up, PostgreSQL answers, and every tracked migration is
 * applied. Public (used by monitors and the QA runner), so it reports counts and states
 * only — never table contents, credentials or migration names.
 *   200 status "ok"        database reachable, no pending migrations
 *   200 status "degraded"  database reachable, migrations pending (run `npm run db:migrate`)
 *   503 status "error"     database unreachable
 */
export async function GET() {
  const body = { status: 'ok', app: 'The Hair Cut Pos', database: 'ok', migrations: { expected: TRACKED_MIGRATIONS.length, pending: 0 } };
  try {
    const db = Database.getInstance();
    await db.get('SELECT 1 AS ok');
    try {
      const rows = await db.all('SELECT version FROM schema_migrations');
      const applied = new Set(rows.map((row) => `${row.version}.sql`));
      body.migrations.pending = TRACKED_MIGRATIONS.filter((file) => !applied.has(file)).length;
    } catch {
      body.migrations.pending = TRACKED_MIGRATIONS.length;
    }
    if (body.migrations.pending > 0) body.status = 'degraded';
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Health check: database unreachable:', error?.message || error);
    return NextResponse.json({ ...body, status: 'error', database: 'unreachable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
