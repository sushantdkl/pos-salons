import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { BILL_DATE_EXPR_B, periodDateFilter } from '@/lib/db/postgres-dates';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import { getDashboardTransactions, getSalonDashboardSummary, PAID_BILL_STATUS_SQL } from '@/lib/reports/dashboard-summary';
import { getSalesSeries } from '@/lib/reports/finance-summary';
import { isValidCustomRange, resolveDashboardPeriod } from '@/lib/reports/dashboard-period';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function numeric(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    await requireRole(request, db, 'admin');
    const { searchParams } = new URL(request.url);
    const requestedPeriod = resolveDashboardPeriod(searchParams.get('period'));
    // A custom range only takes effect when both ends are valid; otherwise fall back to Today.
    const rawStart = searchParams.get('startDate');
    const rawEnd = searchParams.get('endDate');
    const useCustom = requestedPeriod === 'custom' && isValidCustomRange(rawStart, rawEnd);
    const period = requestedPeriod === 'custom' && !useCustom ? 'today' : requestedPeriod;
    const startDate = useCustom ? rawStart : null;
    const endDate = useCustom ? rawEnd : null;
    const range = { startDate, endDate };

    const dashboard = await getSalonDashboardSummary(db, period, range);
    const itemFilter = periodDateFilter(period, startDate, endDate, BILL_DATE_EXPR_B);

    const totalServicesRow = await db.get('SELECT COUNT(*)::int as count FROM salon_services WHERE is_active = TRUE');
    const totalStaffRow = await db.get('SELECT COUNT(*)::int as count FROM users WHERE is_active = TRUE');
    const totalCustomersRow = await db.get('SELECT COUNT(*)::int as count FROM customers');
    const repeatCustomersRow = await db.get('SELECT COUNT(*)::int as count FROM customers WHERE COALESCE(total_visits, 0) >= 2');
    const commissionRow = await db.get(`
      SELECT COALESCE(SUM(i.commission_amount), 0) as total
      FROM salon_bill_items i
      JOIN salon_bills b ON b.id = i.bill_id
      WHERE i.item_type = 'service' AND ${PAID_BILL_STATUS_SQL} AND ${itemFilter.clause}
    `, itemFilter.params);

    const billFilter = periodDateFilter(period, startDate, endDate, BILL_DATE_EXPR_B);
    const topCustomers = await db.all(`
      SELECT b.customer_name as name, COALESCE(SUM(b.grand_total), 0) as total_spent, COUNT(DISTINCT b.id)::int as visits
      FROM salon_bills b
      WHERE ${PAID_BILL_STATUS_SQL} AND ${billFilter.clause} AND b.customer_name IS NOT NULL
      GROUP BY b.customer_name
      ORDER BY total_spent DESC
      LIMIT 5
    `, billFilter.params);

    const topServices = await db.all(`
      SELECT i.name, COUNT(i.id)::int as count, COALESCE(SUM(i.subtotal), 0) as revenue
      FROM salon_bill_items i
      JOIN salon_bills b ON b.id = i.bill_id
      WHERE i.item_type = 'service' AND ${PAID_BILL_STATUS_SQL} AND ${itemFilter.clause}
      GROUP BY i.name
      ORDER BY revenue DESC
      LIMIT 5
    `, itemFilter.params);

    const recentTransactions = await getDashboardTransactions(db, period, { limit: 8, ...range });
    const salesSeries = await getSalesSeries(db, period, range);
    const totalCustomers = Number(totalCustomersRow?.count || 0);
    const repeatCustomers = Number(repeatCustomersRow?.count || 0);
    const summary = dashboard.summary;
    const repeatCustomerRate = totalCustomers > 0 ? Math.round((repeatCustomers / totalCustomers) * 100) : 0;

    return NextResponse.json({
      stats: {
        period: dashboard.period,
        financial: dashboard.financial,
        todaySales: summary.totalSales,
        todayOrders: summary.totalBills,
        todayCosts: summary.dailyPettyExpenses,
        totalProducts: Number(totalServicesRow?.count || 0),
        totalEmployees: Number(totalStaffRow?.count || 0),
        totalCustomers,
        todayCustomers: summary.customersServed,
        todayServices: summary.servicesSold,
        weeklyRevenue: summary.totalSales,
        monthlySales: summary.totalSales,
        avgOrder: summary.avgBillValue,
        repeatCustomerRate,
        commissionSummary: numeric(commissionRow?.total),
        paymentSummary: {
          cashSales: summary.cashReceived,
          qrSales: summary.qrReceived,
          splitPaymentSales: summary.splitCash + summary.splitQr,
          esewaPhonePaySales: summary.esewaPhonePayReceived,
          bankQrSales: summary.bankQrReceived,
        },
        tokenStats: {
          generated: summary.tokensGenerated,
          digitalTokens: summary.digitalTokens,
          printedTokens: summary.printedTokens,
          waiting: summary.currentWaitingTokens,
          billed: summary.tokensConverted,
          cancelled: summary.tokensCancelledNoShow,
          noShow: 0,
          billsDone: summary.tokensConverted,
          digitalBills: summary.digitalBills,
          printedBills: summary.printedBills,
          billsWithoutToken: summary.directBills,
          directBills: summary.directBills,
          tokenBills: summary.tokenBills,
          mismatchWarning: dashboard.alerts.tokenMismatch > 0,
        },
        topCustomers,
        topServices: topServices.map((item) => ({ ...item, count: Number(item.count || 0), revenue: numeric(item.revenue) })),
        topStaff: dashboard.staffActivity.slice(0, 5).map((staff) => ({
          name: staff.staffName,
          salon_role: staff.role,
          services: staff.servicesCompleted,
          revenue: staff.revenue,
        })),
        growthPercent: 0,
        salesSeries,
        revenueSources: dashboard.revenueSources,
        lowStockItems: dashboard.alerts.lowStock.map((item) => ({
          name: item.name,
          qty: item.currentStock,
          unit: 'pcs',
          status: item.currentStock <= item.lowStockThreshold * 0.5 ? 'critical' : 'low',
        })),
        summary,
        expenseBreakdown: dashboard.expenseBreakdown,
        savingsBreakdown: dashboard.savingsBreakdown,
        recentTransactions,
      },
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard stats' },
      { status: error.status || 500 }
    );
  }
}
