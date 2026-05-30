import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

const ADMIN_SERVER_URL = process.env.NEXT_PUBLIC_ADMIN_SERVER_URL || 'http://localhost:3001';
const LICENSE_ENABLED = process.env.NEXT_PUBLIC_LICENSE_ENABLED === 'true';

export async function GET() {
  try {
    if (!LICENSE_ENABLED) {
      return NextResponse.json({
        activated: true,
        license: {
          license_key: 'LOCAL-DEVELOPMENT',
          salon_name: 'Salon POS',
          plan_type: 'development',
          expiry_date: null,
          grace_period_days: 0,
          last_verified: new Date().toISOString(),
          activated_at: new Date().toISOString()
        },
        status: {
          status: 'disabled',
          isValid: true,
          is_expired: false,
          in_grace_period: false,
          is_completely_expired: false,
          days_remaining: null,
          license_enabled: false
        }
      });
    }

    // Check if system is activated (license file exists)
    const licensePath = path.join(process.cwd(), 'databases', '.license');
    
    if (!fs.existsSync(licensePath)) {
      return NextResponse.json({ activated: false });
    }

    const licenseFileData = JSON.parse(fs.readFileSync(licensePath, 'utf8'));

    // Try to sync latest data from Firebase admin (including grace period updates)
    try {
      const verifyResponse = await fetch(`${ADMIN_SERVER_URL}/api/verify-license`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: licenseFileData.license_key }),
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      if (verifyResponse.ok) {
        const verificationData = await verifyResponse.json();
        if (verificationData.valid) {
          // On Vercel/serverless we cannot persist to the filesystem.
          // Return the live admin data instead of trying to write .license.
          licenseFileData.grace_period_days = verificationData.grace_period_days || 5;
          licenseFileData.expiry_date = verificationData.expiry_date;
          licenseFileData.last_verified = new Date().toISOString();
        }
      }
    } catch (syncError) {
      // Silent fail - use cached data if Firebase sync fails
      console.log('Firebase sync skipped:', syncError.message);
    }

    // Use file data directly (simpler and more reliable)
    const license = licenseFileData;
    const status = calculateLicenseStatusFromFile(licenseFileData);

    return NextResponse.json({
      activated: true,
      license: {
        license_key: license.license_key,
        salon_name: license.salon_name || license.business_name || 'Salon POS',
        plan_type: license.plan_type,
        expiry_date: license.expiry_date,
        grace_period_days: license.grace_period_days || 5,
        last_verified: license.last_verified,
        activated_at: license.activated_at
      },
      status: status || { status: 'active', isValid: true, days_remaining: 0 }
    });
  } catch (error) {
    console.error('License check error:', error);
    return NextResponse.json({ 
      activated: false,
      error: error.message 
    }, { status: 500 });
  }
}

function calculateLicenseStatusFromFile(license) {
  const now = new Date();
  const expiryDate = new Date(license.expiry_date);
  const gracePeriodDays = license.grace_period_days || 5;
  const graceEndDate = new Date(expiryDate);
  graceEndDate.setDate(graceEndDate.getDate() + gracePeriodDays);
  
  const daysRemaining = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
  const graceDaysRemaining = Math.ceil((graceEndDate - now) / (1000 * 60 * 60 * 24));
  
  const is_expired = now > expiryDate;
  const in_grace_period = is_expired && now <= graceEndDate;
  const is_completely_expired = now > graceEndDate;
  
  return {
    is_expired,
    in_grace_period,
    is_completely_expired,
    days_remaining: Math.max(0, daysRemaining),
    grace_days_remaining: in_grace_period ? Math.max(0, graceDaysRemaining) : 0,
    expiry_date: expiryDate.toISOString(),
    grace_end_date: graceEndDate.toISOString(),
    status: is_completely_expired ? 'expired' : (is_expired ? 'grace_period' : 'active'),
    isValid: !is_completely_expired
  };
}
