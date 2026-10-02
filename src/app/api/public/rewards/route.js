import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { ensureSalonSchema } from '@/lib/salon-schema';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { getCrmSettings, listPrograms } from '@/lib/loyalty/service';
import { claimVisit, joinRewards, lookupRewards } from '@/lib/loyalty/public';
import { publicForm, submitReview } from '@/lib/reviews/service';
import { normalizePhone } from '@/lib/validation/phone';
import { readSeoSettings } from '@/modules/public-site/services/seo';
import { publicErrorMessage } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

function tooMany(retryAfterSeconds) {
  return NextResponse.json({ error: 'Too many tries. Please wait a few minutes and try again.' }, { status: 429, headers: { ...NO_STORE, 'Retry-After': String(retryAfterSeconds) } });
}

function fail(error, fallback) {
  const status = error?.status || 500;
  if (status >= 500) console.error('Public rewards failed:', error);
  return NextResponse.json({ error: status < 500 ? error.message : publicErrorMessage(error, fallback), code: error?.code }, { status, headers: NO_STORE });
}

/** Page setup for the permanent QR page: what is switched on, the programs, and the feedback form. No customer data. */
export async function GET(request) {
  try {
    const limited = rateLimit(`rewards-read:${clientIp(request)}`, { limit: 120, windowMs: 60_000 });
    if (!limited.allowed) return tooMany(limited.retryAfterSeconds);
    const db = Database.getInstance();
    await ensureSalonSchema();
    const settings = await getCrmSettings(db);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());
    const seo = await readSeoSettings(db);
    const programs = settings.publicRewardsEnabled ? (await listPrograms(db, { activeOn: today })).map((p) => ({ name: p.name, requiredVisits: p.requiredVisits, rewardLabel: p.rewardLabel })) : [];
    // A switch alone must never advertise a loyalty scheme. Rewards exist only after the owner
    // creates an active program with a real earning rule and reward.
    const rewardsEnabled = settings.publicRewardsEnabled && programs.length > 0;
    return NextResponse.json({
      rewardsEnabled,
      reviewsEnabled: settings.publicReviewsEnabled,
      generalFeedbackEnabled: settings.generalFeedbackEnabled,
      claimCodesEnabled: settings.claimCodesEnabled && rewardsEnabled,
      joinEnabled: settings.publicJoinEnabled && rewardsEnabled,
      programs,
      form: settings.publicReviewsEnabled ? await publicForm(db) : null,
      // Independent of rating, rewards and anything the visitor does on the page — shown the same to everyone.
      googleReviewUrl: seo.googleReviewEnabled && seo.googleReviewUrl ? seo.googleReviewUrl : null,
    }, { headers: NO_STORE });
  } catch (error) {
    return fail(error, 'Unable to load this page.');
  }
}

/**
 * { action: 'lookup', phone } — safe reward card for a phone number
 * { action: 'join', phone, name } — join rewards with an empty card (no visit is earned)
 * { action: 'claim', phone, code, name } — attach a walk-in visit with the receipt code (once)
 * { action: 'review', rating, text, answers, publicConsent, visitRef?, formId?, serviceId?, name? }
 */
export async function POST(request) {
  try {
    const ip = clientIp(request);
    const data = await request.json().catch(() => ({}));
    const db = Database.getInstance();
    await ensureSalonSchema();

    if (data.action === 'lookup') {
      const byIp = rateLimit(`rewards-lookup:${ip}`, { limit: 20, windowMs: 10 * 60_000 });
      if (!byIp.allowed) return tooMany(byIp.retryAfterSeconds);
      const phone = normalizePhone(data.phone);
      if (phone) {
        const byPhone = rateLimit(`rewards-lookup-phone:${phone}`, { limit: 10, windowMs: 10 * 60_000 });
        if (!byPhone.allowed) return tooMany(byPhone.retryAfterSeconds);
      }
      return NextResponse.json(await lookupRewards(db, data.phone), { headers: NO_STORE });
    }
    if (data.action === 'join') {
      const limited = rateLimit(`rewards-join:${ip}`, { limit: 5, windowMs: 30 * 60_000 });
      if (!limited.allowed) return tooMany(limited.retryAfterSeconds);
      return NextResponse.json(await joinRewards(db, data), { status: 201, headers: NO_STORE });
    }
    if (data.action === 'claim') {
      const limited = rateLimit(`rewards-claim:${ip}`, { limit: 8, windowMs: 15 * 60_000 });
      if (!limited.allowed) return tooMany(limited.retryAfterSeconds);
      return NextResponse.json(await claimVisit(db, data), { headers: NO_STORE });
    }
    if (data.action === 'review') {
      const limited = rateLimit(`rewards-review:${ip}`, { limit: 6, windowMs: 10 * 60_000 });
      if (!limited.allowed) return tooMany(limited.retryAfterSeconds);
      const clientHash = createHash('sha256').update(`${ip}|${request.headers.get('user-agent') || ''}`).digest('hex').slice(0, 32);
      const result = await submitReview(db, data, { clientHash });
      return NextResponse.json(result, { status: 201, headers: NO_STORE });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400, headers: NO_STORE });
  } catch (error) {
    return fail(error, 'Something went wrong. Please try again.');
  }
}
