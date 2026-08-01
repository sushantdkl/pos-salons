import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import { getDashboardTransactions, getSalonDashboardSummary } from '@/lib/reports/dashboard-summary';
import { isValidCustomRange, resolveDashboardPeriod } from '@/lib/reports/dashboard-period';
import { getSalesSeries } from '@/lib/reports/finance-summary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, ['cashier', 'admin']);
    const { searchParams } = new URL(request.url);
    const requestedPeriod = resolveDashboardPeriod(searchParams.get('period'));
    const rawStart = searchParams.get('startDate');
    const rawEnd = searchParams.get('endDate');
    const useCustom = requestedPeriod === 'custom' && isValidCustomRange(rawStart, rawEnd);
    const period = requestedPeriod === 'custom' && !useCustom ? 'today' : requestedPeriod;
    const range = { startDate: useCustom ? rawStart : null, endDate: useCustom ? rawEnd : null };

    // Salary payroll is admin-only information, so it is excluded from the cashier's balances.
    const dashboard = await getSalonDashboardSummary(db, period, { includeSalary: user.role === 'admin', ...range });
    const recentBills = await getDashboardTransactions(db, period, { limit: 10, ...range });
    const salesSeries = await getSalesSeries(db, period, range);

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.full_name || user.username,
        role: user.role,
      },
      date: dashboard.today,
      period: dashboard.period,
      summary: dashboard.summary,
      financial: dashboard.financial,
      salesSeries,
      recentBills,
      recentCustomers: dashboard.recentCustomers,
      recentExpenses: dashboard.recentExpenses,
      staffActivity: dashboard.staffActivity,
      expenseBreakdown: dashboard.expenseBreakdown,
      savingsBreakdown: dashboard.savingsBreakdown,
      alerts: dashboard.alerts,
    });
  } catch (error) {
    console.error('Cashier dashboard error:', error);
    return NextResponse.json(
      { error: 'Unable to load the dashboard summary. Please refresh and try again.' },
      { status: error.status || 500 }
    );
  }
}
