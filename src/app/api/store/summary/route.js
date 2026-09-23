import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { mapApiError } from '@/lib/db/api-errors';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import { getCloseBlockers, getOpenSession, getSessionSummary } from '@/lib/business-day/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Close Store preview: expected cash, per-session summary and any blockers. */
export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, ['admin', 'cashier']);
    const session = await getOpenSession(db);
    if (!session) {
      return NextResponse.json({ open: false, error: 'The store is not open.' }, { status: 409 });
    }
    const summary = await getSessionSummary(db, session);
    const blockers = await getCloseBlockers(db, session);
    return NextResponse.json({
      open: true,
      role: user.role,
      businessDate: session.business_date,
      sessionNumber: session.session_number,
      openedAt: session.opened_at,
      summary,
      blockers,
    });
  } catch (error) {
    console.error('Store summary failed:', error);
    const mapped = mapApiError(error, 'Unable to load the close summary.');
    return NextResponse.json({ success: false, code: mapped.code, error: mapped.message }, { status: mapped.status });
  }
}
