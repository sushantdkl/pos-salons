import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import { getAvailability } from '@/lib/appointments/service';
import { appointmentError, MANAGER_ROLES } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Free start times per staff member for a date and set of services (front desk view). */
export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    await requireRole(request, db, MANAGER_ROLES);
    const params = new URL(request.url).searchParams;
    const availability = await getAvailability(db, {
      date: params.get('date'),
      serviceIds: String(params.get('services') || '').split(',').filter(Boolean),
      staffId: Number(params.get('staffId') || 0) || null,
    });
    return NextResponse.json({ availability });
  } catch (error) {
    return appointmentError(error, 'Unable to load availability.');
  }
}
