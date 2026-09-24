import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { PERMISSIONS, requireRoleWithPermission } from '@/lib/auth/permissions';
import { ensureSalonSchema } from '@/lib/salon-schema';
import { createSupplier, listSuppliers } from '@/lib/suppliers/service';
import { supplierError } from './_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    await requireRoleWithPermission(request, db, ['admin', 'cashier'], PERMISSIONS.SUPPLIERS_MANAGE);
    const params = new URL(request.url).searchParams;
    return NextResponse.json(await listSuppliers(db, { includeInactive: params.get('all') === '1', q: params.get('q') || '' }));
  } catch (error) {
    return supplierError(error, 'Unable to load suppliers.');
  }
}

export async function POST(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRoleWithPermission(request, db, ['admin', 'cashier'], PERMISSIONS.SUPPLIERS_MANAGE);
    const supplier = await createSupplier(db, user, await request.json());
    return NextResponse.json({ supplier }, { status: 201 });
  } catch (error) {
    return supplierError(error, 'Unable to create the supplier.');
  }
}
