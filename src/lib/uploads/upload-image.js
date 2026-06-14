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
  return process.env.UPLOAD_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', 'uploads', 'website-assets');
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

export function isAllowedUploadFolder(value) {
  return ALLOWED_FOLDERS.has(String(value || '').toLowerCase().trim());
}

export function resolveUploadDirectory(folder = '') {
  const root = uploadRoot();
  if (!folder) return root;
  const safeUploadFolder = safeFolder(folder);
  const targetDirectory = path.join(root, safeUploadFolder);
  const relativeTarget = path.relative(root, targetDirectory);
  if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) fail('Invalid upload path');
  return targetDirectory;
}

async function ensureUploadFolders(root) {
  await mkdir(root, { recursive: true });
  await Promise.all(
    Array.from(ALLOWED_FOLDERS).map((folder) => mkdir(path.join(root, folder), { recursive: true }))
  );
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
  await ensureUploadFolders(root);
  const targetDirectory = resolveUploadDirectory(safeUploadFolder);

  const bytes = Buffer.from(await file.arrayBuffer());
  const filePath = path.join(targetDirectory, filename);
  await writeFile(filePath, bytes, { flag: 'wx' });
  const imageUrl = `${uploadBaseUrl()}/${safeUploadFolder}/${filename}`;

  if (process.env.NODE_ENV !== 'production') {
    console.log('UPLOAD_DIR:', root);
    console.log('TARGET_DIR:', targetDirectory);
    console.log('FILE_PATH:', filePath);
    console.log('IMAGE_URL:', imageUrl);
  }

  return {
    url: imageUrl,
    filename,
    filePath,
    folder: safeUploadFolder,
    mimeType,
    size: file.size,
  };
}
