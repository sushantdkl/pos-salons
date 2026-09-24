import { NextResponse } from 'next/server';
import { crmContext, crmError, requireCrm } from '../_shared';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { adjustVisits, getCrmSettings, listTransactions, loyaltyOverview, saveProgram } from '@/lib/loyalty/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Loyalty overview, programs, customer progress and the ledger. */
export async function GET(request) {
  try {
    const { db, user } = await crmContext(request);
    await requireCrm(db, user, PERMISSIONS.LOYALTY_VIEW);
    const params = new URL(request.url).searchParams;
    const programId = Number(params.get('programId') || 0) || null;
    const [overview, transactions, settings] = await Promise.all([
      loyaltyOverview(db, { programId }),
      listTransactions(db, { programId, customerId: Number(params.get('customerId') || 0) || null, limit: 300 }),
      getCrmSettings(db),
    ]);
    return NextResponse.json({ ...overview, transactions, settings });
  } catch (error) {
    return crmError(error, 'Unable to load loyalty.');
  }
}

/** { action: 'program', id?, ...program } · { action: 'adjust', customerId, programId, visits, reason } */
export async function POST(request) {
  try {
    const { db, user } = await crmContext(request);
    const data = await request.json();
    if (data.action === 'program') {
      await requireCrm(db, user, PERMISSIONS.LOYALTY_MANAGE);
      return NextResponse.json({ program: await saveProgram(db, user, data.id, data) }, { status: data.id ? 200 : 201 });
    }
    if (data.action === 'adjust') {
      await requireCrm(db, user, PERMISSIONS.LOYALTY_ADJUST);
      return NextResponse.json(await adjustVisits(db, user, data));
    }
    return NextResponse.json({ error: 'Unknown loyalty action' }, { status: 400 });
  } catch (error) {
    return crmError(error, 'Unable to save loyalty.');
  }
}
