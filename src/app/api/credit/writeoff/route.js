import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { PERMISSIONS, requirePermission } from '@/lib/auth/permissions';
import { getOpenSession } from '@/lib/business-day/service';
import { logAction } from '@/lib/db/helpers';
import { fromMinor, toMinor } from '@/lib/payments/money';

/**
 * POST { customer_id, amount, reason } — forgive part of a customer's credit balance.
 * No money moves: it is a 'writeoff' ledger entry that reduces what the customer owes.
 * Needs the credit-override permission (Admin always), a reason, and never exceeds the balance.
 */
export async function POST(request) {
  try {
    const db = Database.getInstance();
    const user = await requirePermission(request, db, PERMISSIONS.BILLING_CREDIT_OVERRIDE);
    const data = await request.json();
    const idempotency = String(request.headers.get('idempotency-key') || data.idempotency_key || '').trim() || randomUUID();
    const prior = await db.get('SELECT id, credit FROM customer_credit_ledger WHERE idempotency_key = ?', [idempotency]);
    if (prior) return NextResponse.json({ ledgerId: prior.id, amount: Number(prior.credit), duplicate: true });

    const customerId = Number(data.customer_id || 0);
    const amountMinor = toMinor(data.amount);
    const reason = String(data.reason || '').replace(/[<>]/g, '').trim().slice(0, 300);
    if (amountMinor <= 0) return NextResponse.json({ error: 'Amount to forgive must be greater than zero' }, { status: 400 });
    if (reason.length < 3) return NextResponse.json({ error: 'Give a reason for forgiving this amount' }, { status: 400 });

    const session = await getOpenSession(db);
    const result = await db.transaction(async (tx) => {
      const customer = await tx.get('SELECT id, name FROM customers WHERE id = ? FOR UPDATE', [customerId]);
      if (!customer) throw Object.assign(new Error('Customer not found'), { status: 404 });
      const balance = await tx.get('SELECT COALESCE(SUM(debit - credit), 0) AS balance FROM customer_credit_ledger WHERE customer_id = ?', [customerId]);
      if (amountMinor > toMinor(balance.balance)) throw Object.assign(new Error('Cannot forgive more than the customer owes'), { status: 400 });
      const ledger = await tx.run(
        `INSERT INTO customer_credit_ledger(customer_id, entry_type, debit, credit, note, business_day_id, created_by, idempotency_key)
         VALUES (?, 'writeoff', 0, ?, ?, ?, ?, ?)`,
        [customerId, fromMinor(amountMinor), `Forgiven: ${reason}`, session?.business_day_id || null, user.id, idempotency],
      );
      await logAction(tx, user.id, 'credit_writeoff', 'customer', customerId, `forgave ${fromMinor(amountMinor)} — ${reason}`);
      return { ledgerId: ledger.lastInsertRowid, customer: customer.name, amount: fromMinor(amountMinor) };
    });
    return NextResponse.json({ message: 'Credit forgiven', ...result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Unable to forgive credit' }, { status: error.status || 400 });
  }
}
