export const KB = 1024;
export const MB = 1024 * KB;

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

export const UPLOAD_FOLDER_RULES = {
  banners: { maxSize: 2 * MB, maxWidth: 1920, maxHeight: 1080, output: 'webp', quality: 78, label: 'Image' },
  gallery: { maxSize: 2 * MB, maxWidth: 1920, maxHeight: 1080, output: 'webp', quality: 78, label: 'Image' },
  services: { maxSize: 1 * MB, maxWidth: 1200, maxHeight: 1200, output: 'webp', quality: 78, label: 'Image' },
  packages: { maxSize: 1 * MB, maxWidth: 1200, maxHeight: 1200, output: 'webp', quality: 78, label: 'Image' },
  staff: { maxSize: 1 * MB, maxWidth: 800, maxHeight: 800, output: 'webp', quality: 78, label: 'Image' },
  seo: { maxSize: 500 * KB, maxWidth: 1000, maxHeight: 1000, output: 'webp-lossless', quality: 90, label: 'Logo image' },
  'payment-qr': { maxSize: 500 * KB, maxWidth: 1200, maxHeight: 1200, output: 'qr', quality: 100, label: 'QR image', preserveQr: true },
};

export function formatUploadLimit(bytes) {
  if (bytes >= MB) return `${Math.round(bytes / MB)} MB`;
  return `${Math.round(bytes / KB)} KB`;
}

export function getUploadRule(folder) {
  return UPLOAD_FOLDER_RULES[String(folder || '').toLowerCase()] || null;
}

export function validateImageFileForFolder(file, folder) {
  const rule = getUploadRule(folder);
  if (!rule) return 'Invalid upload folder.';
  if (!file) return 'Image file is required.';
  if (!ALLOWED_IMAGE_TYPES.includes(String(file.type || '').toLowerCase())) return 'Unsupported image format.';
  const extension = String(file.name || '').split('.').pop()?.toLowerCase();
  if (!ALLOWED_IMAGE_EXTENSIONS.includes(extension || '')) return 'Unsupported image format.';
  if (Number(file.size || 0) <= 0) return 'Uploaded image is empty.';
  if (Number(file.size || 0) > rule.maxSize) return `${rule.label} must be smaller than ${formatUploadLimit(rule.maxSize)}.`;
  return '';
}
