import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { mapApiError } from '@/lib/db/api-errors';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import { isValidCustomRange, resolveDashboardPeriod } from '@/lib/reports/dashboard-period';
import { getAnalyticsBills } from '@/lib/reports/analytics';
import { getCurrentBusinessDay } from '@/lib/business-day/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Bills behind one Salon Analytics row (staff / service / product / customer), same period rules
 * as /api/admin/analytics. Admin only, like analytics itself.
 *   ?period=…&startDate=…&endDate=…&kind=staff|service|product|customer&id=…
 */
export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    await requireRole(request, db, 'admin');
    const { searchParams } = new URL(request.url);
    const requestedPeriod = resolveDashboardPeriod(searchParams.get('period'));
    const rawStart = searchParams.get('startDate');
    const rawEnd = searchParams.get('endDate');
    const useCustom = requestedPeriod === 'custom' && isValidCustomRange(rawStart, rawEnd);
    const period = requestedPeriod === 'custom' && !useCustom ? 'today' : requestedPeriod;
    const currentDay = period === 'today' ? await getCurrentBusinessDay(db) : null;
    const result = await getAnalyticsBills(db, period, {
      startDate: useCustom ? rawStart : null,
      endDate: useCustom ? rawEnd : null,
      businessDayId: currentDay?.id || null,
    }, { kind: searchParams.get('kind'), id: searchParams.get('id') });
    return NextResponse.json(result);
  } catch (error) {
    if (error.status === 400) return NextResponse.json({ error: error.message }, { status: 400 });
    const mapped = mapApiError(error, 'Unable to load the bills.');
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
