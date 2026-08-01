import path from 'path';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { ALLOWED_IMAGE_TYPES, getUploadRule, formatUploadLimit } from './upload-rules.js';

const ALLOWED_FOLDERS = new Set(['gallery', 'services', 'staff', 'packages', 'banners', 'seo', 'payment-qr']);
const RELATIVE_UPLOAD_BASE = '/uploads/website-assets';

function uploadRoot() {
  return process.env.UPLOAD_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', 'uploads', 'website-assets');
}

/**
 * Always prefer relative URLs so Next/Image never fetches localhost as a remote "private IP".
 * Absolute production domains still normalize down to the path when they point at /uploads/.
 */
export function toPublicUploadUrl(value) {
  const cleaned = String(value || '').trim();
  if (!cleaned) return '';

  if (cleaned.startsWith('/uploads/')) return cleaned.split('?')[0];

  try {
    if (/^https?:\/\//i.test(cleaned)) {
      const url = new URL(cleaned);
      if (url.pathname.startsWith('/uploads/')) {
        return url.pathname;
      }
      if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
        return url.pathname || RELATIVE_UPLOAD_BASE;
      }
      return cleaned;
    }
  } catch {
    return cleaned;
  }

  if (cleaned.startsWith('uploads/')) return `/${cleaned}`;
  return cleaned;
}

function uploadBaseUrl() {
  const configured = (process.env.NEXT_PUBLIC_UPLOAD_BASE_URL || RELATIVE_UPLOAD_BASE).replace(/\/+$/, '');
  return toPublicUploadUrl(configured) || RELATIVE_UPLOAD_BASE;
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

function uploadPathFromPublicUrl(value) {
  const publicUrl = toPublicUploadUrl(value);
  if (!publicUrl.startsWith(`${RELATIVE_UPLOAD_BASE}/`)) return '';
  const parts = publicUrl.slice(`${RELATIVE_UPLOAD_BASE}/`.length).split('/');
  if (parts.length !== 2) return '';
  const [folder, filename] = parts;
  if (!isAllowedUploadFolder(folder)) return '';
  if (!/^[a-zA-Z0-9._-]+$/.test(filename) || filename.includes('..')) return '';
  const directory = resolveUploadDirectory(folder);
  const filePath = path.join(directory, filename);
  const relativePath = path.relative(directory, filePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) return '';
  return filePath;
}

export async function deletePublicUploadUrl(value) {
  const filePath = uploadPathFromPublicUrl(value);
  if (!filePath) return false;
  try {
    await unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

function extensionFromName(name) {
  const ext = path.extname(String(name || '')).toLowerCase().replace('.', '');
  if (ext === 'jpg') return 'jpeg';
  return ext;
}

function detectImageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) return 'png';
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) return 'webp';
  return '';
}

function outputForRule(folderRule, imageType) {
  if (folderRule.output === 'qr') {
    if (imageType === 'webp') return { extension: '.webp', mimeType: 'image/webp', mode: 'webp-lossless' };
    return { extension: '.png', mimeType: 'image/png', mode: 'png' };
  }

  if (folderRule.output === 'webp-lossless') {
    return { extension: '.webp', mimeType: 'image/webp', mode: 'webp-lossless' };
  }

  return { extension: '.webp', mimeType: 'image/webp', mode: 'webp' };
}

async function optimizeImage(buffer, folderRule, imageType) {
  try {
    const image = sharp(buffer, { failOn: 'error', limitInputPixels: 40_000_000 });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || !['jpeg', 'png', 'webp'].includes(metadata.format)) {
      fail('Unsupported image format');
    }

    const pipeline = sharp(buffer, { failOn: 'error', limitInputPixels: 40_000_000 })
      .rotate()
      .resize({
        width: folderRule.maxWidth,
        height: folderRule.maxHeight,
        fit: 'inside',
        withoutEnlargement: true,
      });

    const output = outputForRule(folderRule, imageType);
    if (!output) fail('Unsupported image format.');

    if (output.mode === 'png') {
      return {
        buffer: await pipeline.png({
          compressionLevel: 6,
          adaptiveFiltering: false,
          palette: false,
        }).toBuffer(),
        extension: output.extension,
        mimeType: output.mimeType,
      };
    }

    if (output.mode === 'webp-lossless') {
      return {
        buffer: await pipeline.webp({ lossless: true, effort: 4 }).toBuffer(),
        extension: output.extension,
        mimeType: output.mimeType,
      };
    }

    return {
      buffer: await pipeline.webp({ quality: folderRule.quality, effort: 4 }).toBuffer(),
      extension: output.extension,
      mimeType: output.mimeType,
    };
  } catch (error) {
    if (error?.status) throw error;
    fail('Unable to process the image. Please try another file.');
  }
}

export async function uploadWebsiteImage({ file, folder }) {
  if (!file || typeof file.arrayBuffer !== 'function') fail('Image file is required');
  const safeUploadFolder = safeFolder(folder);
  const folderRule = getUploadRule(safeUploadFolder);
  const mimeType = String(file.type || '').toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) fail('Only JPEG, PNG, and WebP images are allowed');
  if (Number(file.size || 0) <= 0) fail('Uploaded image is empty');
  if (Number(file.size || 0) > folderRule.maxSize) fail(`${folderRule.label} must be smaller than ${formatUploadLimit(folderRule.maxSize)}.`);

  const bytes = Buffer.from(await file.arrayBuffer());
  const detectedType = detectImageType(bytes);
  const declaredType = mimeType.replace('image/', '').replace('jpg', 'jpeg');
  const fileExtension = extensionFromName(file.name);
  if (!detectedType || detectedType !== declaredType || fileExtension !== declaredType) {
    fail('Unsupported image format.');
  }

  const optimized = await optimizeImage(bytes, folderRule, detectedType);

  const filename = `${Date.now()}-${randomUUID()}-${safeBaseName(file.name)}${optimized.extension}`;
  const root = uploadRoot();
  await ensureUploadFolders(root);
  const targetDirectory = resolveUploadDirectory(safeUploadFolder);
  const filePath = path.join(targetDirectory, filename);
  await writeFile(filePath, optimized.buffer, { flag: 'wx' });
  const imageUrl = `${uploadBaseUrl()}/${safeUploadFolder}/${filename}`;

  return {
    url: imageUrl,
    filename,
    filePath,
    folder: safeUploadFolder,
    mimeType: optimized.mimeType,
    size: optimized.buffer.length,
    originalSize: file.size,
  };
}
