import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { PERMISSIONS, requireRoleWithPermission } from '@/lib/auth/permissions';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import { isCanonicalAdDate } from '@/lib/dates/calendar';
import { customerLedgerOverview, supplierLedgerOverview } from '@/lib/ledgers/overview';
import { publicErrorMessage } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/ledgers/overview?kind=customer|supplier&q=&from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const params = new URL(request.url).searchParams;
    const kind = params.get('kind') === 'supplier' ? 'supplier' : 'customer';
    // Same access as the pages behind them: customer ledger admin + cashier; suppliers need the permission.
    if (kind === 'supplier') await requireRoleWithPermission(request, db, ['admin', 'cashier'], PERMISSIONS.SUPPLIERS_MANAGE);
    else await requireRole(request, db, ['admin', 'cashier']);
    const from = params.get('from') || '';
    const to = params.get('to') || '';
    if ((from && !isCanonicalAdDate(from)) || (to && !isCanonicalAdDate(to)) || (from && to && from > to)) {
      return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });
    }
    const q = String(params.get('q') || '').slice(0, 80);
    const body = kind === 'supplier' ? await supplierLedgerOverview(db, { q, from, to }) : await customerLedgerOverview(db, { q, from, to });
    return NextResponse.json({ kind, ...body });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('Ledger overview failed:', error);
    return NextResponse.json({ error: status < 500 ? error.message : publicErrorMessage(error, 'Unable to load the ledger.') }, { status });
  }
}
