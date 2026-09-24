import { NextResponse } from 'next/server';

/**
 * Canonical host for the public website: https://thehaircut.com.np (no www).
 *
 * - www.thehaircut.com.np → 308 to the same path on thehaircut.com.np
 * - http:// → https:// ONLY when the proxy says so via X-Forwarded-Proto (never guesses, so it
 *   can't loop behind LiteSpeed/Passenger). cPanel "Force HTTPS Redirect" should also be on.
 *
 * Only GET/HEAD page requests are moved. API calls are left alone so an open POS tab on the
 * www host keeps working until it reloads. Localhost, demo and QA hosts are never touched.
 *
 * Note: Next.js 15 runs `middleware.js`; `src/proxy.js` is the Next 16 name and is not loaded
 * by this version (the licence check inside it is therefore inactive — unchanged by this file).
 */
const CANONICAL_HOST = (process.env.SITE_CANONICAL_HOST || 'thehaircut.com.np').toLowerCase();

export function middleware(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith('/api/')) return NextResponse.next();

  const host = String(request.headers.get('x-forwarded-host') || request.headers.get('host') || '').toLowerCase().split(':')[0];
  const proto = String(request.headers.get('x-forwarded-proto') || '').toLowerCase().split(',')[0].trim();
  const isWww = host === `www.${CANONICAL_HOST}`;
  const isPlainHttp = host === CANONICAL_HOST && proto === 'http';
  if (!isWww && !isPlainHttp) return NextResponse.next();

  return NextResponse.redirect(`https://${CANONICAL_HOST}${pathname}${search}`, 308);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
