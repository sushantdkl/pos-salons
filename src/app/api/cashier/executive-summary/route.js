import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { mapApiError } from '@/lib/db/api-errors';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import { isValidCustomRange, resolveDashboardPeriod } from '@/lib/reports/dashboard-period';
import { getExecutiveSummary } from '@/lib/reports/executive-summary';
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
 * CASHIER EXECUTIVE SUMMARY — the same report as the admin one, restricted to front-desk
 * data. `scope: 'cashier'` makes the reporting service SKIP the management-only queries
 * entirely, so salary, commission, P&L, inventory purchases and staff performance are absent
 * from this response rather than hidden by the UI. Every metric both roles may see is
 * produced by the same functions and SQL as the admin report, which is what keeps the two
 * reconciled.
 */
export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    await requireRole(request, db, ['admin', 'cashier']);

    const { searchParams } = new URL(request.url);
    const requestedPeriod = resolveDashboardPeriod(searchParams.get('period'));
    const rawStart = searchParams.get('startDate');
    const rawEnd = searchParams.get('endDate');
    const useCustom = requestedPeriod === 'custom' && isValidCustomRange(rawStart, rawEnd);
    const period = requestedPeriod === 'custom' && !useCustom ? 'today' : requestedPeriod;
    const startDate = useCustom ? rawStart : null;
    const endDate = useCustom ? rawEnd : null;

    const currentDay = period === 'today' ? await getCurrentBusinessDay(db) : null;

    const summary = await getExecutiveSummary(db, period, {
      scope: 'cashier',
      startDate,
      endDate,
      businessDayId: currentDay?.id || null,
      businessDate: businessDateIso(currentDay?.business_date),
      businessDayStatus: currentDay?.status || null,
    });

    return NextResponse.json({ summary });
  } catch (error) {
    console.error('Cashier executive summary failed:', error);
    const mapped = mapApiError(error, 'Unable to load the executive summary.');
    return NextResponse.json(
      { success: false, code: mapped.code, error: mapped.message },
      { status: mapped.status }
    );
  }
}
