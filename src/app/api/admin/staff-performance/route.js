import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import { getAdminStaffAnalytics, getStaffPerformance } from '@/modules/staff/services/performance';

export async function GET(request) {
  try {
    const db = Database.getInstance().db;
    ensureSalonSchema(db);
    const user = requireRole(request, db, ['admin', 'barber', 'stylist', 'beautician']);
    const { searchParams } = new URL(request.url);
    const staffId = Number(searchParams.get('staffId') || user.id);

    if (user.role === 'admin' && searchParams.get('scope') === 'admin') {
      return NextResponse.json(getAdminStaffAnalytics(db));
    }

    if (user.role !== 'admin' && staffId !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    return NextResponse.json(getStaffPerformance(db, staffId));
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to fetch staff performance' }, { status: error.status || 500 });
  }
}
