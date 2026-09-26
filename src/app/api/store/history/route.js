import { PERMISSIONS, requireRoleWithPermission } from '@/lib/auth/permissions';
import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { mapApiError } from '@/lib/db/api-errors';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import { getBusinessDayHistory } from '@/lib/business-day/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    await requireRoleWithPermission(request, db, ['admin', 'cashier'], PERMISSIONS.REPORTS_BUSINESS_DAYS);
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || 60), 1), 200);
    const days = await getBusinessDayHistory(db, { limit });
    return NextResponse.json({ days });
  } catch (error) {
    console.error('Business day history failed:', error);
    const mapped = mapApiError(error, 'Unable to load business day history.');
    return NextResponse.json({ success: false, code: mapped.code, error: mapped.message }, { status: mapped.status });
  }
}
