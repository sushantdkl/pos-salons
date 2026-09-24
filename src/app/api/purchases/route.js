import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import { createPurchase, listPurchases } from '@/lib/suppliers/service';
import { supplierError } from '@/app/api/suppliers/_shared';
import { getDashboardPeriodMeta } from '@/lib/reports/dashboard-period';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    await requireRole(request, db, 'admin');
    const params = new URL(request.url).searchParams;
    // ?period=… (same vocabulary as every report) or explicit ?from&to.
    const range = params.get('period') ? getDashboardPeriodMeta(params.get('period'), params.get('startDate'), params.get('endDate')) : {};
    return NextResponse.json(await listPurchases(db, {
      from: range.startDate || params.get('from'), to: range.endDate || params.get('to'), supplierId: Number(params.get('supplierId') || 0) || null,
    }));
  } catch (error) {
    return supplierError(error, 'Unable to load purchases.');
  }
}

/** Receive stock from a supplier (optionally paying part of it now). */
export async function POST(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, 'admin');
    const data = await request.json();
    const idempotencyKey = request.headers.get('idempotency-key') || data.idempotencyKey;
    const result = await createPurchase(db, user, { ...data, idempotencyKey });
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return supplierError(error, 'Unable to record the purchase.');
  }
}
