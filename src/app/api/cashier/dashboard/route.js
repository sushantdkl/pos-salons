import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { BILL_DATE_EXPR, BILL_DATE_EXPR_B, periodDateFilter } from '@/lib/db/postgres-dates';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function numeric(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function salonDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

async function getRecentBills(db, cashierId, todayFilter) {
  const bills = await db.all(`
    SELECT b.id, b.bill_number, b.customer_name, b.grand_total, b.payment_method,
           b.cash_amount, b.qr_amount, b.qr_type, b.token_id, t.token_number,
           ${BILL_DATE_EXPR} as transaction_date
    FROM salon_bills b
    LEFT JOIN walk_in_tokens t ON t.id = b.token_id
    WHERE ${todayFilter.clause} AND b.status = 'paid' AND b.cashier_id = ?
    ORDER BY ${BILL_DATE_EXPR} DESC, b.id DESC
    LIMIT 10
  `, [...todayFilter.params, cashierId]);
  const billIds = bills.map((bill) => bill.id);
  const items = billIds.length
    ? await db.all(`
        SELECT i.bill_id, i.item_type, i.name, i.quantity, i.subtotal,
               COALESCE(NULLIF(i.staff_name_snapshot, ''), NULLIF(sp.display_name, ''), u.full_name, '') as staff_name
        FROM salon_bill_items i
        LEFT JOIN users u ON u.id = i.staff_id
        LEFT JOIN staff_profiles sp ON sp.user_id = i.staff_id
        WHERE i.bill_id IN (${billIds.map(() => '?').join(',')})
        ORDER BY i.id ASC
      `, billIds)
    : [];
  const byBill = items.reduce((acc, item) => {
    const key = String(item.bill_id);
    if (!acc[key]) acc[key] = [];
    acc[key].push({
      type: item.item_type,
      name: item.name,
      quantity: Number(item.quantity || 0),
      subtotal: numeric(item.subtotal),
      staffName: item.staff_name || '',
    });
    return acc;
  }, {});
  return bills.map((bill) => ({
    ...bill,
    grand_total: numeric(bill.grand_total),
    cash_amount: numeric(bill.cash_amount),
    qr_amount: numeric(bill.qr_amount),
    items: byBill[String(bill.id)] || [],
  }));
}

export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, ['cashier', 'admin']);
    const cashierId = user.id;
    const todayFilter = periodDateFilter('today');
    const itemTodayFilter = periodDateFilter('today', null, null, BILL_DATE_EXPR_B);
    const today = salonDateString();

    const sales = await db.get(`
      SELECT
        COUNT(*)::int as bills,
        COALESCE(SUM(grand_total), 0) as total_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN grand_total WHEN payment_method = 'split' THEN cash_amount ELSE 0 END), 0) as cash_received,
        COALESCE(SUM(CASE WHEN payment_method = 'online' THEN grand_total WHEN payment_method = 'split' THEN qr_amount ELSE 0 END), 0) as qr_received,
        COALESCE(SUM(CASE WHEN qr_type = 'ESEWA_PHONEPAY' THEN CASE WHEN payment_method = 'online' THEN grand_total ELSE qr_amount END ELSE 0 END), 0) as esewa_phonepay_received,
        COALESCE(SUM(CASE WHEN qr_type = 'BANK' THEN CASE WHEN payment_method = 'online' THEN grand_total ELSE qr_amount END ELSE 0 END), 0) as bank_qr_received,
        COALESCE(SUM(CASE WHEN payment_method = 'split' THEN cash_amount ELSE 0 END), 0) as split_cash,
        COALESCE(SUM(CASE WHEN payment_method = 'split' THEN qr_amount ELSE 0 END), 0) as split_qr,
        SUM(CASE WHEN token_id IS NULL THEN 1 ELSE 0 END)::int as direct_bills,
        SUM(CASE WHEN token_id IS NOT NULL THEN 1 ELSE 0 END)::int as token_bills,
        COUNT(DISTINCT customer_id)::int as customers_served
      FROM salon_bills
      WHERE ${todayFilter.clause} AND status = 'paid' AND cashier_id = ?
    `, [...todayFilter.params, cashierId]);

    const itemCounts = await db.get(`
      SELECT
        COALESCE(SUM(CASE WHEN i.item_type = 'service' THEN i.quantity ELSE 0 END), 0)::int as services_sold,
        COALESCE(SUM(CASE WHEN i.item_type = 'product' THEN i.quantity ELSE 0 END), 0)::int as products_sold
      FROM salon_bill_items i
      JOIN salon_bills b ON b.id = i.bill_id
      WHERE ${itemTodayFilter.clause} AND b.status = 'paid' AND b.cashier_id = ?
    `, [...itemTodayFilter.params, cashierId]);

    const tokens = await db.get(`
      SELECT
        COUNT(*)::int as generated,
        SUM(CASE WHEN status = 'BILLED' AND invoice_id IS NOT NULL THEN 1 ELSE 0 END)::int as converted,
        SUM(CASE WHEN status = 'WAITING' THEN 1 ELSE 0 END)::int as waiting
      FROM walk_in_tokens
      WHERE token_date = ?::date AND created_by = ?
    `, [today, cashierId]);

    const expenses = await db.get(`
      SELECT
        COALESCE(SUM(CASE WHEN record_type = 'EXPENSE' THEN amount ELSE 0 END), 0) as petty_expenses,
        COALESCE(SUM(CASE WHEN record_type = 'CASH_TRANSFER' THEN amount ELSE 0 END), 0) as daily_saving
      FROM expenses
      WHERE deleted_at IS NULL AND expense_date = ?::date AND created_by = ?
    `, [today, cashierId]);

    const recentCustomers = await db.all(`
      SELECT id, name, phone, total_visits, total_spent, created_at
      FROM customers
      ORDER BY updated_at DESC, id DESC
      LIMIT 8
    `);

    const recentExpenses = await db.all(`
      SELECT id, title, category, amount, record_type, expense_date, created_at
      FROM expenses
      WHERE deleted_at IS NULL AND created_by = ?
      ORDER BY expense_date DESC, id DESC
      LIMIT 8
    `, [cashierId]);

    return NextResponse.json({
      summary: {
        totalBills: Number(sales?.bills || 0),
        totalSales: numeric(sales?.total_sales),
        cashReceived: numeric(sales?.cash_received),
        qrReceived: numeric(sales?.qr_received),
        esewaPhonePayReceived: numeric(sales?.esewa_phonepay_received),
        bankQrReceived: numeric(sales?.bank_qr_received),
        splitCash: numeric(sales?.split_cash),
        splitQr: numeric(sales?.split_qr),
        tokensGenerated: Number(tokens?.generated || 0),
        tokensConverted: Number(tokens?.converted || 0),
        directBills: Number(sales?.direct_bills || 0),
        customersServed: Number(sales?.customers_served || 0),
        servicesSold: Number(itemCounts?.services_sold || 0),
        productsSold: Number(itemCounts?.products_sold || 0),
        dailyPettyExpenses: numeric(expenses?.petty_expenses),
        dailySaving: numeric(expenses?.daily_saving),
        currentWaitingTokens: Number(tokens?.waiting || 0),
      },
      recentBills: await getRecentBills(db, cashierId, todayFilter),
      recentCustomers,
      recentExpenses: recentExpenses.map((expense) => ({ ...expense, amount: numeric(expense.amount) })),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to load cashier dashboard' }, { status: error.status || 500 });
  }
}
