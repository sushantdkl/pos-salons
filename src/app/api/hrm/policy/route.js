import { NextResponse } from 'next/server';
import { hrmContext, hrmError } from '../_shared';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { assertCan, getPolicy, updatePolicy } from '@/lib/hrm/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** HR rules: overtime threshold, break handling, and which attendance effects payroll may use. */
export async function GET(request) {
  try {
    const { db, user } = await hrmContext(request);
    await assertCan(db, user, PERMISSIONS.ATTENDANCE_VIEW);
    return NextResponse.json({ policy: await getPolicy(db) });
  } catch (error) {
    return hrmError(error, 'Unable to load HR rules.');
  }
}

/** Owner only: these rules change payroll suggestions. */
export async function PUT(request) {
  try {
    const { db, user } = await hrmContext(request);
    if (user.role !== 'admin') return NextResponse.json({ error: 'Only the admin can change HR rules.' }, { status: 403 });
    return NextResponse.json({ policy: await updatePolicy(db, user, await request.json()) });
  } catch (error) {
    return hrmError(error, 'Unable to save HR rules.');
  }
}
