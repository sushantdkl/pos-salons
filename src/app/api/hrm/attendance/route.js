import { NextResponse } from 'next/server';
import { hrmContext, hrmError, rangeFrom } from '../_shared';
import { PERMISSIONS } from '@/lib/auth/permissions';
import {
  assertCan, attendanceBoard, createManualAttendance, punch, summarizeByEmployee, summarizeRows,
} from '@/lib/hrm/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Attendance board for a period (+ per-employee totals). ?staffId narrows to one employee. */
export async function GET(request) {
  try {
    const { db, user } = await hrmContext(request);
    const params = new URL(request.url).searchParams;
    const staffId = Number(params.get('staffId') || 0) || null;
    if (!(staffId && staffId === Number(user.id))) await assertCan(db, user, PERMISSIONS.ATTENDANCE_VIEW);
    const range = rangeFrom(params);
    const board = await attendanceBoard(db, { from: range.from, to: range.to, staffId });
    return NextResponse.json({
      range,
      rows: board.rows,
      summary: summarizeRows(board.rows),
      byEmployee: summarizeByEmployee(board),
      employees: board.employees,
      policy: board.policy,
    });
  } catch (error) {
    return hrmError(error, 'Unable to load attendance.');
  }
}

/**
 * { action: 'punch', staffId, type: clock_in|clock_out|break_start|break_end, endBreak, reason }
 * { action: 'manual', staffId, date, clockIn, clockOut, status, halfDayReason, lateExcused, earlyLeaveApproved, notes, reason }
 */
export async function POST(request) {
  try {
    const { db, user } = await hrmContext(request);
    const data = await request.json();
    if (data.action === 'punch') {
      const self = Number(data.staffId) === Number(user.id);
      if (!self) await assertCan(db, user, PERMISSIONS.ATTENDANCE_CREATE);
      const record = await punch(db, user, { staffId: data.staffId, action: data.type, source: self ? 'EMPLOYEE' : 'ADMIN', endBreak: Boolean(data.endBreak), reason: data.reason });
      return NextResponse.json({ record });
    }
    if (data.action === 'manual') {
      await assertCan(db, user, PERMISSIONS.ATTENDANCE_EDIT);
      if (Number(data.staffId) === Number(user.id) && user.role !== 'admin') return NextResponse.json({ error: 'You cannot enter your own attendance.' }, { status: 403 });
      const record = await createManualAttendance(db, user, data);
      return NextResponse.json({ record }, { status: 201 });
    }
    return NextResponse.json({ error: 'Unknown attendance action' }, { status: 400 });
  } catch (error) {
    return hrmError(error, 'Unable to save attendance.');
  }
}
