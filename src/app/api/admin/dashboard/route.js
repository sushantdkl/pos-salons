import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { billDateDaysAgo } from '@/lib/db/postgres-dates';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';

export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    await requireRole(request, db, 'admin');

    const todaySales = await db.get(
      "SELECT COALESCE(SUM(grand_total), 0) as total, COUNT(*)::int as count FROM salon_bills WHERE created_at::date = CURRENT_DATE AND status = 'paid'"
    );
    const yesterdaySales = await db.get(
      "SELECT COALESCE(SUM(grand_total), 0) as total, COUNT(*)::int as count FROM salon_bills WHERE created_at::date = CURRENT_DATE - INTERVAL '1 day' AND status = 'paid'"
    );
    const monthlySales = await db.get(
      "SELECT COALESCE(SUM(grand_total), 0) as total, COALESCE(AVG(grand_total), 0) as avg FROM salon_bills WHERE created_at::date >= CURRENT_DATE - INTERVAL '29 days' AND status = 'paid'"
    );
    const lastMonthSales = await db.get(
      "SELECT COALESCE(SUM(grand_total), 0) as total FROM salon_bills WHERE created_at::date >= CURRENT_DATE - INTERVAL '59 days' AND created_at::date < CURRENT_DATE - INTERVAL '30 days' AND status = 'paid'"
    );
    const growthPercent = lastMonthSales.total > 0
      ? Math.round(((monthlySales.total - lastMonthSales.total) / lastMonthSales.total) * 100)
      : 0;

    const weeklySales = [];
    for (let i = 6; i >= 0; i--) {
      const row = await db.get(
        `SELECT COALESCE(SUM(grand_total), 0) as total FROM salon_bills WHERE ${billDateDaysAgo(i)} AND status = 'paid'`
      );
      const date = new Date();
      date.setDate(date.getDate() - i);
      weeklySales.push({
        day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()],
        sales: Number(row.total || 0),
      });
    }

    const revenueSources = await db.all(`
      SELECT item_type as type, COALESCE(SUM(subtotal), 0) as amount
      FROM salon_bill_items
      WHERE created_at::date >= CURRENT_DATE - INTERVAL '29 days'
      GROUP BY item_type
    `);
    const totalRevenue = revenueSources.reduce((sum, row) => sum + Number(row.amount), 0);

    const lowStockItems = await db.all(`
      SELECT name, current_stock as qty, low_stock_threshold
      FROM salon_products
      WHERE status = 'active' AND current_stock <= low_stock_threshold
      ORDER BY current_stock ASC
      LIMIT 6
    `);

    const totalServicesRow = await db.get('SELECT COUNT(*)::int as count FROM salon_services WHERE is_active = TRUE');
    const totalStaffRow = await db.get('SELECT COUNT(*)::int as count FROM users WHERE is_active = TRUE');
    const totalCustomersRow = await db.get('SELECT COUNT(*)::int as count FROM customers');
    const todayCustomersRow = await db.get(
      "SELECT COUNT(DISTINCT customer_id)::int as count FROM salon_bills WHERE created_at::date = CURRENT_DATE AND status = 'paid' AND customer_id IS NOT NULL"
    );
    const todayServicesRow = await db.get(
      "SELECT COUNT(*)::int as count FROM salon_bill_items WHERE item_type = 'service' AND created_at::date = CURRENT_DATE"
    );
    const weeklyRevenueRow = await db.get(
      "SELECT COALESCE(SUM(grand_total), 0) as total FROM salon_bills WHERE created_at::date >= CURRENT_DATE - INTERVAL '6 days' AND status = 'paid'"
    );
    const topCustomers = await db.all(`
      SELECT customer_name as name, COALESCE(SUM(grand_total), 0) as total_spent, COUNT(*)::int as visits
      FROM salon_bills
      WHERE status = 'paid' AND customer_name IS NOT NULL
      GROUP BY customer_name
      ORDER BY total_spent DESC
      LIMIT 5
    `);
    const topServices = await db.all(`
      SELECT name, COUNT(*)::int as count, COALESCE(SUM(subtotal), 0) as revenue
      FROM salon_bill_items
      WHERE item_type = 'service'
      GROUP BY name
      ORDER BY revenue DESC
      LIMIT 5
    `);
    const topStaff = await db.all(`
      SELECT COALESCE(sp.display_name, u.full_name) as name, sp.salon_role, COUNT(sbi.id)::int as services, COALESCE(SUM(sbi.subtotal), 0) as revenue
      FROM salon_bill_items sbi
      JOIN users u ON u.id = sbi.staff_id
      LEFT JOIN staff_profiles sp ON sp.user_id = u.id
      WHERE sbi.item_type = 'service'
      GROUP BY u.id, sp.display_name, u.full_name, sp.salon_role
      ORDER BY revenue DESC
      LIMIT 5
    `);
    const commissionRow = await db.get(
      "SELECT COALESCE(SUM(commission_amount), 0) as total FROM salon_bill_items WHERE item_type = 'service'"
    );
    const repeatCustomersRow = await db.get(
      'SELECT COUNT(*)::int as count FROM customers WHERE COALESCE(total_visits, 0) >= 2'
    );
    const totalCustomers = Number(totalCustomersRow?.count || 0);
    const repeatCustomers = Number(repeatCustomersRow?.count || 0);
    const repeatCustomerRate = totalCustomers > 0 ? Math.round((repeatCustomers / totalCustomers) * 100) : 0;

    const tokenStats = await db.get(`
      SELECT
        COUNT(*)::int as generated,
        SUM(CASE WHEN NOT COALESCE(is_printed, FALSE) THEN 1 ELSE 0 END)::int as digitalTokens,
        SUM(CASE WHEN COALESCE(is_printed, FALSE) THEN 1 ELSE 0 END)::int as printedTokens,
        SUM(CASE WHEN status = 'WAITING' THEN 1 ELSE 0 END)::int as waiting,
        SUM(CASE WHEN status = 'BILLED' THEN 1 ELSE 0 END)::int as billed,
        SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END)::int as cancelled,
        SUM(CASE WHEN status = 'NO_SHOW' THEN 1 ELSE 0 END)::int as noShow
      FROM walk_in_tokens
      WHERE token_date = CURRENT_DATE AND status IN ('WAITING', 'BILLED', 'CANCELLED', 'NO_SHOW')
    `);
    const billPrintStats = await db.get(`
      SELECT
        COUNT(*)::int as billsDone,
        SUM(CASE WHEN NOT COALESCE(is_printed, FALSE) THEN 1 ELSE 0 END)::int as digitalBills,
        SUM(CASE WHEN COALESCE(is_printed, FALSE) THEN 1 ELSE 0 END)::int as printedBills,
        SUM(CASE WHEN token_id IS NULL THEN 1 ELSE 0 END)::int as billsWithoutToken
      FROM salon_bills
      WHERE created_at::date = CURRENT_DATE AND status = 'paid'
    `);

    return NextResponse.json({
      stats: {
        todaySales: Number(todaySales.total || 0),
        todayOrders: Number(todaySales.count || 0),
        yesterdaySales: Number(yesterdaySales.total || 0),
        yesterdayOrders: Number(yesterdaySales.count || 0),
        todayCosts: 0,
        totalProducts: Number(totalServicesRow?.count || 0),
        totalEmployees: Number(totalStaffRow?.count || 0),
        totalCustomers,
        todayCustomers: Number(todayCustomersRow?.count || 0),
        todayServices: Number(todayServicesRow?.count || 0),
        weeklyRevenue: Number(weeklyRevenueRow?.total || 0),
        monthlySales: Number(monthlySales.total || 0),
        avgOrder: Number(monthlySales.avg || 0),
        repeatCustomerRate,
        commissionSummary: Number(commissionRow?.total || 0),
        tokenStats: {
          generated: Number(tokenStats?.generated || 0),
          digitalTokens: Number(tokenStats?.digitalTokens || 0),
          printedTokens: Number(tokenStats?.printedTokens || 0),
          waiting: Number(tokenStats?.waiting || 0),
          billed: Number(tokenStats?.billed || 0),
          cancelled: Number(tokenStats?.cancelled || 0),
          noShow: Number(tokenStats?.noShow || 0),
          billsDone: Number(billPrintStats?.billsDone || 0),
          digitalBills: Number(billPrintStats?.digitalBills || 0),
          printedBills: Number(billPrintStats?.printedBills || 0),
          billsWithoutToken: Number(billPrintStats?.billsWithoutToken || 0),
          mismatchWarning: Number(tokenStats?.waiting || 0) > 0 || Number(billPrintStats?.billsWithoutToken || 0) > 0,
        },
        topCustomers,
        topServices,
        topStaff,
        growthPercent,
        weeklySales,
        revenueSources: revenueSources.map((row) => ({
          type: row.type,
          amount: Number(row.amount),
          percentage: totalRevenue > 0 ? Math.round((Number(row.amount) / totalRevenue) * 100) : 0,
        })),
        lowStockItems: lowStockItems.map((item) => ({
          name: item.name,
          qty: item.qty,
          unit: 'pcs',
          status: item.qty <= item.low_stock_threshold * 0.5 ? 'critical' : 'low',
        })),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch dashboard stats', details: error.message }, { status: error.status || 500 });
  }
}
