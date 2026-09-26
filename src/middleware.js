import { NextResponse } from 'next/server';

/**
 * Canonical host for the public website: https://thehaircut.com.np (no www).
 *
 * - www.thehaircut.com.np → 308 to the same path on thehaircut.com.np
 * - http:// → https:// ONLY when the proxy says so via X-Forwarded-Proto (never guesses, so it
 *   can't loop behind LiteSpeed/Passenger). cPanel "Force HTTPS Redirect" should also be on.
 * - *.vercel.app (old staging / preview deployments of this repo): public website pages, robots.txt
 *   and sitemap.xml → 308 to the canonical domain; every other response there (POS, admin, API)
 *   keeps working but is marked noindex so staging can never compete with the real site.
 *
 * Only GET/HEAD page requests are moved. API calls are left alone so an open POS tab on another
 * host keeps working until it reloads. Localhost, LAN, demo and QA hosts are never touched.
 *
 * Note: Next.js 15 runs `middleware.js`; `src/proxy.js` is the Next 16 name and is not loaded
 * by this version (the licence check inside it is therefore inactive — unchanged by this file).
 */
const CANONICAL_HOST = (process.env.SITE_CANONICAL_HOST || 'thehaircut.com.np').toLowerCase();

// Public marketing pages worth moving from a staging host. Everything else stays (noindexed).
const PUBLIC_PATHS = [/^\/$/, /^\/(services|packages|staff|gallery|contact|book-appointment|book|reviews|guides)(\/.*)?$/, /^\/(robots\.txt|sitemap\.xml)$/];

function redirectTo(pathname, search) {
  return NextResponse.redirect(`https://${CANONICAL_HOST}${pathname}${search}`, 308);
}

export function middleware(request) {
  const { pathname, search } = request.nextUrl;
  const host = String(request.headers.get('x-forwarded-host') || request.headers.get('host') || '').toLowerCase().split(',')[0].trim().split(':')[0];
  const isReadOnly = request.method === 'GET' || request.method === 'HEAD';

  if (host.endsWith('.vercel.app')) {
    if (isReadOnly && PUBLIC_PATHS.some((pattern) => pattern.test(pathname))) return redirectTo(pathname, search);
    const response = NextResponse.next();
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return response;
  }

  if (!isReadOnly || pathname.startsWith('/api/')) return NextResponse.next();
  const proto = String(request.headers.get('x-forwarded-proto') || '').toLowerCase().split(',')[0].trim();
  const isWww = host === `www.${CANONICAL_HOST}`;
  const isPlainHttp = host === CANONICAL_HOST && proto === 'http';
  if (!isWww && !isPlainHttp) return NextResponse.next();
  return redirectTo(pathname, search);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
