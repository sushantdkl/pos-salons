import { NextResponse } from 'next/server';
import { hrmContext, hrmError, rangeFrom } from '../_shared';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { assertCan, can, decideOvertime, listEmployees, listOvertime, requestOvertime } from '@/lib/hrm/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { db, user } = await hrmContext(request);
    await assertCan(db, user, PERMISSIONS.OVERTIME_VIEW);
    const params = new URL(request.url).searchParams;
    const range = rangeFrom(params);
    const rows = await listOvertime(db, { ...range, status: params.get('status') || null, staffId: Number(params.get('staffId') || 0) || null });
    const sum = (status, key) => rows.filter((row) => row.status === status).reduce((total, row) => total + row[key], 0);
    return NextResponse.json({
      range, rows, employees: await listEmployees(db),
      totals: { pendingMinutes: sum('PENDING', 'potentialMinutes'), approvedMinutes: sum('APPROVED', 'approvedMinutes'), rejected: rows.filter((row) => row.status === 'REJECTED').length, pending: rows.filter((row) => row.status === 'PENDING').length },
    });
  } catch (error) {
    return hrmError(error, 'Unable to load overtime.');
  }
}

/** { action: 'request', staffId, date, minutes, reason } · { action: 'decide', id, decision, approvedMinutes, note } */
export async function POST(request) {
  try {
    const { db, user } = await hrmContext(request);
    const data = await request.json();
    if (data.action === 'request') {
      if (!(await can(db, user, PERMISSIONS.OVERTIME_APPROVE))) await assertCan(db, user, PERMISSIONS.ATTENDANCE_EDIT);
      return NextResponse.json({ overtime: await requestOvertime(db, user, data) }, { status: 201 });
    }
    if (data.action === 'decide') {
      await assertCan(db, user, PERMISSIONS.OVERTIME_APPROVE);
      const row = await db.get('SELECT staff_id FROM hr_overtime WHERE id = ?', [Number(data.id)]);
      if (row && Number(row.staff_id) === Number(user.id) && user.role !== 'admin') return NextResponse.json({ error: 'You cannot approve your own overtime.' }, { status: 403 });
      return NextResponse.json({ overtime: await decideOvertime(db, user, data.id, { decision: String(data.decision || '').toUpperCase(), approvedMinutes: data.approvedMinutes, note: data.note }) });
    }
    return NextResponse.json({ error: 'Unknown overtime action' }, { status: 400 });
  } catch (error) {
    return hrmError(error, 'Unable to save overtime.');
  }
}
