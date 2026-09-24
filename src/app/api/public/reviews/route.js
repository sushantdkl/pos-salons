import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { ensureSalonSchema } from '@/lib/salon-schema';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { publishedReviews } from '@/lib/reviews/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Published, consented reviews for the website: first name, rating, text, date, service. */
export async function GET(request) {
  const limited = rateLimit(`reviews-public:${clientIp(request)}`, { limit: 120, windowMs: 60_000 });
  if (!limited.allowed) return NextResponse.json({ reviews: [] }, { status: 429 });
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const limit = Number(new URL(request.url).searchParams.get('limit') || 12);
    return NextResponse.json({ reviews: await publishedReviews(db, { limit }) });
  } catch (error) {
    console.error('Public reviews failed:', error);
    return NextResponse.json({ reviews: [] });
  }
}
