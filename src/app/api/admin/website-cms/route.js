import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import { getPublicWebsiteData, saveWebsiteCms } from '@/modules/public-site/services/cms';
import { publicErrorMessage } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    await requireRole(request, db, 'admin');
    return NextResponse.json(await getPublicWebsiteData({ includeHidden: true }));
  } catch (error) {
    const message = publicErrorMessage(error, 'Could not load website CMS. Please try again.');
    return NextResponse.json({ success: false, error: message, message }, { status: error.status || 500 });
  }
}

export async function PUT(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, 'admin');
    const data = await request.json();
    const cms = await saveWebsiteCms(db, data, user.id);
    return NextResponse.json({ success: true, message: 'Website CMS saved successfully', cms });
  } catch (error) {
    console.error('PUT /api/admin/website-cms:', error);
    const message = publicErrorMessage(error, 'Could not save website CMS. Please check the fields and try again.');
    return NextResponse.json({
      success: false,
      error: message,
      message,
      code: error.code || 'SAVE_ERROR',
      details: error.details || null,
    }, { status: error.status || 400 });
  }
}
