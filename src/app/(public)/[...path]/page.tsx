import { notFound, permanentRedirect } from 'next/navigation';
import { findRedirect } from '@/modules/public-site/services/seo';

export const dynamic = 'force-dynamic';

/**
 * Catches every URL no route matched. Old public URLs listed in SEO & Local Search → Redirects
 * get a permanent redirect; everything else is a genuine 404 (never a redirect to the homepage).
 */
export default async function UnmatchedPath({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const target = await findRedirect(`/${(path || []).map((part) => encodeURIComponent(decodeURIComponent(part))).join('/')}`);
  if (target) permanentRedirect(target);
  notFound();
}
