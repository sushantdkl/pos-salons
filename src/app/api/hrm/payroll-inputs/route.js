import { NextResponse } from 'next/server';
import { hrmContext, hrmError } from '../_shared';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { assertCan, payrollInputs } from '@/lib/hrm/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Attendance summary for a salary month (?month=YYYY-MM&staffId=). Read-only payroll INPUT:
 * it never writes salary, expenses or drawer cash. The suggestion follows HR rules only.
 */
export async function GET(request) {
  try {
    const { db, user } = await hrmContext(request);
    await assertCan(db, user, PERMISSIONS.PAYROLL_PAYMENTS_CREATE);
    const params = new URL(request.url).searchParams;
    const staff = await payrollInputs(db, { month: params.get('month'), staffId: Number(params.get('staffId') || 0) || null });
    return NextResponse.json({ month: params.get('month'), staff });
  } catch (error) {
    return hrmError(error, 'Unable to load attendance for payroll.');
  }
}
