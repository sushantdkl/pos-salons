import { NextResponse } from 'next/server';
import { hrmContext, hrmError } from '../../_shared';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { assertCan, attendanceHistory, correctAttendance, can } from '@/lib/hrm/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function recordId(params) {
  const id = Number(params?.id);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error('Invalid attendance record');
    error.status = 400;
    throw error;
  }
  return id;
}

/** Audit history of one record (original and every change). */
export async function GET(request, { params }) {
  try {
    const { db, user } = await hrmContext(request);
    await assertCan(db, user, PERMISSIONS.ATTENDANCE_VIEW);
    return NextResponse.json({ history: await attendanceHistory(db, recordId(await params)) });
  } catch (error) {
    return hrmError(error, 'Unable to load the attendance history.');
  }
}

/**
 * Correct a record: { clockIn, clockOut, status (or 'AUTO'), halfDayReason, lateExcused, earlyLeaveApproved, reason }.
 * Excusing late / approving early leave alone needs attendance.approve; anything else attendance.correct.
 * Nobody except the owner-admin corrects their own record.
 */
export async function PATCH(request, { params }) {
  try {
    const { db, user } = await hrmContext(request);
    const id = recordId(await params);
    const data = await request.json();
    const owner = await db.get('SELECT staff_id FROM hr_attendance WHERE id = ?', [id]);
    if (owner && Number(owner.staff_id) === Number(user.id) && user.role !== 'admin') {
      return NextResponse.json({ error: 'You cannot change your own attendance history.' }, { status: 403 });
    }
    const approvalOnly = ['clockIn', 'clockOut', 'status', 'halfDayReason'].every((key) => data[key] === undefined)
      && (data.lateExcused !== undefined || data.earlyLeaveApproved !== undefined);
    if (!(approvalOnly && await can(db, user, PERMISSIONS.ATTENDANCE_APPROVE))) await assertCan(db, user, PERMISSIONS.ATTENDANCE_CORRECT);
    return NextResponse.json({ record: await correctAttendance(db, user, id, data) });
  } catch (error) {
    return hrmError(error, 'Unable to correct attendance.');
  }
}
