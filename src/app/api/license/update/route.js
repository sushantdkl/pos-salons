import { NextResponse } from 'next/server';
import { isLicenseEnabled } from '@/lib/license';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));

  if (!isLicenseEnabled()) {
    return NextResponse.json({
      success: true,
      license_enabled: false,
      message: 'License updates are disabled because enforcement is off.',
    });
  }

  if (!body.license_key || !String(body.license_key).trim()) {
    return NextResponse.json(
      { success: false, error: 'License key is required.' },
      { status: 400 }
    );
  }

  return NextResponse.json(
    {
      success: false,
      error: 'License update is reserved for the final production release.',
    },
    { status: 501 }
  );
}
