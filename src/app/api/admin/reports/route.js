import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { BILL_DATE_EXPR, BILL_DATE_EXPR_B, periodDateFilter, reportsBillDateFilter } from '@/lib/db/postgres-dates';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';

function numeric(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function ensureBillingPaymentColumns(db) {
  await db.run("ALTER TABLE salon_bills ADD COLUMN IF NOT EXISTS cash_amount NUMERIC DEFAULT 0");
  await db.run("ALTER TABLE salon_bills ADD COLUMN IF NOT EXISTS qr_amount NUMERIC DEFAULT 0");
  await db.run("ALTER TABLE salon_bills ADD COLUMN IF NOT EXISTS qr_type TEXT");
  await db.run("ALTER TABLE salon_bills ADD COLUMN IF NOT EXISTS total_paid NUMERIC DEFAULT 0");
  await db.run("ALTER TABLE salon_bills ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'paid'");
}

export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    await ensureBillingPaymentColumns(db);
    await requireRole(request, db, 'admin');
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'today';
    const { clause, params } = reportsBillDateFilter(
      period,
      searchParams.get('startDate'),
      searchParams.get('endDate')
    );

    const summary = await db.get(`
      SELECT COALESCE(SUM(grand_total), 0) as totalSales,
             COUNT(*)::int as totalBills,
             COUNT(DISTINCT customer_id)::int as uniqueCustomers,
             CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(grand_total), 0) / COUNT(*) ELSE 0 END as avgBillValue
      FROM salon_bills
      WHERE ${clause} AND status = 'paid'
    `, params);

    const paymentRows = await db.all(`
      SELECT payment_method,
             qr_type,
             COUNT(*)::int as count,
             COALESCE(SUM(grand_total), 0) as amount,
             COALESCE(SUM(CASE
               WHEN payment_method = 'split' THEN cash_amount
               WHEN payment_method = 'cash' THEN grand_total
               ELSE 0
             END), 0) as cash_amount,
             COALESCE(SUM(CASE
               WHEN payment_method = 'split' THEN qr_amount
               WHEN payment_method = 'online' THEN grand_total
               ELSE 0
             END), 0) as qr_amount
      FROM salon_bills
      WHERE ${clause} AND status = 'paid'
      GROUP BY payment_method, qr_type
    `, params);
    const paymentMethods = {};
    const paymentSummary = {
      cashSales: 0,
      qrSales: 0,
      esewaPhonePaySales: 0,
      bankQrSales: 0,
      splitPaymentSales: 0,
    };
    paymentRows.forEach((row) => {
      const key = row.payment_method || 'unknown';
      const previous = paymentMethods[key] || { count: 0, amount: 0, cashAmount: 0, qrAmount: 0 };
      paymentMethods[key] = {
        count: previous.count + Number(row.count || 0),
        amount: previous.amount + numeric(row.amount),
        cashAmount: previous.cashAmount + numeric(row.cash_amount),
        qrAmount: previous.qrAmount + numeric(row.qr_amount),
      };
      paymentSummary.cashSales += numeric(row.cash_amount);
      paymentSummary.qrSales += numeric(row.qr_amount);
      if (key === 'split') paymentSummary.splitPaymentSales += numeric(row.amount);
      if (row.qr_type === 'ESEWA_PHONEPAY') paymentSummary.esewaPhonePaySales += numeric(row.qr_amount);
      if (row.qr_type === 'BANK') paymentSummary.bankQrSales += numeric(row.qr_amount);
      if (key === 'online' && !row.qr_type) paymentSummary.esewaPhonePaySales += numeric(row.qr_amount);
    });

    const itemClause = periodDateFilter(
      period,
      searchParams.get('startDate'),
      searchParams.get('endDate'),
      BILL_DATE_EXPR_B
    ).clause;
    const topServices = await db.all(`
      SELECT i.name, COUNT(*)::int as quantity, COALESCE(SUM(i.subtotal), 0) as revenue
      FROM salon_bill_items i
      JOIN salon_bills b ON b.id = i.bill_id
      WHERE ${itemClause} AND i.item_type = 'service'
      GROUP BY i.name
      ORDER BY revenue DESC
      LIMIT 10
    `, params);

    const productSales = await db.all(`
      SELECT i.name, COALESCE(SUM(i.quantity), 0) as quantity, COALESCE(SUM(i.subtotal), 0) as revenue
      FROM salon_bill_items i
      JOIN salon_bills b ON b.id = i.bill_id
      WHERE ${itemClause} AND i.item_type = 'product'
      GROUP BY i.name
      ORDER BY revenue DESC
      LIMIT 10
    `, params);

    const bestStaff = await db.all(`
      SELECT u.full_name as name, COUNT(i.id)::int as services, COALESCE(SUM(i.subtotal), 0) as revenue,
             COALESCE(SUM(i.commission_amount), 0) as commission
      FROM salon_bill_items i
      JOIN salon_bills b ON b.id = i.bill_id
      LEFT JOIN users u ON u.id = i.staff_id
      WHERE ${itemClause} AND i.item_type = 'service' AND i.staff_id IS NOT NULL
      GROUP BY i.staff_id, u.full_name
      ORDER BY revenue DESC
      LIMIT 10
    `, params);

    const transactions = await db.all(`
      SELECT id,
             bill_number,
             customer_name,
             customer_phone,
             payment_method,
             subtotal,
             discount_amount,
             tax,
             service_charge,
             grand_total,
             amount_paid,
             cash_amount,
             qr_amount,
             qr_type,
             total_paid,
             payment_status,
             ${BILL_DATE_EXPR} as transaction_date
      FROM salon_bills
      WHERE ${clause} AND status = 'paid'
      ORDER BY ${BILL_DATE_EXPR} DESC, id DESC
      LIMIT 500
    `, params);

    const lowStockProducts = await db.all(`
      SELECT name, current_stock, low_stock_threshold
      FROM salon_products
      WHERE status = 'active' AND current_stock <= low_stock_threshold
      ORDER BY current_stock ASC
      LIMIT 20
    `);

    const repeatCustomersRow = await db.get(
      'SELECT COUNT(*)::int as count FROM customers WHERE COALESCE(total_visits, 0) >= 2'
    );
    const totalCustomersRow = await db.get('SELECT COUNT(*)::int as count FROM customers');
    const commissionSummary = bestStaff.reduce((sum, row) => sum + Number(row.commission || 0), 0);
    const topService = topServices[0];
    const topStaff = bestStaff[0];
    const mostActiveCustomer = await db.get(`
      SELECT name, total_visits, total_spent
      FROM customers
      ORDER BY COALESCE(total_visits, 0) DESC, COALESCE(total_spent, 0) DESC
      LIMIT 1
    `);
    const insights = [
      topService ? `${topService.name} generated the highest service revenue for this period.` : null,
      topStaff ? `${topStaff.name} generated ${numeric(topStaff.revenue)} in service revenue for this period.` : null,
      mostActiveCustomer ? `${mostActiveCustomer.name} has visited ${mostActiveCustomer.total_visits || 0} times.` : null,
      commissionSummary > 0 ? `Total staff commission for this period is ${commissionSummary}.` : null,
    ].filter(Boolean);

    return NextResponse.json({
      totalSales: numeric(summary.totalSales),
      totalBills: Number(summary.totalBills || 0),
      totalOrders: Number(summary.totalBills || 0),
      avgBillValue: numeric(summary.avgBillValue),
      avgOrderValue: numeric(summary.avgBillValue),
      uniqueCustomers: Number(summary.uniqueCustomers || 0),
      totalCustomers: totalCustomersRow?.count || 0,
      repeatCustomers: repeatCustomersRow?.count || 0,
      paymentMethods,
      paymentSummary,
      topServices: topServices.map((item) => ({ ...item, quantity: Number(item.quantity || 0), revenue: numeric(item.revenue) })),
      topItems: topServices.map((item) => ({ ...item, quantity: Number(item.quantity || 0), revenue: numeric(item.revenue) })),
      productSales: productSales.map((item) => ({ ...item, quantity: Number(item.quantity || 0), revenue: numeric(item.revenue) })),
      transactions: transactions.map((transaction) => ({
        id: transaction.id,
        billNumber: transaction.bill_number,
        customerName: transaction.customer_name || 'Walk-in Customer',
        customerPhone: transaction.customer_phone || '',
        paymentMethod: transaction.payment_method || '',
        subtotal: numeric(transaction.subtotal),
        discountAmount: numeric(transaction.discount_amount),
        tax: numeric(transaction.tax),
        serviceCharge: numeric(transaction.service_charge),
        grandTotal: numeric(transaction.grand_total),
        amountPaid: numeric(transaction.amount_paid),
        cashAmount: numeric(transaction.cash_amount),
        qrAmount: numeric(transaction.qr_amount),
        qrType: transaction.qr_type || '',
        totalPaid: numeric(transaction.total_paid || transaction.amount_paid),
        paymentStatus: transaction.payment_status || 'paid',
        transactionDate: transaction.transaction_date,
      })),
      bestStaff: bestStaff.map((staff) => ({
        ...staff,
        services: Number(staff.services || 0),
        revenue: numeric(staff.revenue),
        commission: numeric(staff.commission),
      })),
      lowStockProducts,
      commissionSummary: numeric(commissionSummary),
      mostActiveCustomer,
      insights,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to fetch reports' }, { status: error.status || 500 });
  }
}
