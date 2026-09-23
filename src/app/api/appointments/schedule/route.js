import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { logAction } from '@/lib/db/helpers';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import {
  addTimeOff, getStaffSchedule, removeTimeOff, saveSchedulingSettings, saveStaffWeek,
} from '@/lib/appointments/service';
import { appointmentError, MANAGER_ROLES } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Staff working hours, time off and booking settings. Reading: front desk. Changing: admin. */
export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    await requireRole(request, db, MANAGER_ROLES);
    return NextResponse.json(await getStaffSchedule(db));
  } catch (error) {
    return appointmentError(error, 'Unable to load schedules.');
  }
}

/**
 * PUT { type: 'week', staffId, week: [...7 days] }
 *     { type: 'settings', openTime, closeTime, slotMinutes, onlineBookingEnabled, instantConfirm, maxDaysAhead }
 *     { type: 'time_off', staffId, startsAt, endsAt, reason }
 */
export async function PUT(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, 'admin');
    const data = await request.json();
    if (data.type === 'week') {
      await saveStaffWeek(db, user, Number(data.staffId), data.week);
      await logAction(db, user.id, 'update_working_hours', 'staff', Number(data.staffId), 'weekly hours');
    } else if (data.type === 'settings') {
      await saveSchedulingSettings(db, data);
      await logAction(db, user.id, 'update_booking_settings', 'system_settings', null, JSON.stringify(data).slice(0, 200));
    } else if (data.type === 'time_off') {
      const id = await addTimeOff(db, user, data);
      await logAction(db, user.id, 'add_time_off', 'staff', Number(data.staffId), `time off ${id}`);
    } else {
      return NextResponse.json({ error: 'Unknown schedule update' }, { status: 400 });
    }
    return NextResponse.json(await getStaffSchedule(db));
  } catch (error) {
    return appointmentError(error, 'Unable to save the schedule.');
  }
}

export async function DELETE(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, 'admin');
    const id = Number(new URL(request.url).searchParams.get('timeOffId') || 0);
    if (!id) return NextResponse.json({ error: 'Time off entry is required' }, { status: 400 });
    await removeTimeOff(db, id);
    await logAction(db, user.id, 'remove_time_off', 'staff_time_off', id, 'removed');
    return NextResponse.json(await getStaffSchedule(db));
  } catch (error) {
    return appointmentError(error, 'Unable to remove the time off.');
  }
}
