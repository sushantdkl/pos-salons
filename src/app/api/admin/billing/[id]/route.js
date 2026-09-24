import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * Everything about ONE bill, for the bill-detail drawer used across the app: lines with staff,
 * how it was paid (allocations), discounts incl. loyalty, void / refund with who and why, the
 * token and appointment it settled, loyalty entries and any review. Admin and cashier only.
 */
export async function GET(request, { params }) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, ['admin', 'cashier']);
    const id = Number((await params)?.id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid bill' }, { status: 400 });

    const bill = await db.get(`
      SELECT b.*, COALESCE(u.full_name, u.username) AS cashier_name, t.token_number, a.appointment_number,
             (b.transaction_time AT TIME ZONE 'Asia/Kathmandu')::date::text AS bill_date, bd.business_date::text AS business_date,
             COALESCE(bu.full_name, bu.username) AS backdated_by_name
      FROM salon_bills b
      LEFT JOIN users u ON u.id = b.cashier_id
      LEFT JOIN users bu ON bu.id = b.backdated_by
      LEFT JOIN walk_in_tokens t ON t.id = b.token_id
      LEFT JOIN appointments a ON a.id = b.appointment_id
      LEFT JOIN business_days bd ON bd.id = b.business_day_id
      WHERE b.id = ?
    `, [id]);
    if (!bill) return NextResponse.json({ error: 'Bill not found' }, { status: 404 });

    const [items, allocations, corrections, refunds, loyalty, review, claim] = await Promise.all([
      db.all(`SELECT i.id, i.item_type, i.name, i.quantity, i.unit_price, i.subtotal, i.staff_name_snapshot, i.commission_amount, i.loyalty_reward
        FROM salon_bill_items i WHERE i.bill_id = ? ORDER BY i.id`, [id]),
      db.all(`SELECT method, amount, provider, reference_number, cash_tendered, change_amount FROM salon_payment_allocations WHERE bill_id = ? ORDER BY id`, [id]),
      db.all(`SELECT fc.correction_type, fc.amount, fc.reason, fc.created_at, COALESCE(u.full_name, u.username) AS by_name
        FROM financial_corrections fc LEFT JOIN users u ON u.id = fc.created_by WHERE fc.source_type = 'salon_bill' AND fc.source_id = ? ORDER BY fc.id`, [id]),
      db.all('SELECT method, amount, created_at FROM payment_refunds WHERE bill_id = ? ORDER BY id', [id]),
      db.all(`SELECT l.entry_type, l.visits, l.created_at, p.name AS program, r.entry_type AS reversed
        FROM loyalty_ledger l JOIN loyalty_programs p ON p.id = l.program_id LEFT JOIN loyalty_ledger r ON r.id = l.reversal_of WHERE l.bill_id = ? ORDER BY l.id`, [id]),
      db.get('SELECT overall_rating, review_text, status, submitted_at FROM customer_reviews WHERE bill_id = ? AND NOT superseded ORDER BY id DESC LIMIT 1', [id]),
      db.get('SELECT code, claimed_at, expires_at FROM loyalty_claim_codes WHERE bill_id = ?', [id]),
    ]);

    const loyaltyDiscount = round2(bill.loyalty_discount);
    return NextResponse.json({
      bill: {
        id: Number(bill.id), number: bill.bill_number, status: bill.status, paymentStatus: bill.payment_status,
        date: bill.bill_date, transactionTime: bill.transaction_time, businessDate: bill.business_date,
        customerId: bill.customer_id ? Number(bill.customer_id) : null, customerName: bill.customer_name, customerPhone: bill.customer_phone,
        cashier: bill.cashier_name, tokenNumber: bill.token_number, appointmentNumber: bill.appointment_number,
        subtotal: round2(bill.subtotal), discount: round2(bill.discount_amount - loyaltyDiscount), discountType: bill.discount_type,
        loyaltyDiscount, tax: round2(bill.tax), serviceCharge: round2(bill.service_charge), total: round2(bill.grand_total),
        paymentMethod: bill.payment_method, amountTendered: round2(bill.amount_paid), creditAmount: round2(bill.credit_amount),
        notes: bill.notes, backdated: Boolean(bill.backdated_by), backdatedBy: bill.backdated_by_name, backdatedReason: bill.backdated_reason,
        documentSnapshot: bill.document_snapshot,
      },
      items: items.map((row) => ({
        id: Number(row.id), type: row.item_type, name: row.name, quantity: Number(row.quantity), unitPrice: round2(row.unit_price), subtotal: round2(row.subtotal),
        staff: row.staff_name_snapshot, loyaltyReward: row.loyalty_reward,
        // Commission is payroll information: admin only.
        commission: user.role === 'admin' ? round2(row.commission_amount) : undefined,
      })),
      payments: allocations.map((row) => ({ method: row.method, amount: round2(row.amount), provider: row.provider, reference: row.reference_number, tendered: row.cash_tendered === null ? null : round2(row.cash_tendered), change: round2(row.change_amount) })),
      corrections: corrections.map((row) => ({ type: row.correction_type, amount: round2(row.amount), reason: row.reason, at: row.created_at, by: row.by_name })),
      refunds: refunds.map((row) => ({ method: row.method, amount: round2(row.amount), at: row.created_at })),
      loyalty: loyalty.map((row) => ({ type: row.entry_type, visits: Number(row.visits), program: row.program, at: row.created_at, reversed: row.reversed })),
      review: review ? { rating: review.overall_rating, text: review.review_text, status: review.status, at: review.submitted_at } : null,
      claimCode: claim ? { code: claim.code, claimed: Boolean(claim.claimed_at), expiresAt: claim.expires_at } : null,
    });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('Bill detail failed:', error);
    return NextResponse.json({ error: status < 500 ? error.message : 'Unable to load the bill.' }, { status });
  }
}
