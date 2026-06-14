import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import { uploadWebsiteImage } from '@/lib/uploads/upload-image';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    await requireRole(request, db, 'admin');

    const formData = await request.formData();
    const file = formData.get('file');
    const folder = formData.get('folder');
    const uploaded = await uploadWebsiteImage({ file, folder });

    return NextResponse.json({
      message: 'Image uploaded successfully',
      imageUrl: uploaded.url,
      filename: uploaded.filename,
      folder: uploaded.folder,
      size: uploaded.size,
      mimeType: uploaded.mimeType,
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Image upload failed' },
      { status: error.status || 400 }
    );
  }
}
