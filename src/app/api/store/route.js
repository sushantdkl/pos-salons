import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { mapApiError } from '@/lib/db/api-errors';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import {
  closeStore,
  getStoreStatus,
  openStore,
  reopenStore,
  startNextBusinessDay,
} from '@/lib/business-day/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    await requireRole(request, db, ['admin', 'cashier']);
    const status = await getStoreStatus(db);
    return NextResponse.json({ status });
  } catch (error) {
    console.error('Store status failed:', error);
    const mapped = mapApiError(error, 'Unable to load store status.');
    return NextResponse.json({ success: false, code: mapped.code, error: mapped.message }, { status: mapped.status });
  }
}

export async function POST(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, ['admin', 'cashier']);
    const data = await request.json();
    const action = String(data.action || '').trim();

    let result;
    if (action === 'open') result = await openStore(db, user, data);
    else if (action === 'reopen') result = await reopenStore(db, user, data);
    else if (action === 'next-day') result = await startNextBusinessDay(db, user, data);
    else if (action === 'close') result = await closeStore(db, user, data);
    else return NextResponse.json({ error: 'Unknown store action' }, { status: 400 });

    const status = await getStoreStatus(db);
    return NextResponse.json({ message: 'Store updated', result, status }, { status: 200 });
  } catch (error) {
    console.error('Store action failed:', error);
    // Close blockers travel back as structured data so the UI can list them.
    if (error.code === 'CLOSE_BLOCKED') {
      return NextResponse.json(
        { success: false, code: error.code, error: error.message, blockers: error.blockers || [] },
        { status: 409 }
      );
    }
    const mapped = mapApiError(error, 'Unable to complete the store action.');
    return NextResponse.json(
      { success: false, code: mapped.code, error: mapped.message },
      { status: mapped.status === 500 ? 400 : mapped.status }
    );
  }
}
