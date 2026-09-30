import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { mapApiError } from '@/lib/db/api-errors';
import { requireAuth } from '@/lib/salon-schema';
import { PERMISSIONS, assertPermission } from '@/lib/auth/permissions';
import { getOpenSession, computeExpectedCash } from '@/lib/business-day/service';
import {
  CASH_IN_REASONS, CASH_OUT_REASONS, EXCHANGE_DIRECTIONS,
  getMovementDetail, listMovements, recordMovement, reverseMovement,
} from '@/lib/cash/movements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Cash In / Cash Out (kind=cash, permission cash.movements) and Cash Exchange
 * (kind=exchange, permission cash.exchange). Admin always passes.
 */
const permissionFor = (kind) => (kind === 'exchange' ? PERMISSIONS.CASH_EXCHANGE : PERMISSIONS.CASH_MOVEMENTS);
const kindOfType = (type) => (String(type || '').toUpperCase() === 'EXCHANGE' ? 'exchange' : 'cash');

function fail(error, fallback) {
  const mapped = mapApiError(error, fallback);
  return NextResponse.json({ error: mapped.message, code: mapped.code, available: error?.available }, { status: mapped.status });
}

async function drawerSnapshot(db) {
  const session = await getOpenSession(db);
  if (!session) return { open: false };
  const expected = await computeExpectedCash(db, session);
  return { open: true, sessionId: Number(session.id), sessionNumber: Number(session.session_number || 1), businessDate: session.business_date, expectedCash: expected.expectedCash };
}

export async function GET(request) {
  try {
    const db = Database.getInstance();
    const user = await requireAuth(request, db);
    const q = new URL(request.url).searchParams;
    const id = Number(q.get('id') || 0);
    if (id) {
      const detail = await getMovementDetail(db, id);
      if (!detail) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
      await assertPermission(db, user, permissionFor(kindOfType(detail.movement.type)));
      return NextResponse.json(detail);
    }
    const kind = q.get('kind') === 'exchange' ? 'exchange' : 'cash';
    await assertPermission(db, user, permissionFor(kind));
    const result = await listMovements(db, {
      kind,
      page: q.get('page'), pageSize: q.get('pageSize'), search: q.get('search'),
      from: q.get('from'), to: q.get('to'), direction: q.get('direction'),
      period: q.get('period'), startDate: q.get('startDate'), endDate: q.get('endDate'),
    });
    return NextResponse.json({
      ...result,
      drawer: await drawerSnapshot(db),
      options: {
        cashIn: Object.entries(CASH_IN_REASONS).map(([value, label]) => ({ value, label })),
        cashOut: Object.entries(CASH_OUT_REASONS).map(([value, label]) => ({ value, label })),
        exchange: Object.entries(EXCHANGE_DIRECTIONS).map(([value, label]) => ({ value, label })),
      },
    });
  } catch (error) {
    return fail(error, 'Unable to load cash movements');
  }
}

export async function POST(request) {
  try {
    const db = Database.getInstance();
    const user = await requireAuth(request, db);
    const data = await request.json();
    await assertPermission(db, user, permissionFor(kindOfType(data.type)));
    const result = await recordMovement(db, user, {
      ...data,
      idempotencyKey: request.headers.get('idempotency-key') || data.idempotencyKey,
    });
    return NextResponse.json({ message: 'Recorded', ...result, drawer: await drawerSnapshot(db) }, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return fail(error, 'Unable to record the entry');
  }
}

/** Reverse an entry: { id, reason }. */
export async function PATCH(request) {
  try {
    const db = Database.getInstance();
    const user = await requireAuth(request, db);
    const data = await request.json();
    const detail = await getMovementDetail(db, Number(data.id || 0));
    if (!detail) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    await assertPermission(db, user, permissionFor(kindOfType(detail.movement.type)));
    const result = await reverseMovement(db, user, { id: data.id, reason: data.reason });
    return NextResponse.json({ message: 'Reversed', ...result, drawer: await drawerSnapshot(db) });
  } catch (error) {
    return fail(error, 'Unable to reverse the entry');
  }
}
