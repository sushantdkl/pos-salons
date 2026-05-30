import { NextResponse } from 'next/server';
import { isLicenseEnabled } from '@/lib/license';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));

  if (!isLicenseEnabled()) {
    return NextResponse.json({
      valid: true,
      success: true,
      license_enabled: false,
      message: 'License enforcement is disabled for testing.',
      salon: {
        salon_name: 'Salon POS',
        plan_type: 'Testing',
      },
    });
  }

  if (!body.license_key || !String(body.license_key).trim()) {
    return NextResponse.json(
      { valid: false, success: false, error: 'License key is required.' },
      { status: 400 }
    );
  }

  return NextResponse.json(
    {
      valid: false,
      success: false,
      error: 'License activation is reserved for the final production release.',
    },
    { status: 501 }
  );
}
