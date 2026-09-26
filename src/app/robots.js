import { PRIVATE_PATH_PREFIXES, absoluteUrl } from '@/lib/seo/site';

export const dynamic = 'force-dynamic';

/**
 * Crawl rules for the public website. Private app areas are disallowed here AND sent with
 * `X-Robots-Tag: noindex` (next.config.mjs); login/authorisation is what actually protects them.
 */
export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: PRIVATE_PATH_PREFIXES.map((prefix) => (prefix === '/api' ? '/api/' : prefix)),
    },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
