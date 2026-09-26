import { NextResponse } from 'next/server';
import { mapApiError } from '@/lib/db/api-errors';

export const MANAGER_ROLES = ['admin', 'cashier'];
export const SCHEDULE_VIEW_ROLES = ['admin', 'cashier', 'barber', 'stylist', 'beautician'];

/**
 * One error shape for every appointment endpoint. Scheduling conflicts carry their issues and
 * whether the caller may override, so the UI can explain exactly what clashed.
 */
export function appointmentError(error, fallback = 'Unable to complete the appointment request.') {
  if (error?.code === 'SCHEDULE_CONFLICT') {
    return NextResponse.json(
      { success: false, code: error.code, error: error.message, issues: error.issues || [], overridable: Boolean(error.overridable) },
      { status: 409 }
    );
  }
  if (error?.status && error.status < 500) {
    return NextResponse.json({ success: false, code: error.code, error: error.message }, { status: error.status });
  }
  console.error('Appointment API failed:', error);
  const mapped = mapApiError(error, fallback);
  return NextResponse.json({ success: false, code: mapped.code, error: mapped.message }, { status: mapped.status });
}
