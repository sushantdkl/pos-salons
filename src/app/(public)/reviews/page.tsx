import Link from 'next/link';
import { notFound } from 'next/navigation';
import Database from '@/lib/db/index';
import { publishedReviews } from '@/lib/reviews/service';
import { SiteShell } from '@/modules/public-site/components/site-shell';
import { PageHero } from '@/modules/public-site/components/page-hero';
import { Section } from '@/modules/public-site/components/section';
import { getSiteContext, staticPageMetadata } from '@/modules/public-site/services/seo';
import type { PublishedReview, ServicePage } from '@/modules/public-site/types';

export const dynamic = 'force-dynamic';

async function loadReviews() {
  try {
    return await publishedReviews(Database.getInstance(), { limit: 50 });
  } catch {
    return [];
  }
}

export async function generateMetadata() {
  const reviews = await loadReviews();
  if (!reviews.length) return { title: 'Page not found', robots: { index: false } };
  return staticPageMetadata(await getSiteContext(), '/reviews');
}

/**
 * Published, consented customer reviews — the same moderated set as the homepage. No schema
 * ratings are added for the salon's own reviews (Google ignores self-serving LocalBusiness stars).
 */
export default async function ReviewsPage() {
  const reviews = await loadReviews();
  if (!reviews.length) notFound();
  const context = await getSiteContext();
  const serviceLink = (name: string | null) => {
    if (!name) return null;
    const page = context.servicePages.find((item: ServicePage) => item.serviceNames.some((service: string) => service.toLowerCase() === name.toLowerCase()));
    return page ? { href: `/services/${page.slug}`, label: page.name } : null;
  };
  return (
    <SiteShell>
      <PageHero
        breadcrumbs={[{ name: 'Reviews', href: '/reviews' }]}
        eyebrow={context.info.name}
        title="Customer reviews"
        description="Reviews from real visits, shown with each customer's permission. We publish good and critical feedback alike."
      />
      <Section hideHeader className="!py-10 md:!py-14">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.map((review: PublishedReview, index: number) => {
            const link = serviceLink(review.service);
            return (
              <figure key={`${review.date}-${index}`} className="flex h-full flex-col border border-[#e7ded2] bg-white p-6">
                {review.rating ? <p className="text-lg tracking-widest text-[#c39e2e]" aria-label={`${review.rating} out of 5 stars`}>{'★'.repeat(review.rating)}<span className="text-[#e7ded2]">{'★'.repeat(5 - review.rating)}</span></p> : null}
                {review.text ? <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-[#3b342f]">“{review.text}”</blockquote> : <div className="flex-1" />}
                <figcaption className="mt-4 text-xs uppercase tracking-wider text-[#6d625b]">
                  {review.name} · {new Date(`${review.date}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', month: 'short', year: 'numeric' })}
                  {review.service ? <> · {link ? <Link href={link.href} className="underline-offset-4 hover:underline">{review.service}</Link> : review.service}</> : null}
                </figcaption>
              </figure>
            );
          })}
        </div>
        <p className="mt-10 text-sm text-[#3b342f]">
          Visited us recently? <Link href="/review" className="font-semibold text-[#8a6727] underline-offset-4 hover:underline">Tell us how it went</Link>.
        </p>
      </Section>
    </SiteShell>
  );
}
