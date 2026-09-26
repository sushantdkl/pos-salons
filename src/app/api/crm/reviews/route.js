import { NextResponse } from 'next/server';
import { crmContext, crmError, requireCrm } from '../_shared';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getCrmSettings, updateCrmSettings } from '@/lib/loyalty/service';
import { listForms, listReviews, moderateReview, reopenReview, reviewOverview, saveForm } from '@/lib/reviews/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** ?view=overview (default) | responses | forms | settings */
export async function GET(request) {
  try {
    const { db, user } = await crmContext(request);
    await requireCrm(db, user, PERMISSIONS.REVIEWS_VIEW, PERMISSIONS.REVIEWS_MODERATE, PERMISSIONS.REVIEWS_MANAGE);
    const params = new URL(request.url).searchParams;
    const view = params.get('view') || 'overview';
    if (view === 'responses') {
      const verified = params.get('verified');
      return NextResponse.json({ reviews: await listReviews(db, { status: params.get('status') || null, maxRating: Number(params.get('maxRating') || 0) || null, verified: verified === null ? null : verified === '1' }) });
    }
    if (view === 'forms') return NextResponse.json({ forms: await listForms(db) });
    if (view === 'settings') return NextResponse.json({ settings: await getCrmSettings(db) });
    return NextResponse.json(await reviewOverview(db, { from: params.get('from'), to: params.get('to') }));
  } catch (error) {
    return crmError(error, 'Unable to load reviews.');
  }
}

/**
 * { action: 'moderate', id, status, note } · { action: 'reopen', id, reason }
 * { action: 'form', id?, ...form } · { action: 'settings', ...settings }
 */
export async function POST(request) {
  try {
    const { db, user } = await crmContext(request);
    const data = await request.json();
    if (data.action === 'moderate') {
      await requireCrm(db, user, PERMISSIONS.REVIEWS_MODERATE);
      return NextResponse.json({ review: await moderateReview(db, user, data.id, { status: String(data.status || '').toUpperCase(), note: data.note }) });
    }
    if (data.action === 'reopen') {
      await requireCrm(db, user, PERMISSIONS.REVIEWS_MODERATE);
      return NextResponse.json(await reopenReview(db, user, data.id, data.reason));
    }
    if (data.action === 'form') {
      await requireCrm(db, user, PERMISSIONS.REVIEWS_MANAGE);
      return NextResponse.json({ form: await saveForm(db, user, data.id, data) }, { status: data.id ? 200 : 201 });
    }
    if (data.action === 'settings') {
      await requireCrm(db, user, PERMISSIONS.REVIEWS_MANAGE);
      return NextResponse.json({ settings: await updateCrmSettings(db, user, data) });
    }
    return NextResponse.json({ error: 'Unknown review action' }, { status: 400 });
  } catch (error) {
    return crmError(error, 'Unable to save.');
  }
}
