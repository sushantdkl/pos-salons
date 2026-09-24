import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { ensureSalonSchema, requireAuth } from '@/lib/salon-schema';
import { publicErrorMessage } from '@/lib/api/errors';
import { getDashboardPeriodMeta } from '@/lib/reports/dashboard-period';
import { nepalDateOf } from '@/lib/hrm/calc';
import { EMPLOYEE_ROLES } from '@/lib/hrm/service';

/** Authenticated context for every HRM route. */
export async function hrmContext(request) {
  const db = Database.getInstance();
  await ensureSalonSchema();
  const user = await requireAuth(request, db);
  return { db, user, isEmployee: EMPLOYEE_ROLES.includes(user.role) };
}

/** ?period=… (same vocabulary as every report) or ?from&to; defaults to today (Nepal). */
export function rangeFrom(searchParams) {
  const period = searchParams.get('period');
  if (period) {
    const meta = getDashboardPeriodMeta(period, searchParams.get('startDate'), searchParams.get('endDate'));
    if (meta.startDate && meta.endDate) return { from: meta.startDate, to: meta.endDate, label: meta.displayRange, period: meta.value };
  }
  const today = nepalDateOf();
  return { from: searchParams.get('from') || today, to: searchParams.get('to') || searchParams.get('from') || today, period: null };
}

export function hrmError(error, fallback = 'Unable to complete the HR request.') {
  const status = error?.status || 500;
  if (status < 500) return NextResponse.json({ error: error.message, code: error.code }, { status });
  if (error?.code === '23505') return NextResponse.json({ error: 'That record already exists for this employee and date.', code: 'DUPLICATE' }, { status: 409 });
  console.error('HRM API failed:', error);
  return NextResponse.json({ error: publicErrorMessage(error, fallback) }, { status: 500 });
}
