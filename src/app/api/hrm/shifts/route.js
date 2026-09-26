import { NextResponse } from 'next/server';
import { hrmContext, hrmError } from '../_shared';
import { PERMISSIONS } from '@/lib/auth/permissions';
import {
  assertCan, assignDefaultShift, can, deleteHoliday, listAssignments, listEmployees, listHolidays, listShifts,
  removeDayOverride, saveHoliday, saveShift, setDayOverride,
} from '@/lib/hrm/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Shifts, roster history, holidays and employees. */
export async function GET(request) {
  try {
    const { db, user } = await hrmContext(request);
    if (!(await can(db, user, PERMISSIONS.SHIFT_MANAGE))) await assertCan(db, user, PERMISSIONS.ATTENDANCE_VIEW);
    const [shifts, assignments, holidays, employees] = await Promise.all([listShifts(db), listAssignments(db), listHolidays(db), listEmployees(db)]);
    return NextResponse.json({ shifts, assignments, holidays, employees });
  } catch (error) {
    return hrmError(error, 'Unable to load shifts.');
  }
}

/**
 * { action: 'save', id?, ...shift } · { action: 'assign', staffId, shiftId, effectiveFrom, offDays, notes }
 * { action: 'override', staffId, date, shiftId|null, reason } · { action: 'remove_override', staffId, date, reason }
 * { action: 'holiday', date, name, isMandatory, notes } · { action: 'delete_holiday', id }
 */
export async function POST(request) {
  try {
    const { db, user } = await hrmContext(request);
    await assertCan(db, user, PERMISSIONS.SHIFT_MANAGE);
    const data = await request.json();
    switch (data.action) {
      case 'save': return NextResponse.json({ shift: await saveShift(db, user, data.id, data) }, { status: data.id ? 200 : 201 });
      case 'assign': return NextResponse.json(await assignDefaultShift(db, user, data), { status: 201 });
      case 'override': return NextResponse.json(await setDayOverride(db, user, data));
      case 'remove_override': return NextResponse.json(await removeDayOverride(db, user, data));
      case 'holiday': return NextResponse.json(await saveHoliday(db, user, data));
      case 'delete_holiday': return NextResponse.json(await deleteHoliday(db, user, data.id));
      default: return NextResponse.json({ error: 'Unknown shift action' }, { status: 400 });
    }
  } catch (error) {
    return hrmError(error, 'Unable to save the shift.');
  }
}
