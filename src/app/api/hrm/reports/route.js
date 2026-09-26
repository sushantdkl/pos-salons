import { NextResponse } from 'next/server';
import { hrmContext, hrmError, rangeFrom } from '../_shared';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { assertCan, attendanceBoard, listLeaveRequests, listOvertime, summarizeByEmployee, summarizeRows } from '@/lib/hrm/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REPORTS = ['daily', 'monthly', 'late', 'absence', 'leave', 'overtime', 'missing', 'summary'];

/** Attendance reports, all from the same attendance board so they always agree. */
export async function GET(request) {
  try {
    const { db, user } = await hrmContext(request);
    await assertCan(db, user, PERMISSIONS.ATTENDANCE_VIEW);
    const params = new URL(request.url).searchParams;
    const type = REPORTS.includes(params.get('type')) ? params.get('type') : 'daily';
    const range = rangeFrom(params);
    if (type === 'leave') {
      return NextResponse.json({ type, range, rows: await listLeaveRequests(db, { from: range.from, to: range.to }) });
    }
    if (type === 'overtime') {
      return NextResponse.json({ type, range, rows: await listOvertime(db, range) });
    }
    const board = await attendanceBoard(db, { from: range.from, to: range.to });
    const summary = summarizeRows(board.rows);
    if (type === 'monthly' || type === 'summary') return NextResponse.json({ type, range, summary, rows: summarizeByEmployee(board) });
    const filter = { late: (row) => row.status === 'LATE' || (row.record?.lateMinutes || 0) > 0, absence: (row) => row.status === 'ABSENT', missing: (row) => row.status === 'MISSING_PUNCH' }[type];
    return NextResponse.json({ type, range, summary, rows: filter ? board.rows.filter(filter) : board.rows });
  } catch (error) {
    return hrmError(error, 'Unable to build the attendance report.');
  }
}
