import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const ADMIN_SERVER_URL = process.env.NEXT_PUBLIC_ADMIN_SERVER_URL || 'http://localhost:3001';

// Helper function to check license directly from file
function checkLicenseFromFile() {
  try {
    const licensePath = path.join(process.cwd(), 'databases', '.license');
    
    // Check if license file exists
    if (!fs.existsSync(licensePath)) {
      return { activated: false };
    }

    // Read license file
    const licenseData = JSON.parse(fs.readFileSync(licensePath, 'utf8'));
    
    // Calculate expiry status
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
        in_grace_period: isExpired && !isCompletelyExpired
      }
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
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.valid ? data : null;
  } catch (error) {
    console.error('Online license verification failed:', error);
    return null;
  }
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Allow access to activation, login, license-expired page, static files, and specific API routes
  if (
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
    // Check license status directly from file (no API call needed)
    const licenseData = checkLicenseFromFile();

    // If not activated, redirect to activation
    if (!licenseData.activated) {
      console.log('🔒 No license found - redirecting to activation');
      return NextResponse.redirect(new URL('/activate', request.url));
    }

    // Check if completely expired (grace period ended)
    if (licenseData.status?.is_completely_expired) {
      const onlineLicense = await verifyLicenseWithAdmin(licenseData.license?.license_key);

      if (onlineLicense) {
        return NextResponse.next();
      }

      // Grace period ended - block ALL access to pages and APIs (except license-related)
      console.log('🚫 License completely expired - blocking access to:', pathname);
      
      // Block all API routes except license-related ones
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { 
            error: 'License expired',
            message: 'Your POS license has expired. Please contact your administrator to renew.',
            expired: true
          },
          { status: 403 }
        );
      }
      
      // Redirect all page requests to license-expired page
      return NextResponse.redirect(new URL('/license-expired', request.url));
    }

    return NextResponse.next();
  } catch (error) {
    // On error, allow access (fail open)
    console.error('Middleware license check error:', error);
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths including API routes
     * Exclude only static assets and system files
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
  runtime: 'nodejs', // Use Node.js runtime instead of Edge Runtime to access fs/path
};
