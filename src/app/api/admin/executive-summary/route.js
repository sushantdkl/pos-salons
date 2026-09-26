import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { mapApiError } from '@/lib/db/api-errors';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import { isValidCustomRange, resolveDashboardPeriod } from '@/lib/reports/dashboard-period';
import { getExecutiveSummary } from '@/lib/reports/executive-summary';
import { getCurrentBusinessDay } from '@/lib/business-day/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * node-postgres returns a DATE column as a JS Date at LOCAL midnight, so its local Y/M/D
 * are the intended calendar date. Formatting it through UTC would shift the label a day.
 */
function businessDateIso(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  return String(value).slice(0, 10);
}

/**
 * ADMIN EXECUTIVE SUMMARY — one request, one grouped payload.
 * Admin only: this response carries salary, commission and P&L figures that cashiers
 * and staff must never receive.
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
    // A custom range only takes effect when both ends are valid; otherwise fall back to Today.
    const useCustom = requestedPeriod === 'custom' && isValidCustomRange(rawStart, rawEnd);
    const period = requestedPeriod === 'custom' && !useCustom ? 'today' : requestedPeriod;
    const startDate = useCustom ? rawStart : null;
    const endDate = useCustom ? rawEnd : null;

    // Only "today" follows the current Business Day; every other period stays calendar-based
    // so historical reporting keeps its existing meaning.
    const currentDay = period === 'today' ? await getCurrentBusinessDay(db) : null;

    const summary = await getExecutiveSummary(db, period, {
      startDate,
      endDate,
      businessDayId: currentDay?.id || null,
      businessDate: businessDateIso(currentDay?.business_date),
      businessDayStatus: currentDay?.status || null,
    });

    return NextResponse.json({ summary });
  } catch (error) {
    console.error('Executive summary failed:', error);
    const mapped = mapApiError(error, 'Unable to load the executive summary.');
    return NextResponse.json(
      { success: false, code: mapped.code, error: mapped.message },
      { status: mapped.status }
    );
  }
}
