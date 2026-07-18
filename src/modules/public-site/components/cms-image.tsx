'use client';

import Image, { type ImageProps } from 'next/image';

/** Rewrite local upload URLs so Next never fetches localhost as a remote host. */
function normalizeSrc(src: string) {
  const value = String(src || '').trim();
  if (!value) return '';

  if (value.startsWith('/uploads/')) return value.split('?')[0];
  if (value.startsWith('uploads/')) return `/${value.split('?')[0]}`;

  try {
    if (/^https?:\/\//i.test(value)) {
      const url = new URL(value);
      if (url.pathname.startsWith('/uploads/')) return url.pathname;
      if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
        return url.pathname || value;
      }
    }
  } catch {
    return value;
  }

  return value;
}

function shouldSkipOptimization(src: string) {
  const value = String(src || '');
  return (
    value.startsWith('/uploads/') ||
    /\/\/(localhost|127\.0\.0\.1)/i.test(value)
  );
}

/**
 * Safe image for CMS/public media. Uploaded files skip Next optimizer so
 * localhost private-IP blocking does not break gallery/service photos.
 */
export function CmsImage({
  src,
  alt = '',
  className = '',
  fill,
  sizes,
  priority,
  ...props
}: ImageProps) {
  if (!src) return null;
  const normalized = normalizeSrc(typeof src === 'string' ? src : String(src));
  if (!normalized) return null;
  const unoptimized = shouldSkipOptimization(normalized);

  return (
    <Image
      src={normalized}
      alt={alt}
      className={className}
      fill={fill}
      sizes={sizes}
      priority={priority}
      unoptimized={unoptimized}
      {...props}
    />
  );
}
