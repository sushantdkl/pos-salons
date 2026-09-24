import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import { publicErrorMessage } from '@/lib/api/errors';
import { addRedirect, assertSeoSchema, saveArticle, savePageSeo, saveSeoSettings, saveServicePage } from '@/modules/public-site/services/seo';
import { loadSeoAdmin } from '@/modules/public-site/services/seo-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

function fail(error, fallback) {
  const status = error?.status || 500;
  if (status >= 500) console.error('SEO admin failed:', error);
  const message = status < 500 || error?.code === 'SEO_SCHEMA_MISSING' ? error.message : publicErrorMessage(error, fallback);
  return NextResponse.json({ success: false, error: message, code: error?.code }, { status, headers: NO_STORE });
}

async function audit(db, actorId, action, details) {
  await db.run('INSERT INTO action_logs (user_id, action, entity_type, details) VALUES (?, ?, ?, ?)', [actorId, action, 'website_seo', details]).catch(() => {});
}

/** SEO & Local Search panel data: settings, pages, service pages, guides, redirects, sitemap, checks. Owner only. */
export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    await requireRole(request, db, 'admin');
    return NextResponse.json(await loadSeoAdmin(), { headers: NO_STORE });
  } catch (error) {
    return fail(error, 'Could not load SEO settings.');
  }
}

/**
 * { action: 'settings', data } | { action: 'page', data } | { action: 'servicePage', data }
 * { action: 'article', data } | { action: 'redirect', data: { from, to, note } }
 * { action: 'toggleRedirect', data: { id, isActive } } | { action: 'deleteRedirect', data: { id } }
 * { action: 'deleteArticle', data: { id } }
 */
export async function PUT(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, 'admin');
    await assertSeoSchema(db);
    const { action, data = {} } = await request.json().catch(() => ({}));

    if (action === 'settings') {
      await saveSeoSettings(db, user, data);
      await audit(db, user.id, 'update', 'SEO & Local Search settings updated');
    } else if (action === 'page') {
      await savePageSeo(db, user, data);
      await audit(db, user.id, 'update', `SEO for ${data.path} updated`);
    } else if (action === 'servicePage') {
      await saveServicePage(db, user, data);
      await audit(db, user.id, 'update', `Service page ${data.slug} saved`);
    } else if (action === 'article') {
      await saveArticle(db, user, data);
      await audit(db, user.id, 'update', `Guide ${data.slug || data.title} saved`);
    } else if (action === 'deleteArticle') {
      const row = await db.get('SELECT slug, status FROM website_articles WHERE id = ?', [Number(data.id)]);
      if (!row) return NextResponse.json({ success: false, error: 'Guide not found.' }, { status: 404 });
      if (row.status === 'PUBLISHED') return NextResponse.json({ success: false, error: 'Archive a published guide instead of deleting it, so its link does not break.' }, { status: 400 });
      await db.run('DELETE FROM website_articles WHERE id = ?', [Number(data.id)]);
      await audit(db, user.id, 'delete', `Guide ${row.slug} deleted`);
    } else if (action === 'redirect') {
      await db.transaction((tx) => addRedirect(tx, { from: data.from, to: data.to, note: data.note, actorId: user.id }));
      await audit(db, user.id, 'create', `Redirect ${data.from} → ${data.to}`);
    } else if (action === 'toggleRedirect') {
      await db.run('UPDATE website_redirects SET is_active = ? WHERE id = ?', [Boolean(data.isActive), Number(data.id)]);
      await audit(db, user.id, 'update', `Redirect ${data.id} ${data.isActive ? 'enabled' : 'disabled'}`);
    } else if (action === 'deleteRedirect') {
      await db.run('DELETE FROM website_redirects WHERE id = ?', [Number(data.id)]);
      await audit(db, user.id, 'delete', `Redirect ${data.id} deleted`);
    } else {
      return NextResponse.json({ success: false, error: 'Unknown action.' }, { status: 400 });
    }
    return NextResponse.json({ success: true, ...(await loadSeoAdmin()) }, { headers: NO_STORE });
  } catch (error) {
    return fail(error, 'Could not save. Please check the fields and try again.');
  }
}
