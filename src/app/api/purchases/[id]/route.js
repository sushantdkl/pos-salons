import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import { getPurchase, voidPurchase } from '@/lib/suppliers/service';
import { supplierError } from '@/app/api/suppliers/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function purchaseId(params) {
  const id = Number(params?.id);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error('Invalid purchase');
    error.status = 400;
    throw error;
  }
  return id;
}

export async function GET(request, { params }) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    await requireRole(request, db, 'admin');
    return NextResponse.json({ purchase: await getPurchase(db, purchaseId(await params)) });
  } catch (error) {
    return supplierError(error, 'Unable to load the purchase.');
  }
}

/** POST { action: 'void', reason } — reverses the stock; allowed while the stock is still on hand. */
export async function POST(request, { params }) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, 'admin');
    const data = await request.json();
    if (data.action !== 'void') return NextResponse.json({ error: 'Unknown purchase action' }, { status: 400 });
    const id = purchaseId(await params);
    await voidPurchase(db, user, id, data.reason);
    return NextResponse.json({ purchase: await getPurchase(db, id) });
  } catch (error) {
    return supplierError(error, 'Unable to void the purchase.');
  }
}
