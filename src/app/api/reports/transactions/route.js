import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { BILL_DATE_EXPR_B, periodDateFilter } from '@/lib/db/postgres-dates';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import { isValidCustomRange, resolveDashboardPeriod } from '@/lib/reports/dashboard-period';
import {
  billCashSql,
  billQrSql,
  getFinancialSummary,
  numeric,
  PAID_BILL_STATUS_SQL,
  paymentMethodLabel,
  qrTypeLabel,
} from '@/lib/reports/finance-summary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Full transaction report for a period, shared by the admin and cashier report pages.
 * The totals here are produced by the same getFinancialSummary() the dashboards use,
 * so a listed total can never disagree with the dashboard summary for the same period.
 */
export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, ['admin', 'cashier']);
    const { searchParams } = new URL(request.url);
    const requestedPeriod = resolveDashboardPeriod(searchParams.get('period'));
    const rawStart = searchParams.get('startDate');
    const rawEnd = searchParams.get('endDate');
    const useCustom = requestedPeriod === 'custom' && isValidCustomRange(rawStart, rawEnd);
    const period = requestedPeriod === 'custom' && !useCustom ? 'today' : requestedPeriod;
    const startDate = useCustom ? rawStart : null;
    const endDate = useCustom ? rawEnd : null;

    const billFilter = periodDateFilter(period, startDate, endDate, BILL_DATE_EXPR_B);
    const billCash = billCashSql('b');
    const billQr = billQrSql('b');

    const financial = await getFinancialSummary(db, period, {
      includeSalary: user.role === 'admin',
      startDate,
      endDate,
    });

    const bills = await db.all(`
      SELECT b.id,
             b.bill_number,
             b.customer_name,
             b.customer_phone,
             b.payment_method,
             b.subtotal,
             b.discount_amount,
             b.discount_type,
             b.tax,
             b.tax_percent,
             b.service_charge,
             b.grand_total,
             b.amount_paid,
             ${billCash} as cash_amount,
             ${billQr} as qr_amount,
             b.qr_type,
             b.total_paid,
             b.payment_status,
             b.status,
             b.token_id,
             b.is_printed,
             b.notes,
             t.token_number,
             COALESCE(cb.full_name, cb.username, '') as created_by_name,
             ${BILL_DATE_EXPR_B} as transaction_date
      FROM salon_bills b
      LEFT JOIN walk_in_tokens t ON t.id = b.token_id
      LEFT JOIN users cb ON cb.id = b.cashier_id
      WHERE ${billFilter.clause} AND ${PAID_BILL_STATUS_SQL}
      ORDER BY ${BILL_DATE_EXPR_B} DESC, b.id DESC
      LIMIT 1000
    `, billFilter.params);

    const billIds = bills.map((bill) => bill.id).filter(Boolean);
    const itemRows = billIds.length
      ? await db.all(`
          SELECT i.bill_id, i.item_type, i.name, i.quantity, i.unit_price, i.subtotal,
                 COALESCE(NULLIF(i.staff_name_snapshot, ''), NULLIF(sp.display_name, ''), u.full_name, '') as staff_name
          FROM salon_bill_items i
          LEFT JOIN users u ON u.id = i.staff_id
          LEFT JOIN staff_profiles sp ON sp.user_id = i.staff_id
          WHERE i.bill_id IN (${billIds.map(() => '?').join(',')})
          ORDER BY i.id ASC
        `, billIds)
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
        staffName: item.staff_name || '',
      });
      return acc;
    }, {});

    const transactions = bills.map((bill) => {
      const items = itemsByBill[String(bill.id)] || [];
      return {
        id: bill.id,
        billNumber: bill.bill_number,
        customerName: bill.customer_name || 'Walk-in Customer',
        customerPhone: bill.customer_phone || '',
        transactionDate: bill.transaction_date,
        paymentMethod: bill.payment_method || '',
        paymentLabel: paymentMethodLabel(bill.payment_method),
        subtotal: numeric(bill.subtotal),
        discountAmount: numeric(bill.discount_amount),
        discountType: bill.discount_type || 'amount',
        tax: numeric(bill.tax),
        taxPercent: numeric(bill.tax_percent),
        serviceCharge: numeric(bill.service_charge),
        grandTotal: numeric(bill.grand_total),
        amountPaid: numeric(bill.amount_paid),
        cashAmount: numeric(bill.cash_amount),
        qrAmount: numeric(bill.qr_amount),
        qrType: bill.qr_type || '',
        qrTypeLabel: qrTypeLabel(bill.qr_type),
        totalPaid: numeric(bill.total_paid || bill.grand_total),
        paymentStatus: bill.payment_status || 'paid',
        status: bill.status || 'paid',
        tokenId: bill.token_id || null,
        tokenNumber: bill.token_number || '',
        isPrinted: Boolean(bill.is_printed),
        createdByName: bill.created_by_name || '',
        notes: bill.notes || '',
        items,
        assignedStaff: items
          .filter((item) => item.type === 'service')
          .map((item) => `${item.name} - ${item.staffName || 'Unassigned'}`),
      };
    });

    // Totals for exactly the rows listed above, so the page footer and the header agree.
    const listed = transactions.reduce((acc, transaction) => ({
      subtotal: acc.subtotal + transaction.subtotal,
      discount: acc.discount + transaction.discountAmount,
      cash: acc.cash + transaction.cashAmount,
      qr: acc.qr + transaction.qrAmount,
      grandTotal: acc.grandTotal + transaction.grandTotal,
    }), { subtotal: 0, discount: 0, cash: 0, qr: 0, grandTotal: 0 });

    return NextResponse.json({
      role: user.role,
      period: financial.period,
      financial,
      listedTotals: { ...listed, count: transactions.length },
      transactions,
    });
  } catch (error) {
    console.error('GET /api/reports/transactions:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to load the transaction report' },
      { status: error.status || 500 }
    );
  }
}
