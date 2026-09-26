import Database from '@/lib/db/index';
import { publishedReviews } from '@/lib/reviews/service';
import { absoluteUrl } from '@/lib/seo/site';
import { getSiteContext } from '@/modules/public-site/services/seo';

export const dynamic = 'force-dynamic';

/**
 * Only canonical, public, indexable URLs that return 200: fixed pages, live service pages and
 * published guides. Pages marked noindex (or pointing their canonical elsewhere) are left out.
 */
export default async function sitemap() {
  const context = await getSiteContext();
  let hasReviews = false;
  try {
    hasReviews = (await publishedReviews(Database.getInstance(), { limit: 1 })).length > 0;
  } catch {
    hasReviews = false;
  }
  const fixed = ['/', '/services', '/packages', '/staff', '/gallery', '/contact', '/book-appointment'];
  if (hasReviews) fixed.push('/reviews');
  if (context.articles.length) fixed.push('/guides');

  const indexable = (path) => {
    const override = context.pageSeo[path];
    return !override?.noindex && !(override?.canonicalOverride && override.canonicalOverride !== path);
  };

  const entries = fixed.filter(indexable).map((path) => ({ url: absoluteUrl(path) }));
  context.servicePages
    .filter((page) => !page.noindex)
    .forEach((page) => entries.push({ url: absoluteUrl(`/services/${page.slug}`), ...(page.updatedAt ? { lastModified: page.updatedAt } : {}) }));
  context.articles.forEach((article) => entries.push({ url: absoluteUrl(`/guides/${article.slug}`), lastModified: article.updatedAt || article.publishedAt || undefined }));
  return entries;
}
