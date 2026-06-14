import { readFile } from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';
import { isAllowedUploadFolder, resolveUploadDirectory } from '@/lib/uploads/upload-image';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIME_TYPES = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);

function safeFilename(value) {
  const filename = String(value || '').trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(filename) || filename.includes('..')) return '';
  return filename;
}

export async function GET(_request, { params }) {
  try {
    const { folder, filename } = await params;
    if (!isAllowedUploadFolder(folder)) {
      return NextResponse.json({ error: 'Invalid upload folder' }, { status: 400 });
    }

    const safeName = safeFilename(filename);
    if (!safeName) {
      return NextResponse.json({ error: 'Invalid image name' }, { status: 400 });
    }

    const extension = path.extname(safeName).toLowerCase();
    const contentType = MIME_TYPES.get(extension);
    if (!contentType) {
      return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 });
    }

    const directory = resolveUploadDirectory(folder);
    const filePath = path.join(directory, safeName);
    const relativePath = path.relative(directory, filePath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      return NextResponse.json({ error: 'Invalid image path' }, { status: 400 });
    }

    const file = await readFile(filePath);
    return new NextResponse(file, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }
}
