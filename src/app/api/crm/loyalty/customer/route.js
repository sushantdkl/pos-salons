import { NextResponse } from 'next/server';
import { crmContext, crmError, requireCrm } from '../../_shared';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { customerBalances } from '@/lib/loyalty/service';
import { normalizePhone } from '@/lib/validation/phone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One customer's loyalty status, for the POS ("Reward available") and the customer profile.
 * ?customerId= or ?phone=. Billing staff may read it — that is how a reward gets applied.
 */
export async function GET(request) {
  try {
    const { db, user } = await crmContext(request);
    await requireCrm(db, user, PERMISSIONS.BILLING_CREATE, PERMISSIONS.LOYALTY_VIEW);
    const params = new URL(request.url).searchParams;
    let customerId = Number(params.get('customerId') || 0) || null;
    if (!customerId && params.get('phone')) {
      const phone = normalizePhone(params.get('phone'));
      const row = phone ? await db.get('SELECT id FROM customers WHERE phone = ?', [phone]) : null;
      customerId = row ? Number(row.id) : null;
    }
    if (!customerId) return NextResponse.json({ customerId: null, programs: [] });
    const programs = (await customerBalances(db, customerId)).filter((row) => row.isActive);
    return NextResponse.json({ customerId, programs });
  } catch (error) {
    return crmError(error, 'Unable to load loyalty for this customer.');
  }
}
