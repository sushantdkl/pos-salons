import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import { getAppointment, transitionAppointment, updateAppointment } from '@/lib/appointments/service';
import { SERVICE_STAFF_ROLES } from '@/lib/staff/service-staff';
import { appointmentError, MANAGER_ROLES, SCHEDULE_VIEW_ROLES } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function appointmentId(params) {
  const id = Number(params?.id);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error('Invalid appointment');
    error.status = 400;
    throw error;
  }
  return id;
}

export async function GET(request, { params }) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, SCHEDULE_VIEW_ROLES);
    const appointment = await getAppointment(db, appointmentId(await params));
    if (SERVICE_STAFF_ROLES.includes(user.role)) {
      if (String(appointment.staffId) !== String(user.id)) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      delete appointment.customerPhone;
    }
    return NextResponse.json({ appointment });
  } catch (error) {
    return appointmentError(error, 'Unable to load the appointment.');
  }
}

/** Edit or reschedule (PENDING / CONFIRMED only). */
export async function PATCH(request, { params }) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, MANAGER_ROLES);
    const data = await request.json();
    const appointment = await updateAppointment(db, user, appointmentId(await params), data);
    return NextResponse.json({ appointment });
  } catch (error) {
    return appointmentError(error, 'Unable to update the appointment.');
  }
}

/** Lifecycle action: confirm, check_in, start, complete, cancel, no_show. */
export async function POST(request, { params }) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, SCHEDULE_VIEW_ROLES);
    const data = await request.json();
    const result = await transitionAppointment(db, user, appointmentId(await params), String(data.action || ''), {
      reason: data.reason,
      override: data.override,
      createToken: Boolean(data.createToken),
    });
    return NextResponse.json(result);
  } catch (error) {
    return appointmentError(error, 'Unable to update the appointment.');
  }
}
