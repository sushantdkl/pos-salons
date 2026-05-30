import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const ADMIN_SERVER_URL = process.env.NEXT_PUBLIC_ADMIN_SERVER_URL || 'http://localhost:3001';

export async function POST() {
  try {
    // Read current license
    const licensePath = path.join(process.cwd(), 'databases', '.license');
    
    if (!fs.existsSync(licensePath)) {
      return NextResponse.json(
        { success: false, error: 'No license found' },
        { status: 404 }
      );
    }

    const licenseData = JSON.parse(fs.readFileSync(licensePath, 'utf8'));
    const licenseKey = licenseData.license_key;

    // Check with admin server
    const verifyResponse = await fetch(`${ADMIN_SERVER_URL}/api/verify-license`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key: licenseKey }),
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (!verifyResponse.ok) {
      return NextResponse.json(
        { success: false, error: 'Failed to verify license with admin server' },
        { status: 400 }
      );
    }

    const verificationData = await verifyResponse.json();

    if (!verificationData.valid) {
      return NextResponse.json(
        { success: false, error: 'License is still expired. Please contact your administrator to renew.' },
        { status: 400 }
      );
    }

    // Vercel/serverless cannot persist the .license file.
    // Return the updated license data so the UI can proceed after a successful admin-side renewal.
    const updatedLicenseData = {
      ...licenseData,
      expiry_date: verificationData.expiry_date,
      grace_period_days: verificationData.grace_period_days || 5,
      plan_type: verificationData.plan_type || licenseData.plan_type,
      restaurant_name: verificationData.restaurant_name || licenseData.restaurant_name,
      last_verified: new Date().toISOString()
    };

    // Check if license is now valid
    const now = new Date();
    const expiryDate = new Date(verificationData.expiry_date);
    const gracePeriodDays = verificationData.grace_period_days || 5;
    const graceEndDate = new Date(expiryDate);
    graceEndDate.setDate(graceEndDate.getDate() + gracePeriodDays);

    const isCompletelyExpired = now > graceEndDate;

    if (isCompletelyExpired) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'License is still expired. The expiry date has not been extended yet.' 
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'License renewed successfully!',
      license: {
        restaurant_name: verificationData.restaurant_name,
        plan_type: verificationData.plan_type,
        expiry_date: verificationData.expiry_date,
        grace_period_days: verificationData.grace_period_days
      }
    });

  } catch (error) {
    console.error('License refresh error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to refresh license. Please check your connection to the admin server.' 
      },
      { status: 500 }
    );
  }
}
