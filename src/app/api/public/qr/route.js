import QRCode from 'qrcode';
import { NextResponse } from 'next/server';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The ONE permanent salon QR: always encodes <site>/review — no customer data, no ids.
 * ?format=svg (default) | png   ?size=pixels for png
 */
function siteOrigin(request) {
  const configured = process.env.PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, '');
  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host;
  const proto = request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '');
  return `${proto}://${host}`;
}

export async function GET(request) {
  const limited = rateLimit(`qr:${clientIp(request)}`, { limit: 240, windowMs: 60_000 });
  if (!limited.allowed) return new NextResponse('Too many requests', { status: 429 });
  const params = new URL(request.url).searchParams;
  const target = `${siteOrigin(request)}/review`;
  const options = { errorCorrectionLevel: 'M', margin: 1, color: { dark: '#000000', light: '#ffffff' } };
  if (params.get('format') === 'png') {
    const size = Math.min(Math.max(Number(params.get('size') || 600), 120), 2000);
    const png = await QRCode.toBuffer(target, { ...options, width: size });
    return new NextResponse(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600', 'Content-Disposition': 'inline; filename="review-rewards-qr.png"' } });
  }
  const svg = await QRCode.toString(target, { ...options, type: 'svg' });
  return new NextResponse(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600', 'X-QR-Target': target } });
}
