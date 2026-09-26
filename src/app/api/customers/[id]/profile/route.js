import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import { getCustomerProfile } from '@/lib/customers/profile';
import { publicErrorMessage } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Customer profile: visits, services used, credit ledger, credit payments, appointments, timeline. */
export async function GET(request, { params }) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    await requireRole(request, db, ['admin', 'cashier']);
    const id = Number((await params)?.id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid customer' }, { status: 400 });
    return NextResponse.json(await getCustomerProfile(db, id));
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('Customer profile failed:', error);
    return NextResponse.json({ error: status < 500 ? error.message : publicErrorMessage(error, 'Unable to load the customer.') }, { status });
  }
}
