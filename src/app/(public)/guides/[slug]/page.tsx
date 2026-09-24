import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { SiteShell } from '@/modules/public-site/components/site-shell';
import { PageHero } from '@/modules/public-site/components/page-hero';
import { Section } from '@/modules/public-site/components/section';
import { CmsImage } from '@/modules/public-site/components/cms-image';
import { JsonLd } from '@/modules/public-site/components/json-ld';
import { RichText } from '@/modules/public-site/components/rich-text';
import { articleJsonLd, articleMetadata, findRedirect, getSiteContext } from '@/modules/public-site/services/seo';
import type { Article, ServicePage } from '@/modules/public-site/types';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const context = await getSiteContext();
  const article = context.articles.find((item: Article) => item.slug === slug);
  if (!article) return { title: 'Page not found', robots: { index: false } };
  return articleMetadata(context, article);
}

export default async function GuidePage({ params }: Params) {
  const { slug } = await params;
  const context = await getSiteContext();
  const article = context.articles.find((item: Article) => item.slug === slug);
  if (!article) {
    const target = await findRedirect(`/guides/${slug}`);
    if (target) permanentRedirect(target);
    notFound();
  }
  const service = context.servicePages.find((page: ServicePage) => page.slug === article.relatedServiceSlug);
  const published = article.publishedAt ? new Date(article.publishedAt) : null;
  const updated = article.updatedAt ? new Date(article.updatedAt) : null;
  const fmt = (value: Date) => value.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kathmandu' });
  return (
    <SiteShell>
      <JsonLd data={articleJsonLd(context, article)} />
      <PageHero
        breadcrumbs={[{ name: 'Guides', href: '/guides' }, { name: article.title, href: `/guides/${article.slug}` }]}
        eyebrow={[article.author, published ? fmt(published) : ''].filter(Boolean).join(' · ') || context.info.name}
        title={article.title}
        description={article.excerpt}
      />
      <Section hideHeader className="!py-10 md:!py-14">
        <article className="mx-auto max-w-3xl">
          {article.coverImage ? (
            <div className="relative mb-10 aspect-[16/9] overflow-hidden bg-[#f1e9dc]">
              <CmsImage src={article.coverImage} alt={article.coverAlt || ''} fill priority sizes="(min-width: 768px) 768px, 100vw" className="object-cover" />
            </div>
          ) : null}
          <RichText body={article.body} />
          {updated && published && updated.getTime() - published.getTime() > 86400000 ? (
            <p className="mt-8 text-xs uppercase tracking-wider text-[#6d625b]">Updated {fmt(updated)}</p>
          ) : null}
          <div className="mt-12 border border-[#e7ded2] bg-white p-6">
            <p className="font-serif text-2xl font-light text-[#171411]">{service ? `${service.name} at ${context.info.name}` : `Visit ${context.info.name}`}</p>
            <p className="mt-2 text-sm text-[#6d625b]">{context.info.address}</p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              {service ? (
                <Link href={`/services/${service.slug}`} className="inline-flex min-h-12 items-center justify-center border border-[#171411] px-6 text-xs font-bold uppercase tracking-wider text-[#171411] hover:bg-[#f8f3ed]">
                  {service.name} prices
                </Link>
              ) : null}
              <Link href="/book-appointment" className="inline-flex min-h-12 items-center justify-center bg-[#171411] px-6 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#332920]">
                Book an appointment
              </Link>
            </div>
          </div>
        </article>
      </Section>
    </SiteShell>
  );
}
