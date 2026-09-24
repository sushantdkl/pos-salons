import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { BILL_DATE_EXPR_B, periodDateFilter } from '@/lib/db/postgres-dates';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import {
  billCashSql,
  billQrSql,
  getFinancialSummary,
  numeric,
  PAID_BILL_STATUS_SQL,
  paymentMethodLabel,
  qrTypeLabel,
} from '@/lib/reports/finance-summary';

// Shared sold-bill rule: a voided bill stays a sale on its sale day; the void is deducted on
// the day it was processed (see finance-summary).
const PAID_BILL_STATUS_B = PAID_BILL_STATUS_SQL;

export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    await requireRole(request, db, 'admin');
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'today';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    // One filter, one alias, used by every bill-level query in this route.
    const { clause, params } = periodDateFilter(period, startDate, endDate, BILL_DATE_EXPR_B);
    const billCash = billCashSql('b');
    const billQr = billQrSql('b');

    const financial = await getFinancialSummary(db, period, { startDate, endDate });

    const summary = await db.get(`
      SELECT COALESCE(SUM(b.grand_total), 0) AS total_sales,
             COUNT(b.id)::int AS total_bills,
             COUNT(DISTINCT b.customer_id)::int AS unique_customers,
             CASE WHEN COUNT(b.id) > 0 THEN COALESCE(SUM(b.grand_total), 0) / COUNT(b.id) ELSE 0 END AS avg_bill_value
      FROM salon_bills b
      WHERE ${clause} AND ${PAID_BILL_STATUS_B}
    `, params);

    const paymentRows = await db.all(`
      SELECT b.payment_method,
             b.qr_type,
             COUNT(b.id)::int as count,
             COALESCE(SUM(b.grand_total), 0) as amount,
             COALESCE(SUM(${billCash}), 0) as cash_amount,
             COALESCE(SUM(${billQr}), 0) as qr_amount
      FROM salon_bills b
      WHERE ${clause} AND ${PAID_BILL_STATUS_B}
      GROUP BY b.payment_method, b.qr_type
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
    });

    const itemClause = clause;
    const topServices = await db.all(`
      SELECT i.name, COUNT(*)::int as quantity, COALESCE(SUM(i.subtotal), 0) as revenue
      FROM salon_bill_items i
      JOIN salon_bills b ON b.id = i.bill_id
      WHERE ${itemClause} AND ${PAID_BILL_STATUS_B} AND i.item_type = 'service'
      GROUP BY i.name
      ORDER BY revenue DESC
      LIMIT 10
    `, params);

    const productSales = await db.all(`
      SELECT i.name, COALESCE(SUM(i.quantity), 0) as quantity, COALESCE(SUM(i.subtotal), 0) as revenue
      FROM salon_bill_items i
      JOIN salon_bills b ON b.id = i.bill_id
      WHERE ${itemClause} AND ${PAID_BILL_STATUS_B} AND i.item_type = 'product'
      GROUP BY i.name
      ORDER BY revenue DESC
      LIMIT 10
    `, params);

    const bestStaff = await db.all(`
      SELECT COALESCE(NULLIF(i.staff_name_snapshot, ''), u.full_name, 'Former staff') as name,
             COUNT(i.id)::int as services, COALESCE(SUM(i.subtotal), 0) as revenue,
             COALESCE(SUM(i.commission_amount), 0) as commission
      FROM salon_bill_items i
      JOIN salon_bills b ON b.id = i.bill_id
      LEFT JOIN users u ON u.id = i.staff_id
      WHERE ${itemClause} AND ${PAID_BILL_STATUS_B} AND i.item_type = 'service' AND i.staff_id IS NOT NULL
      GROUP BY i.staff_id, i.staff_name_snapshot, u.full_name
      ORDER BY revenue DESC
      LIMIT 10
    `, params);

    const transactions = await db.all(`
      SELECT b.id,
             b.bill_number,
             b.customer_name,
             b.customer_phone,
             b.payment_method,
             b.subtotal,
             b.discount_amount,
             b.discount_type,
             b.notes,
             b.tax,
             b.service_charge,
             b.grand_total,
             b.amount_paid,
             ${billCash} as cash_amount,
             ${billQr} as qr_amount,
             b.qr_type,
             b.total_paid,
             b.payment_status,
             b.token_id,
             b.is_printed,
             b.status,
             t.token_number,
             COALESCE(u.full_name, u.username, '') as created_by_name,
             ${BILL_DATE_EXPR_B} as transaction_date
      FROM salon_bills b
      LEFT JOIN walk_in_tokens t ON t.id = b.token_id
      LEFT JOIN users u ON u.id = b.cashier_id
      WHERE ${clause} AND ${PAID_BILL_STATUS_B}
      ORDER BY ${BILL_DATE_EXPR_B} DESC, b.id DESC
      LIMIT 500
    `, params);

    const transactionIds = transactions.map((transaction) => transaction.id).filter(Boolean);
    const itemRows = transactionIds.length
      ? await db.all(`
          SELECT i.bill_id,
                 i.item_type,
                 i.name,
                 i.quantity,
                 i.unit_price,
                 i.subtotal,
                 i.staff_id,
                 COALESCE(NULLIF(i.staff_name_snapshot, ''), NULLIF(sp.display_name, ''), u.full_name, '') as staff_name
          FROM salon_bill_items i
          LEFT JOIN users u ON u.id = i.staff_id
          LEFT JOIN staff_profiles sp ON sp.user_id = i.staff_id
          WHERE i.bill_id IN (${transactionIds.map(() => '?').join(',')})
          ORDER BY i.id ASC
        `, transactionIds)
      : [];
    const itemsByBill = itemRows.reduce((acc, item) => {
      const key = String(item.bill_id);
      if (!acc[key]) acc[key] = [];
      acc[key].push({
        type: item.item_type,
        name: item.name,
        quantity: Number(item.quantity || 0),
        unitPrice: numeric(item.unit_price),
        subtotal: numeric(item.subtotal),
        staffId: item.staff_id || null,
        staffName: item.staff_name || '',
      });
      return acc;
    }, {});

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
    const rupees = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const insights = [
      topService ? `${topService.name} generated the highest service revenue for this period.` : null,
      topStaff ? `${topStaff.name} generated ${rupees(topStaff.revenue)} in service revenue for this period.` : null,
      mostActiveCustomer ? `${mostActiveCustomer.name} is the most regular customer: ${mostActiveCustomer.total_visits || 0} visits, ${rupees(mostActiveCustomer.total_spent)} spent in total.` : null,
      commissionSummary > 0 ? `Total staff commission for this period is ${rupees(commissionSummary)}.` : null,
    ].filter(Boolean);

    return NextResponse.json({
      period: financial.period,
      financial,
      // Net sales after voids, from the shared financial summary.
      totalSales: numeric(financial.netSalesAfterDiscount),
      totalBills: Number(summary.total_bills ?? summary.totalbills ?? summary.totalBills ?? 0),
      totalOrders: Number(summary.total_bills ?? summary.totalbills ?? summary.totalBills ?? 0),
      avgBillValue: numeric(summary.avg_bill_value ?? summary.avgbillvalue ?? summary.avgBillValue),
      avgOrderValue: numeric(summary.avg_bill_value ?? summary.avgbillvalue ?? summary.avgBillValue),
      uniqueCustomers: Number(summary.unique_customers ?? summary.uniquecustomers ?? summary.uniqueCustomers ?? 0),
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
        paymentLabel: paymentMethodLabel(transaction.payment_method),
        qrTypeLabel: qrTypeLabel(transaction.qr_type),
        subtotal: numeric(transaction.subtotal),
        discountAmount: numeric(transaction.discount_amount),
        discountType: transaction.discount_type || 'amount',
        tax: numeric(transaction.tax),
        serviceCharge: numeric(transaction.service_charge),
        grandTotal: numeric(transaction.grand_total),
        amountPaid: numeric(transaction.amount_paid),
        cashAmount: numeric(transaction.cash_amount),
        qrAmount: numeric(transaction.qr_amount),
        qrType: transaction.qr_type || 'Not recorded',
        totalPaid: numeric(transaction.total_paid || transaction.amount_paid),
        paymentStatus: transaction.payment_status || 'paid',
        status: transaction.status || 'paid',
        tokenId: transaction.token_id || null,
        tokenNumber: transaction.token_number || '',
        isPrinted: Boolean(transaction.is_printed),
        createdByName: transaction.created_by_name || '',
        notes: transaction.notes || '',
        transactionDate: transaction.transaction_date,
        items: itemsByBill[String(transaction.id)] || [],
        assignedStaff: (itemsByBill[String(transaction.id)] || [])
          .filter((item) => item.type === 'service')
          .map((item) => `${item.name} - ${item.staffName || 'Unassigned'}`),
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
