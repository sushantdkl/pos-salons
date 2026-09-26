import { NextResponse } from 'next/server';
import { hrmContext, hrmError } from '../_shared';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { nepalDateOf } from '@/lib/hrm/calc';
import {
  adjustLeaveBalance, allocateLeaveYear, assertCan, decideLeave, leaveBalances, listEmployees, listHolidays,
  listLeaveRequests, listLeaveTypes, requestLeave, saveLeaveType,
} from '@/lib/hrm/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Leave requests, balances (from the ledger), types and holidays. */
export async function GET(request) {
  try {
    const { db, user } = await hrmContext(request);
    await assertCan(db, user, PERMISSIONS.LEAVE_VIEW);
    const params = new URL(request.url).searchParams;
    const year = Number(params.get('year') || nepalDateOf().slice(0, 4));
    const [requests, balances, types, employees, holidays] = await Promise.all([
      listLeaveRequests(db, { status: params.get('status') || null }),
      leaveBalances(db, { year }),
      listLeaveTypes(db),
      listEmployees(db),
      listHolidays(db, { from: `${year}-01-01`, to: `${year}-12-31` }),
    ]);
    return NextResponse.json({ year, requests, balances, types, employees, holidays });
  } catch (error) {
    return hrmError(error, 'Unable to load leave.');
  }
}

/**
 * { action: 'request', staffId?, leaveTypeId, startDate, endDate, partialDay, reason, attachmentUrl }
 * { action: 'decide', id, decision: APPROVED|REJECTED|CANCELLED, note }
 * { action: 'type', id?, ...type } · { action: 'allocate', year } · { action: 'adjust', staffId, leaveTypeId, year, days, reason }
 */
export async function POST(request) {
  try {
    const { db, user, isEmployee } = await hrmContext(request);
    const data = await request.json();
    if (data.action === 'request') {
      const staffId = Number(data.staffId || user.id);
      const self = staffId === Number(user.id);
      if (self) {
        if (!isEmployee) return NextResponse.json({ error: 'Choose the employee this leave is for.' }, { status: 400 });
        await assertCan(db, user, PERMISSIONS.LEAVE_REQUEST);
      } else {
        await assertCan(db, user, PERMISSIONS.LEAVE_APPROVE);
      }
      return NextResponse.json({ request: await requestLeave(db, user, { ...data, staffId }, { onBehalf: !self }) }, { status: 201 });
    }
    if (data.action === 'decide') {
      const decision = String(data.decision || '').toUpperCase();
      const own = await db.get('SELECT staff_id, status FROM hr_leave_requests WHERE id = ?', [Number(data.id)]);
      const cancellingOwnPending = decision === 'CANCELLED' && own && Number(own.staff_id) === Number(user.id) && own.status === 'PENDING';
      if (!cancellingOwnPending) {
        await assertCan(db, user, PERMISSIONS.LEAVE_APPROVE);
        if (own && Number(own.staff_id) === Number(user.id) && user.role !== 'admin') return NextResponse.json({ error: 'You cannot approve your own leave.' }, { status: 403 });
      }
      return NextResponse.json({ request: await decideLeave(db, user, data.id, decision, data.note) });
    }
    await assertCan(db, user, PERMISSIONS.LEAVE_APPROVE);
    if (data.action === 'type') return NextResponse.json({ type: await saveLeaveType(db, user, data.id, data) });
    if (data.action === 'allocate') return NextResponse.json(await allocateLeaveYear(db, user, data.year));
    if (data.action === 'adjust') return NextResponse.json(await adjustLeaveBalance(db, user, data));
    return NextResponse.json({ error: 'Unknown leave action' }, { status: 400 });
  } catch (error) {
    return hrmError(error, 'Unable to save leave.');
  }
}

