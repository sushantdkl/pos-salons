import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import { listCustomerBalances } from '@/lib/customers/profile';
import { publicErrorMessage } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Customer Ledger overview: every customer with credit history and what they owe now. */
export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    await requireRole(request, db, ['admin', 'cashier']);
    const q = new URL(request.url).searchParams.get('q') || '';
    return NextResponse.json(await listCustomerBalances(db, { q }));
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('Customer ledger failed:', error);
    return NextResponse.json({ error: status < 500 ? error.message : publicErrorMessage(error, 'Unable to load the customer ledger.') }, { status });
  }
}
