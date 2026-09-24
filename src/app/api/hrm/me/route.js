import { NextResponse } from 'next/server';
import { hrmContext, hrmError, rangeFrom } from '../_shared';
import { addDays, nepalDateOf } from '@/lib/hrm/calc';
import { attendanceBoard, leaveBalances, listLeaveRequests, listLeaveTypes, myPermissions, punch, summarizeRows } from '@/lib/hrm/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The signed-in employee's own attendance, leave and HR permissions. Read-only history. */
export async function GET(request) {
  try {
    const { db, user, isEmployee } = await hrmContext(request);
    const permissions = await myPermissions(db, user);
    if (!isEmployee) return NextResponse.json({ permissions, employee: null });
    const params = new URL(request.url).searchParams;
    const range = params.get('period') || params.get('from') ? rangeFrom(params) : { from: addDays(nepalDateOf(), -29), to: nepalDateOf() };
    const board = await attendanceBoard(db, { ...range, staffId: user.id });
    const today = board.rows.find((row) => row.date === nepalDateOf()) || null;
    const open = await db.get(`SELECT attendance_date::text AS date FROM hr_attendance WHERE staff_id = ? AND clock_in IS NOT NULL AND clock_out IS NULL`, [user.id]);
    let current = today;
    if (open && open.date !== nepalDateOf()) current = (await attendanceBoard(db, { from: open.date, to: open.date, staffId: user.id })).rows[0];
    return NextResponse.json({
      permissions,
      employee: board.employees[0] ? { id: board.employees[0].id, name: board.employees[0].name, designation: board.employees[0].designation } : null,
      current,
      rows: [...board.rows].reverse(),
      summary: summarizeRows(board.rows),
      range,
      leaveTypes: (await listLeaveTypes(db)).filter((type) => type.isActive),
      leaveRequests: await listLeaveRequests(db, { staffId: user.id }),
      balances: (await leaveBalances(db, { year: Number(nepalDateOf().slice(0, 4)), staffId: user.id }))[0]?.types || [],
    });
  } catch (error) {
    return hrmError(error, 'Unable to load your attendance.');
  }
}

/** Self punch: { action: clock_in | clock_out | break_start | break_end }. Always for oneself. */
export async function POST(request) {
  try {
    const { db, user, isEmployee } = await hrmContext(request);
    if (!isEmployee) return NextResponse.json({ error: 'Only employees clock in. Use Attendance to punch for staff.' }, { status: 403 });
    const data = await request.json();
    const record = await punch(db, user, { staffId: user.id, action: data.action, source: 'EMPLOYEE' });
    return NextResponse.json({ record });
  } catch (error) {
    return hrmError(error, 'Unable to record your punch.');
  }
}
