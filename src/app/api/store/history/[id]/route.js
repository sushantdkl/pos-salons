import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { mapApiError } from '@/lib/db/api-errors';
import { PERMISSIONS, requireRoleWithPermission } from '@/lib/auth/permissions';
import { getBusinessDayReport } from '@/lib/business-day/day-report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** One business day in full, for the day details popup. Salary lines are admin-only. */
export async function GET(request, { params }) {
  try {
    const db = Database.getInstance();
    const user = await requireRoleWithPermission(request, db, ['admin', 'cashier'], PERMISSIONS.REPORTS_BUSINESS_DAYS);
    const { id } = await params;
    const report = await getBusinessDayReport(db, Number(id), { forAdmin: user.role === 'admin' });
    if (!report) return NextResponse.json({ error: 'Business day not found' }, { status: 404 });
    return NextResponse.json(report);
  } catch (error) {
    console.error('Business day report failed:', error);
    const mapped = mapApiError(error, 'Unable to load this business day.');
    return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.status });
  }
}
