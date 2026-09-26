import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { PERMISSIONS, requireRoleWithPermission } from '@/lib/auth/permissions';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import { createAppointment, listAppointments } from '@/lib/appointments/service';
import { SERVICE_STAFF_ROLES } from '@/lib/staff/service-staff';
import { appointmentError, MANAGER_ROLES, SCHEDULE_VIEW_ROLES } from './_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** List appointments for a date range. Service staff only ever receive their own. */
export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, SCHEDULE_VIEW_ROLES);
    const params = new URL(request.url).searchParams;
    const ownOnly = SERVICE_STAFF_ROLES.includes(user.role);
    const appointments = await listAppointments(db, {
      from: params.get('from'),
      to: params.get('to'),
      staffId: ownOnly ? user.id : Number(params.get('staffId') || 0) || null,
      status: params.get('status') || null,
      q: params.get('q') || '',
    });
    // Staff see their schedule, not customer phone numbers.
    return NextResponse.json({
      appointments: ownOnly ? appointments.map(({ customerPhone, ...rest }) => rest) : appointments,
    });
  } catch (error) {
    return appointmentError(error, 'Unable to load appointments.');
  }
}

export async function POST(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRoleWithPermission(request, db, MANAGER_ROLES, PERMISSIONS.APPOINTMENTS_MANAGE);
    const data = await request.json();
    const idempotencyKey = request.headers.get('idempotency-key') || data.idempotencyKey;
    const result = await createAppointment(db, user, { ...data, idempotencyKey });
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return appointmentError(error, 'Unable to create the appointment.');
  }
}
