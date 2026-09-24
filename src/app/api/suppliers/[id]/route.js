import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { PERMISSIONS, requireRoleWithPermission } from '@/lib/auth/permissions';
import { ensureSalonSchema } from '@/lib/salon-schema';
import { updateSupplier } from '@/lib/suppliers/service';
import { getSupplierProfile } from '@/lib/suppliers/profile';
import { supplierError } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function supplierId(params) {
  const id = Number(params?.id);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error('Invalid supplier');
    error.status = 400;
    throw error;
  }
  return id;
}

/** Supplier profile: summary, timeline, purchases, items, payments and the payable ledger. */
export async function GET(request, { params }) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    await requireRoleWithPermission(request, db, ['admin', 'cashier'], PERMISSIONS.SUPPLIERS_MANAGE);
    const id = supplierId(await params);
    return NextResponse.json(await getSupplierProfile(db, id));
  } catch (error) {
    return supplierError(error, 'Unable to load the supplier.');
  }
}

export async function PATCH(request, { params }) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRoleWithPermission(request, db, ['admin', 'cashier'], PERMISSIONS.SUPPLIERS_MANAGE);
    const supplier = await updateSupplier(db, user, supplierId(await params), await request.json());
    return NextResponse.json({ supplier });
  } catch (error) {
    return supplierError(error, 'Unable to update the supplier.');
  }
}
