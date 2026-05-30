import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';

function dateFilter(period, startDate, endDate) {
  if (period === 'today') return { clause: "DATE(created_at) = DATE('now')", params: [] };
  if (period === 'week') return { clause: "DATE(created_at) >= DATE('now', '-6 days')", params: [] };
  if (period === 'month') return { clause: "DATE(created_at) >= DATE('now', '-29 days')", params: [] };
  if (period === 'custom' && startDate && endDate) return { clause: 'DATE(created_at) BETWEEN ? AND ?', params: [startDate, endDate] };
  return { clause: '1=1', params: [] };
}

export async function GET(request) {
  try {
    const db = Database.getInstance().db;
    ensureSalonSchema(db);
    requireRole(request, db, 'admin');
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'today';
    const { clause, params } = dateFilter(period, searchParams.get('startDate'), searchParams.get('endDate'));

    const summary = db.prepare(`
      SELECT COALESCE(SUM(grand_total), 0) as totalSales,
             COUNT(*) as totalBills,
             COUNT(DISTINCT customer_id) as uniqueCustomers,
             CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(grand_total), 0) / COUNT(*) ELSE 0 END as avgBillValue
      FROM salon_bills
      WHERE ${clause} AND status = 'paid'
    `).get(...params);

    const paymentRows = db.prepare(`
      SELECT payment_method, COUNT(*) as count, COALESCE(SUM(grand_total), 0) as amount
      FROM salon_bills
      WHERE ${clause} AND status = 'paid'
      GROUP BY payment_method
    `).all(...params);
    const paymentMethods = Object.fromEntries(paymentRows.map((row) => [row.payment_method, { count: row.count, amount: row.amount }]));

    const itemClause = clause.replaceAll('created_at', 'b.created_at');
    const topServices = db.prepare(`
      SELECT i.name, COUNT(*) as quantity, COALESCE(SUM(i.subtotal), 0) as revenue
      FROM salon_bill_items i
      JOIN salon_bills b ON b.id = i.bill_id
      WHERE ${itemClause} AND i.item_type = 'service'
      GROUP BY i.name
      ORDER BY revenue DESC
      LIMIT 10
    `).all(...params);

    const productSales = db.prepare(`
      SELECT i.name, COALESCE(SUM(i.quantity), 0) as quantity, COALESCE(SUM(i.subtotal), 0) as revenue
      FROM salon_bill_items i
      JOIN salon_bills b ON b.id = i.bill_id
      WHERE ${itemClause} AND i.item_type = 'product'
      GROUP BY i.name
      ORDER BY revenue DESC
      LIMIT 10
    `).all(...params);

    const bestStaff = db.prepare(`
      SELECT u.full_name as name, COUNT(i.id) as services, COALESCE(SUM(i.subtotal), 0) as revenue,
             COALESCE(SUM(i.commission_amount), 0) as commission
      FROM salon_bill_items i
      JOIN salon_bills b ON b.id = i.bill_id
      LEFT JOIN users u ON u.id = i.staff_id
      WHERE ${itemClause} AND i.item_type = 'service' AND i.staff_id IS NOT NULL
      GROUP BY i.staff_id
      ORDER BY revenue DESC
      LIMIT 10
    `).all(...params);

    const lowStockProducts = db.prepare(`
      SELECT name, current_stock, low_stock_threshold
      FROM salon_products
      WHERE status = 'active' AND current_stock <= low_stock_threshold
      ORDER BY current_stock ASC
      LIMIT 20
    `).all();

    const repeatCustomers = db.prepare('SELECT COUNT(*) as count FROM customers WHERE COALESCE(total_visits, 0) >= 2').get().count;
    const totalCustomers = db.prepare('SELECT COUNT(*) as count FROM customers').get().count;
    const commissionSummary = bestStaff.reduce((sum, row) => sum + Number(row.commission || 0), 0);
    const topService = topServices[0];
    const topStaff = bestStaff[0];
    const mostActiveCustomer = db.prepare(`
      SELECT name, total_visits, total_spent
      FROM customers
      ORDER BY COALESCE(total_visits, 0) DESC, COALESCE(total_spent, 0) DESC
      LIMIT 1
    `).get();
    const insights = [
      topService ? `${topService.name} generated the highest service revenue for this period.` : null,
      topStaff ? `${topStaff.name} generated ${topStaff.revenue} in service revenue for this period.` : null,
      mostActiveCustomer ? `${mostActiveCustomer.name} has visited ${mostActiveCustomer.total_visits || 0} times.` : null,
      commissionSummary > 0 ? `Total staff commission for this period is ${commissionSummary}.` : null,
    ].filter(Boolean);

    return NextResponse.json({
      totalSales: summary.totalSales,
      totalBills: summary.totalBills,
      totalOrders: summary.totalBills,
      avgBillValue: summary.avgBillValue,
      avgOrderValue: summary.avgBillValue,
      uniqueCustomers: summary.uniqueCustomers,
      totalCustomers,
      repeatCustomers,
      paymentMethods,
      topServices,
      topItems: topServices,
      productSales,
      bestStaff,
      lowStockProducts,
      commissionSummary,
      mostActiveCustomer,
      insights
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to fetch reports' }, { status: error.status || 500 });
  }
}
