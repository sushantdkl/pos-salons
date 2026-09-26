/**
 * The ONE canonical public origin for the salon website.
 *
 * Deliberately NOT NEXT_PUBLIC_SITE_URL: that variable is inlined at build time and the live
 * build shipped with a stale Vercel preview URL, which put the wrong host into robots.txt,
 * sitemap.xml and every og:image. SITE_CANONICAL_URL is read at request time on the server.
 */
export const DEFAULT_SITE_URL = 'https://thehaircut.com.np';

/** Hosts that must never become the public canonical (staging, previews, local machines). */
export function isNonCanonicalHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host.endsWith('.vercel.app') || host === 'localhost' || host.endsWith('.localhost') || /^(127\.|10\.|192\.168\.|0\.0\.0\.0|\[?::1\]?)/.test(host);
}

/** https origin with no trailing slash. A staging, local or plain-http value falls back to production. */
export function resolveSiteUrl(value) {
  const raw = String(value || DEFAULT_SITE_URL).trim().replace(/\/+$/, '');
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || isNonCanonicalHost(url.hostname)) return DEFAULT_SITE_URL;
    return `${url.protocol}//${url.host}`;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export function siteUrl() {
  return resolveSiteUrl(process.env.SITE_CANONICAL_URL);
}

/** Absolute URL on the canonical host. Leaves http(s) URLs alone. */
export function absoluteUrl(path = '/') {
  const value = String(path || '/');
  if (/^https?:\/\//i.test(value)) return value;
  const clean = value.startsWith('/') ? value : `/${value}`;
  return clean === '/' ? `${siteUrl()}/` : `${siteUrl()}${clean}`;
}

/**
 * Private application areas. Never in the sitemap, disallowed in robots.txt and sent with
 * `X-Robots-Tag: noindex` (next.config.mjs). Authentication, not robots.txt, protects them.
 */
export const PRIVATE_PATH_PREFIXES = [
  '/admin',
  '/dashboard',
  '/cashier',
  '/store',
  '/appointments',
  '/attendance',
  '/api',
  '/auth',
  '/login',
  '/activate',
  '/license-expired',
];

export function isPrivatePath(path) {
  const value = String(path || '');
  return PRIVATE_PATH_PREFIXES.some((prefix) => value === prefix || value.startsWith(`${prefix}/`));
}

/** URL-safe slug. Used when staff type a slug; never regenerated from a title automatically. */
export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** A same-site path like "/services/haircut" (no host, no query, no trailing slash). */
export function normalizePath(value) {
  let path = String(value || '').trim();
  if (!path) return '';
  try {
    if (/^https?:\/\//i.test(path)) path = new URL(path).pathname;
  } catch {
    return '';
  }
  path = path.split(/[?#]/)[0];
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return /^\/[A-Za-z0-9\-._~/%]*$/.test(path) ? path : '';
}
