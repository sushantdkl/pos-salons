import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const ADMIN_SERVER_URL = process.env.NEXT_PUBLIC_ADMIN_SERVER_URL || 'http://localhost:3001';
const LICENSE_ENABLED = String(process.env.NEXT_PUBLIC_LICENSE_ENABLED || '').trim().toLowerCase() === 'true';

function checkLicenseFromFile() {
  try {
    const licensePath = path.join(process.cwd(), 'databases', '.license');

    if (!fs.existsSync(licensePath)) {
      return { activated: false };
    }

    const licenseData = JSON.parse(fs.readFileSync(licensePath, 'utf8'));
    const now = new Date();
    const expiryDate = new Date(licenseData.expiry_date);
    const gracePeriodDays = licenseData.grace_period_days || 5;
    const graceEndDate = new Date(expiryDate);
    graceEndDate.setDate(graceEndDate.getDate() + gracePeriodDays);

    const isExpired = now > expiryDate;
    const isCompletelyExpired = now > graceEndDate;
    const daysRemaining = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

    return {
      activated: true,
      license: licenseData,
      status: {
        is_expired: isExpired,
        is_completely_expired: isCompletelyExpired,
        days_remaining: daysRemaining,
        in_grace_period: isExpired && !isCompletelyExpired,
      },
    };
  } catch (error) {
    console.error('License check error:', error);
    return { activated: false, error: error.message };
  }
}

async function verifyLicenseWithAdmin(licenseKey) {
  try {
    const response = await fetch(`${ADMIN_SERVER_URL}/api/verify-license`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key: licenseKey }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.valid ? data : null;
  } catch (error) {
    console.error('Online license verification failed:', error);
    return null;
  }
}

export async function proxy(request) {
  const { pathname } = request.nextUrl;

  if (!LICENSE_ENABLED) {
    return NextResponse.next();
  }

  if (
    pathname === '/' ||
    pathname.startsWith('/services') ||
    pathname.startsWith('/packages') ||
    pathname.startsWith('/staff') ||
    pathname.startsWith('/gallery') ||
    pathname.startsWith('/contact') ||
    pathname.startsWith('/book-appointment') ||
    pathname.startsWith('/legal') ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname.startsWith('/activate') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/license-expired') ||
    pathname.startsWith('/api/license/') ||
    pathname.startsWith('/api/auth/login') ||
    pathname.startsWith('/api/users/active') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  try {
    const licenseData = checkLicenseFromFile();

    if (!licenseData.activated) {
      return NextResponse.redirect(new URL('/activate', request.url));
    }

    if (licenseData.status?.is_completely_expired) {
      const onlineLicense = await verifyLicenseWithAdmin(licenseData.license?.license_key);

      if (onlineLicense) {
        return NextResponse.next();
      }

      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          {
            error: 'License expired',
            message: 'Your Salon POS license has expired. Please contact your administrator to renew.',
            expired: true,
          },
          { status: 403 }
        );
      }

      return NextResponse.redirect(new URL('/license-expired', request.url));
    }

    return NextResponse.next();
  } catch (error) {
    console.error('Proxy license check error:', error);
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
