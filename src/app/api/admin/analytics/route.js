import { PERMISSIONS, requireRoleWithPermission } from '@/lib/auth/permissions';
import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { mapApiError } from '@/lib/db/api-errors';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import { isValidCustomRange, resolveDashboardPeriod } from '@/lib/reports/dashboard-period';
import { getSalonAnalytics } from '@/lib/reports/analytics';
import { getCurrentBusinessDay } from '@/lib/business-day/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function businessDateIso(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  return String(value).slice(0, 10);
}

/**
 * SALON ANALYTICS — admin only. The payload carries payroll, staff revenue and customer
 * spend, so the role check here (not the sidebar) is what keeps it from other roles.
 */
export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    // Admin, or a cashier the owner granted “Salon analytics” in Staff Permissions.
    await requireRoleWithPermission(request, db, ['admin', 'cashier'], PERMISSIONS.REPORTS_ANALYTICS);

    const { searchParams } = new URL(request.url);
    const requestedPeriod = resolveDashboardPeriod(searchParams.get('period'));
    const rawStart = searchParams.get('startDate');
    const rawEnd = searchParams.get('endDate');
    const useCustom = requestedPeriod === 'custom' && isValidCustomRange(rawStart, rawEnd);
    const period = requestedPeriod === 'custom' && !useCustom ? 'today' : requestedPeriod;
    const currentDay = period === 'today' ? await getCurrentBusinessDay(db) : null;

    const analytics = await getSalonAnalytics(db, period, {
      startDate: useCustom ? rawStart : null,
      endDate: useCustom ? rawEnd : null,
      businessDayId: currentDay?.id || null,
      businessDate: businessDateIso(currentDay?.business_date),
      businessDayStatus: currentDay?.status || null,
    });

    return NextResponse.json({ analytics });
  } catch (error) {
    console.error('Salon analytics failed:', error);
    const mapped = mapApiError(error, 'Unable to load analytics.');
    return NextResponse.json({ success: false, code: mapped.code, error: mapped.message }, { status: mapped.status });
  }
}
