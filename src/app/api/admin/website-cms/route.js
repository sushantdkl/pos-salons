import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import { getPublicWebsiteData, saveWebsiteCms } from '@/modules/public-site/services/cms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    await requireRole(request, db, 'admin');
    return NextResponse.json(await getPublicWebsiteData({ includeHidden: true }));
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to load website CMS' }, { status: error.status || 500 });
  }
}

export async function PUT(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, 'admin');
    const data = await request.json();
    const cms = await saveWebsiteCms(db, data, user.id);
    return NextResponse.json({ message: 'Website CMS saved successfully', cms });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to save website CMS' }, { status: error.status || 400 });
  }
}
