import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { PERMISSIONS, requireRoleWithPermission } from '@/lib/auth/permissions';
import { ensureSalonSchema } from '@/lib/salon-schema';
import { addToWaitlist, listWaitlist, removeFromWaitlist } from '@/lib/appointments/service';
import { appointmentError, MANAGER_ROLES } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    await requireRoleWithPermission(request, db, MANAGER_ROLES, PERMISSIONS.APPOINTMENTS_MANAGE);
    const params = new URL(request.url).searchParams;
    return NextResponse.json({ waitlist: await listWaitlist(db, { from: params.get('from'), to: params.get('to') }) });
  } catch (error) {
    return appointmentError(error, 'Unable to load the waitlist.');
  }
}

export async function POST(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRoleWithPermission(request, db, MANAGER_ROLES, PERMISSIONS.APPOINTMENTS_MANAGE);
    const id = await addToWaitlist(db, user, await request.json());
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return appointmentError(error, 'Unable to add to the waitlist.');
  }
}

export async function DELETE(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRoleWithPermission(request, db, MANAGER_ROLES, PERMISSIONS.APPOINTMENTS_MANAGE);
    const id = Number(new URL(request.url).searchParams.get('id') || 0);
    if (!id) return NextResponse.json({ error: 'Waitlist entry is required' }, { status: 400 });
    await removeFromWaitlist(db, user, id);
    return NextResponse.json({ removed: true });
  } catch (error) {
    return appointmentError(error, 'Unable to update the waitlist.');
  }
}
