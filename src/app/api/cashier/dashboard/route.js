import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { mapApiError } from '@/lib/db/api-errors';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import { getDashboardTransactions, getSalonDashboardSummary } from '@/lib/reports/dashboard-summary';
import { isValidCustomRange, resolveDashboardPeriod } from '@/lib/reports/dashboard-period';
import { getSalesSeries, SALARY_EXPENSE_CATEGORIES } from '@/lib/reports/finance-summary';
import { getCurrentBusinessDay } from '@/lib/business-day/service';

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
    const currentDay = period === 'today' ? await getCurrentBusinessDay(db) : null;
    const businessDayId = currentDay?.id || null;
    const range = { startDate: useCustom ? rawStart : null, endDate: useCustom ? rawEnd : null, businessDayId };

    // Salary is ALWAYS included in the balance maths: cash salary physically leaves the
    // drawer, so excluding it made the cashier's cash figures disagree with the admin's and
    // with the Close Store reconciliation. The salary AMOUNTS are stripped below instead, so
    // a cashier still never sees payroll — the shared numbers just reconcile now.
    const dashboard = await getSalonDashboardSummary(db, period, { includeSalary: true, ...range });
    const recentBills = await getDashboardTransactions(db, period, { limit: 10, ...range });
    const salesSeries = await getSalesSeries(db, period, range);
    const isAdmin = user.role === 'admin';

    // Payroll figures are removed from the response for a cashier rather than hidden in the
    // UI, so they never travel over the wire.
    const {
      salaryExpenses, salaryExpensesCash, salaryExpensesOnline, ...financialShared
    } = dashboard.financial;
    const financial = isAdmin
      ? dashboard.financial
      : { ...financialShared, salaryWithheld: true };

    const { salaryExpenses: summarySalary, ...summaryShared } = dashboard.summary;
    const summary = isAdmin ? dashboard.summary : summaryShared;

    // Expense/salary category rows also carry payroll amounts.
    const expenseBreakdown = isAdmin
      ? dashboard.expenseBreakdown
      : dashboard.expenseBreakdown.filter((row) => !SALARY_EXPENSE_CATEGORIES.includes(row.category));
    const recentExpenses = isAdmin
      ? dashboard.recentExpenses
      : dashboard.recentExpenses.filter((row) => !SALARY_EXPENSE_CATEGORIES.includes(row.category));

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.full_name || user.username,
        role: user.role,
      },
      date: dashboard.today,
      period: dashboard.period,
      summary,
      financial,
      salesSeries,
      recentBills,
      recentCustomers: dashboard.recentCustomers,
      recentExpenses,
      staffActivity: dashboard.staffActivity,
      expenseBreakdown,
      savingsBreakdown: dashboard.savingsBreakdown,
      alerts: dashboard.alerts,
    });
  } catch (error) {
    console.error('Cashier dashboard summary failed:', error);
    const mapped = mapApiError(error, 'Unable to load the dashboard summary.');
    return NextResponse.json(
      { success: false, code: mapped.code, error: mapped.message },
      { status: mapped.status }
    );
  }
}
