import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';

export async function GET(request) {
  try {
    const db = Database.getInstance().db;
    ensureSalonSchema(db);
    requireRole(request, db, 'admin');

    const todaySales = db.prepare("SELECT COALESCE(SUM(grand_total), 0) as total, COUNT(*) as count FROM salon_bills WHERE DATE(created_at) = DATE('now') AND status = 'paid'").get();
    const yesterdaySales = db.prepare("SELECT COALESCE(SUM(grand_total), 0) as total, COUNT(*) as count FROM salon_bills WHERE DATE(created_at) = DATE('now', '-1 day') AND status = 'paid'").get();
    const monthlySales = db.prepare("SELECT COALESCE(SUM(grand_total), 0) as total, COALESCE(AVG(grand_total), 0) as avg FROM salon_bills WHERE DATE(created_at) >= DATE('now', '-29 days') AND status = 'paid'").get();
    const lastMonthSales = db.prepare("SELECT COALESCE(SUM(grand_total), 0) as total FROM salon_bills WHERE DATE(created_at) BETWEEN DATE('now', '-59 days') AND DATE('now', '-30 days') AND status = 'paid'").get();
    const growthPercent = lastMonthSales.total > 0 ? Math.round(((monthlySales.total - lastMonthSales.total) / lastMonthSales.total) * 100) : 0;

    const weeklySales = [];
    for (let i = 6; i >= 0; i--) {
      const row = db.prepare("SELECT COALESCE(SUM(grand_total), 0) as total FROM salon_bills WHERE DATE(created_at) = DATE('now', ?) AND status = 'paid'").get(`-${i} days`);
      const date = new Date();
      date.setDate(date.getDate() - i);
      weeklySales.push({ day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()], sales: row.total || 0 });
    }

    const revenueSources = db.prepare(`
      SELECT item_type as type, COALESCE(SUM(subtotal), 0) as amount
      FROM salon_bill_items
      WHERE DATE(created_at) >= DATE('now', '-29 days')
      GROUP BY item_type
    `).all();
    const totalRevenue = revenueSources.reduce((sum, row) => sum + row.amount, 0);

    const lowStockItems = db.prepare(`
      SELECT name, current_stock as qty, low_stock_threshold
      FROM salon_products
      WHERE status = 'active' AND current_stock <= low_stock_threshold
      ORDER BY current_stock ASC
      LIMIT 6
    `).all();

    const totalServices = db.prepare('SELECT COUNT(*) as count FROM salon_services WHERE is_active = 1').get().count;
    const totalStaff = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_active = 1').get().count;
    const totalCustomers = db.prepare('SELECT COUNT(*) as count FROM customers').get().count;
    const todayCustomers = db.prepare("SELECT COUNT(DISTINCT customer_id) as count FROM salon_bills WHERE DATE(created_at) = DATE('now') AND status = 'paid' AND customer_id IS NOT NULL").get().count;
    const todayServices = db.prepare("SELECT COUNT(*) as count FROM salon_bill_items WHERE item_type = 'service' AND DATE(created_at) = DATE('now')").get().count;
    const weeklyRevenue = db.prepare("SELECT COALESCE(SUM(grand_total), 0) as total FROM salon_bills WHERE DATE(created_at) >= DATE('now', '-6 days') AND status = 'paid'").get().total;
    const topCustomers = db.prepare(`
      SELECT customer_name as name, COALESCE(SUM(grand_total), 0) as total_spent, COUNT(*) as visits
      FROM salon_bills
      WHERE status = 'paid' AND customer_name IS NOT NULL
      GROUP BY customer_name
      ORDER BY total_spent DESC
      LIMIT 5
    `).all();
    const topServices = db.prepare(`
      SELECT name, COUNT(*) as count, COALESCE(SUM(subtotal), 0) as revenue
      FROM salon_bill_items
      WHERE item_type = 'service'
      GROUP BY name
      ORDER BY revenue DESC
      LIMIT 5
    `).all();
    const topStaff = db.prepare(`
      SELECT COALESCE(sp.display_name, u.full_name) as name, sp.salon_role, COUNT(sbi.id) as services, COALESCE(SUM(sbi.subtotal), 0) as revenue
      FROM salon_bill_items sbi
      JOIN users u ON u.id = sbi.staff_id
      LEFT JOIN staff_profiles sp ON sp.user_id = u.id
      WHERE sbi.item_type = 'service'
      GROUP BY u.id
      ORDER BY revenue DESC
      LIMIT 5
    `).all();
    const commissionSummary = db.prepare("SELECT COALESCE(SUM(commission_amount), 0) as total FROM salon_bill_items WHERE item_type = 'service'").get().total;
    const repeatCustomers = db.prepare('SELECT COUNT(*) as count FROM customers WHERE COALESCE(total_visits, 0) >= 2').get().count;
    const repeatCustomerRate = totalCustomers > 0 ? Math.round((repeatCustomers / totalCustomers) * 100) : 0;
    const tokenStats = db.prepare(`
      SELECT
        COUNT(*) as generated,
        SUM(CASE WHEN status IN ('WAITING', 'CALLED') THEN 1 ELSE 0 END) as waiting,
        SUM(CASE WHEN status = 'IN_SERVICE' THEN 1 ELSE 0 END) as inService,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'BILLED' THEN 1 ELSE 0 END) as billed,
        SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN status = 'NO_SHOW' THEN 1 ELSE 0 END) as noShow
      FROM walk_in_tokens
      WHERE token_date = DATE('now')
    `).get();
    const billsWithoutToken = db.prepare("SELECT COUNT(*) as count FROM salon_bills WHERE DATE(created_at) = DATE('now') AND status = 'paid' AND token_id IS NULL").get().count;

    return NextResponse.json({
      stats: {
        todaySales: todaySales.total || 0,
        todayOrders: todaySales.count || 0,
        yesterdaySales: yesterdaySales.total || 0,
        yesterdayOrders: yesterdaySales.count || 0,
        todayCosts: 0,
        totalProducts: totalServices || 0,
        totalEmployees: totalStaff || 0,
        totalCustomers: totalCustomers || 0,
        todayCustomers: todayCustomers || 0,
        todayServices: todayServices || 0,
        weeklyRevenue: weeklyRevenue || 0,
        monthlySales: monthlySales.total || 0,
        avgOrder: monthlySales.avg || 0,
        repeatCustomerRate,
        commissionSummary: commissionSummary || 0,
        tokenStats: {
          generated: tokenStats.generated || 0,
          waiting: tokenStats.waiting || 0,
          inService: tokenStats.inService || 0,
          completed: tokenStats.completed || 0,
          billed: tokenStats.billed || 0,
          cancelled: tokenStats.cancelled || 0,
          noShow: tokenStats.noShow || 0,
          billsWithoutToken: billsWithoutToken || 0,
          mismatchWarning: Number(tokenStats.completed || 0) > 0 || Number(billsWithoutToken || 0) > 0
        },
        topCustomers,
        topServices,
        topStaff,
        growthPercent,
        weeklySales,
        revenueSources: revenueSources.map((row) => ({
          type: row.type,
          amount: row.amount,
          percentage: totalRevenue > 0 ? Math.round((row.amount / totalRevenue) * 100) : 0
        })),
        lowStockItems: lowStockItems.map((item) => ({
          name: item.name,
          qty: item.qty,
          unit: 'pcs',
          status: item.qty <= item.low_stock_threshold * 0.5 ? 'critical' : 'low'
        }))
      }
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch dashboard stats', details: error.message }, { status: error.status || 500 });
  }
}
