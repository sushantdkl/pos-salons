import { randomUUID } from 'crypto';
import path from 'path';
import { mkdir, writeFile } from 'fs/promises';

const ALLOWED_TYPES = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_FOLDERS = new Set(['gallery', 'services', 'staff', 'packages', 'banners', 'seo', 'payment-qr']);

function uploadRoot() {
  return process.env.UPLOAD_DIR || path.join('/tmp', 'website-assets');
}

function uploadBaseUrl() {
  return (process.env.NEXT_PUBLIC_UPLOAD_BASE_URL || '/uploads/website-assets').replace(/\/+$/, '');
}

function safeFolder(value) {
  const folder = String(value || '').toLowerCase().trim();
  if (!ALLOWED_FOLDERS.has(folder)) {
    const error = new Error('Invalid upload folder');
    error.status = 400;
    throw error;
  }
  return folder;
}

function safeBaseName(name) {
  return String(name || 'image')
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'image';
}

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

export async function uploadWebsiteImage({ file, folder }) {
  if (!file || typeof file.arrayBuffer !== 'function') fail('Image file is required');
  const safeUploadFolder = safeFolder(folder);
  const mimeType = String(file.type || '').toLowerCase();
  if (!ALLOWED_TYPES.has(mimeType)) fail('Only JPEG, PNG, and WebP images are allowed');
  if (Number(file.size || 0) <= 0) fail('Uploaded image is empty');
  if (Number(file.size || 0) > MAX_FILE_SIZE) fail('Image must be 5MB or smaller');

  const extension = ALLOWED_TYPES.get(mimeType);
  const filename = `${Date.now()}-${randomUUID()}-${safeBaseName(file.name)}${extension}`;
  const root = uploadRoot();
  const targetDirectory = path.join(root, safeUploadFolder);
  const relativeTarget = path.relative(root, targetDirectory);
  if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) fail('Invalid upload path');

  await mkdir(targetDirectory, { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(targetDirectory, filename), bytes, { flag: 'wx' });

  return {
    url: `${uploadBaseUrl()}/${safeUploadFolder}/${filename}`,
    filename,
    folder: safeUploadFolder,
    mimeType,
    size: file.size,
  };
}
