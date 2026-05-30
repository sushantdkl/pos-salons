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
        monthlySales: monthlySales.total || 0,
        avgOrder: monthlySales.avg || 0,
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
