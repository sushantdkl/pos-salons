import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import { paySupplier, voidSupplierPayment } from '@/lib/suppliers/service';
import { supplierError } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST { supplierId, amount, method: 'cash'|'online', paymentDate?, purchaseId?, reference?, notes? }
 *      -> pay a supplier (one Product Purchase expense; cash is checked against the drawer)
 * POST { action: 'void', paymentId, reason } -> void today's payment while its drawer session is open
 */
export async function POST(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, 'admin');
    const data = await request.json();
    if (data.action === 'void') {
      return NextResponse.json(await voidSupplierPayment(db, user, Number(data.paymentId), data.reason));
    }
    const idempotencyKey = request.headers.get('idempotency-key') || data.idempotencyKey;
    const payment = await paySupplier(db, user, { ...data, idempotencyKey });
    return NextResponse.json({ payment }, { status: payment.duplicate ? 200 : 201 });
  } catch (error) {
    return supplierError(error, 'Unable to record the supplier payment.');
  }
}
