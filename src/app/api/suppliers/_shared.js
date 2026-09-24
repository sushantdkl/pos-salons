import { NextResponse } from 'next/server';
import { mapApiError } from '@/lib/db/api-errors';

/** One error shape for supplier / purchase endpoints (all admin-only). */
export function supplierError(error, fallback = 'Unable to complete the supplier request.') {
  if (error?.status && error.status < 500) {
    return NextResponse.json({ success: false, code: error.code, error: error.message, available: error.available }, { status: error.status });
  }
  if (error?.code === 'DRAWER_CASH_SHORT') {
    return NextResponse.json({ success: false, code: error.code, error: error.message, available: error.available }, { status: 400 });
  }
  console.error('Supplier API failed:', error);
  const mapped = mapApiError(error, fallback);
  return NextResponse.json({ success: false, code: mapped.code, error: mapped.message }, { status: mapped.status });
}
