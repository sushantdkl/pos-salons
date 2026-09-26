import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { hasPermission, PERMISSIONS, requirePermission } from '@/lib/auth/permissions';
import { redactReport, SENSITIVE_REPORT_FIELDS } from '@/lib/reports/redact';
import { isCanonicalAdDate, nepalDateString } from '@/lib/dates/calendar';
import { buildWorkspaceReport, WORKSPACE_REPORTS, workspaceFilterOptions } from '@/lib/reports/workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/reports/workspace?report=sales&start=YYYY-MM-DD&end=YYYY-MM-DD
 *   &basis=calendar|business &staff=<id> &method=<m> &category=<c> &metricsOnly=1
 */
export async function GET(request) {
  try {
    const db = Database.getInstance();
    const user = await requirePermission(request, db, PERMISSIONS.REPORTS_VIEW);
    const params = new URL(request.url).searchParams;
    const report = params.get('report');
    if (!WORKSPACE_REPORTS.includes(report)) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    if (report === 'advances' && user.role !== 'admin' && !(await hasPermission(db, user, PERMISSIONS.REPORTS_ADVANCES))) {
      return NextResponse.json({ error: 'The Advances Report needs the “Advances report” permission' }, { status: 403 });
    }
    const showSensitive = user.role === 'admin' || await hasPermission(db, user, PERMISSIONS.REPORTS_SENSITIVE);
    const guard = (payload) => (showSensitive ? payload : { ...redactReport(payload), hiddenFields: SENSITIVE_REPORT_FIELDS });
    const start = params.get('start') || nepalDateString();
    const end = params.get('end') || start;
    if (!isCanonicalAdDate(start) || !isCanonicalAdDate(end) || start > end) return NextResponse.json({ error: 'Invalid report date range' }, { status: 400 });
    const staff = params.get('staff');
    const filters = {
      start, end,
      basis: params.get('basis') === 'business' ? 'business' : 'calendar',
      staff: staff && /^\d+$/.test(staff) ? Number(staff) : null,
      method: String(params.get('method') || '').slice(0, 40),
      category: String(params.get('category') || '').slice(0, 80),
    };
    const result = await buildWorkspaceReport(db, report, filters);
    if (params.get('metricsOnly') === '1') return NextResponse.json(guard({ report, filters, metrics: result.metrics }));

    const [options, openDay] = await Promise.all([
      workspaceFilterOptions(db, report),
      db.get("SELECT to_char(business_date, 'YYYY-MM-DD') AS date FROM business_days WHERE status = 'OPEN' ORDER BY business_date DESC LIMIT 1"),
    ]);
    return NextResponse.json(guard({ report, filters, options, businessDay: openDay?.date || null, today: nepalDateString(), ...result }));
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Unable to build the report' }, { status: error.status || 500 });
  }
}
