import { NextResponse } from 'next/server';
import { isLicenseEnabled } from '@/lib/license';

export async function POST() {
  if (!isLicenseEnabled()) {
    return NextResponse.json({
      success: true,
      license_enabled: false,
      message: 'License checks are disabled for testing.',
    });
  }

  return NextResponse.json(
    {
      success: false,
      error: 'License refresh is reserved for the final production release.',
    },
    { status: 501 }
  );
}
