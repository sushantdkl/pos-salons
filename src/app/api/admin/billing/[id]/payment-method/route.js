import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { PERMISSIONS, requirePermission } from '@/lib/auth/permissions';
import { assertDrawerCashAvailable, requireOpenSession } from '@/lib/business-day/service';
import { fromMinor, toMinor } from '@/lib/payments/money';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROVIDERS = new Set(['ESEWA_PHONEPAY', 'BANK']);
const MIN_REASON = 5;

function badRequest(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/**
 * Change how a settled bill was paid — for the rush-hour slip where Cash was pressed for an
 * eSewa payment (or the other way round). Only the collected part (cash / online) can move;
 * customer credit stays exactly as it was. The bill total, items, staff and loyalty never change.
 *
 * Limited to bills from the OPEN store session: once a session is closed its drawer was counted,
 * and moving money between cash and online afterwards would silently rewrite that count.
 * Writes an immutable financial_corrections row (type payment_method_change) with the reason and
 * the before/after split. Reports count only 'void' corrections, so this is never a void.
 *
 * Body: { reason, allocations: [{ method: 'cash'|'online', amount, provider? }] }
 */
export async function POST(request, { params }) {
  try {
    const db = Database.getInstance();
    const user = await requirePermission(request, db, PERMISSIONS.BILLING_PAYMENT_METHOD_CHANGE);
    const data = await request.json().catch(() => ({}));
    const reason = String(data.reason || '').replace(/[<>]/g, '').trim().slice(0, 500);
    if (reason.length < MIN_REASON) throw badRequest(`Write the reason for changing the payment method (at least ${MIN_REASON} characters)`);
    const key = String(request.headers.get('idempotency-key') || data.idempotency_key || '').trim();
    if (!key) throw badRequest('Idempotency-Key is required');
    const prior = await db.get('SELECT id FROM financial_corrections WHERE idempotency_key = ?', [key]);
    if (prior) return NextResponse.json({ correctionId: prior.id, duplicate: true });

    const id = Number((await params)?.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Invalid bill');
    const scope = await requireOpenSession(db);

    const result = await db.transaction(async (tx) => {
      const bill = await tx.get('SELECT * FROM salon_bills WHERE id = ? FOR UPDATE', [id]);
      if (!bill) throw badRequest('Bill not found', 404);
      if (bill.status !== 'paid') throw badRequest('A cancelled bill cannot be changed');
      if (String(bill.store_session_id) !== String(scope.sessionId)) {
        throw badRequest('Only bills from the current open session can be changed. That session was already closed and its cash counted.', 409);
      }

      const existing = await tx.all('SELECT * FROM salon_payment_allocations WHERE bill_id = ? ORDER BY id', [id]);
      const credit = existing.filter((row) => row.method === 'credit');
      const collected = existing.filter((row) => row.method !== 'credit');
      const collectedMinor = collected.reduce((sum, row) => sum + toMinor(row.amount), 0);
      if (collectedMinor <= 0) throw badRequest('Nothing was collected in cash or online on this bill, so there is no payment method to change');

      // Validate and merge the new split: one cash row, one online row per provider.
      const raw = Array.isArray(data.allocations) ? data.allocations : [];
      const merged = new Map();
      for (const row of raw) {
        const method = String(row?.method || '').toLowerCase();
        if (!['cash', 'online'].includes(method)) throw badRequest('Payment method must be Cash or Online / QR');
        const amountMinor = toMinor(row.amount, method === 'cash' ? 'Cash amount' : 'Online amount');
        if (amountMinor < 0) throw badRequest('Amounts cannot be negative');
        if (amountMinor === 0) continue;
        const provider = method === 'online' ? String(row.provider || '').toUpperCase() : null;
        if (method === 'online' && !PROVIDERS.has(provider)) throw badRequest('Choose eSewa / PhonePay or Bank QR for the online part');
        const mapKey = `${method}:${provider || ''}`;
        merged.set(mapKey, { method, provider, amountMinor: (merged.get(mapKey)?.amountMinor || 0) + amountMinor });
      }
      const next = [...merged.values()];
      const nextMinor = next.reduce((sum, row) => sum + row.amountMinor, 0);
      if (!next.length || nextMinor !== collectedMinor) {
        throw badRequest(`The new payment must add up to exactly Rs ${fromMinor(collectedMinor).toFixed(2)} — the amount collected on this bill`);
      }

      const signature = (rows) => rows.map((row) => `${row.method}:${row.provider || ''}:${row.amountMinor ?? toMinor(row.amount)}`).sort().join('|');
      if (signature(next) === signature(collected.map((row) => ({ ...row, provider: row.method === 'online' ? String(row.provider || '').toUpperCase() : null })))) {
        throw badRequest('That is already how this bill was paid');
      }

      const cashOf = (rows) => rows.filter((row) => row.method === 'cash').reduce((sum, row) => sum + (row.amountMinor ?? toMinor(row.amount)), 0);
      const cashBeforeMinor = cashOf(collected);
      const cashAfterMinor = cashOf(next);
      // Moving cash to online lowers what the drawer should hold; it cannot go below zero.
      if (cashAfterMinor < cashBeforeMinor) {
        await assertDrawerCashAvailable(tx, fromMinor(cashBeforeMinor - cashAfterMinor), { label: 'change from cash' });
      }

      const before = collected.map((row) => ({ method: row.method, amount: Number(row.amount), provider: row.provider || null }));
      const after = next.map((row) => ({ method: row.method, amount: fromMinor(row.amountMinor), provider: row.provider }));
      const correction = await tx.run(`
        INSERT INTO financial_corrections(source_type, source_id, correction_type, amount, reason, metadata, business_day_id, store_session_id, created_by, idempotency_key)
        VALUES ('salon_bill', ?, 'payment_method_change', ?, ?, ?::jsonb, ?, ?, ?, ?)
      `, [id, fromMinor(collectedMinor), reason, JSON.stringify({ billNumber: bill.bill_number, before, after }), scope.businessDayId, scope.sessionId, user.id, key]);

      // Keep the cash tendered / change when the cash amount itself did not move.
      const oldCash = collected.find((row) => row.method === 'cash');
      await tx.run(`DELETE FROM salon_payment_allocations WHERE bill_id = ? AND method <> 'credit'`, [id]);
      for (let index = 0; index < next.length; index += 1) {
        const row = next[index];
        const keepTender = row.method === 'cash' && oldCash && toMinor(oldCash.amount) === row.amountMinor;
        await tx.run(`
          INSERT INTO salon_payment_allocations (bill_id, method, amount, provider, reference_number, cash_tendered, change_amount, customer_id, business_day_id, store_session_id, created_by, idempotency_key)
          VALUES (?, ?, ?, ?, NULL, ?, ?, NULL, ?, ?, ?, ?)
        `, [
          id, row.method, fromMinor(row.amountMinor), row.provider,
          row.method === 'cash' ? (keepTender ? oldCash.cash_tendered : fromMinor(row.amountMinor)) : null,
          keepTender ? oldCash.change_amount : 0,
          bill.business_day_id, bill.store_session_id, user.id, `${key}:${index}`,
        ]);
      }

      // Mirror the new split onto the bill — the reports read these columns.
      const all = [...credit.map((row) => ({ method: 'credit', amountMinor: toMinor(row.amount) })), ...next];
      const sum = (method) => all.filter((row) => row.method === method).reduce((total, row) => total + row.amountMinor, 0);
      const active = ['cash', 'online', 'credit'].filter((method) => sum(method) > 0);
      const online = next.find((row) => row.method === 'online');
      const tenderedMinor = all.reduce((total, row) => {
        if (row.method !== 'cash') return total + row.amountMinor;
        const keep = oldCash && toMinor(oldCash.amount) === row.amountMinor && oldCash.cash_tendered != null;
        return total + (keep ? toMinor(oldCash.cash_tendered) : row.amountMinor);
      }, 0);
      await tx.run(`
        UPDATE salon_bills SET payment_method = ?, cash_amount = ?, qr_amount = ?, qr_type = ?, amount_paid = ?
        WHERE id = ?
      `, [active.length === 1 ? active[0] : 'split', fromMinor(sum('cash')), fromMinor(sum('online')), online?.provider || null, fromMinor(tenderedMinor), id]);

      return { correctionId: correction.lastInsertRowid, billNumber: bill.bill_number, before, after };
    });

    return NextResponse.json({ message: `Payment method changed on ${result.billNumber}`, ...result }, { status: 201 });
  } catch (error) {
    const status = error.status || (/must|required|invalid|supports/i.test(error.message || '') ? 400 : 500);
    if (status >= 500) console.error('Payment method change failed:', error);
    return NextResponse.json({ error: status < 500 ? error.message : 'Unable to change the payment method.', code: error.code }, { status });
  }
}
