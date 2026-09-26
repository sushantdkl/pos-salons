import { PERMISSIONS, requireRoleWithPermission } from '@/lib/auth/permissions';
import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import { deletePublicUploadUrl, uploadWebsiteImage } from '@/lib/uploads/upload-image';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRoleWithPermission(request, db, ['admin', 'cashier'], PERMISSIONS.WEBSITE_MANAGE);

    const formData = await request.formData();
    const file = formData.get('file');
    const folder = formData.get('folder');
    // Payment QR images belong to Settings (admin only); website images to the CMS permission.
    if (user.role !== 'admin' && String(folder) === 'payment-qr') {
      return NextResponse.json({ error: 'Only an admin can change payment QR images' }, { status: 403 });
    }
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

export async function DELETE(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRoleWithPermission(request, db, ['admin', 'cashier'], PERMISSIONS.WEBSITE_MANAGE);
    const { imageUrl } = await request.json();
    if (user.role !== 'admin' && String(imageUrl || '').includes('/payment-qr/')) {
      return NextResponse.json({ error: 'Only an admin can change payment QR images' }, { status: 403 });
    }
    await deletePublicUploadUrl(imageUrl);
    return NextResponse.json({ message: 'Image removed' });
  } catch {
    return NextResponse.json({ error: 'Could not remove image' }, { status: 400 });
  }
}
