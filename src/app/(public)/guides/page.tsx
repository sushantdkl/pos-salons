import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteShell } from '@/modules/public-site/components/site-shell';
import { PageHero } from '@/modules/public-site/components/page-hero';
import { Section } from '@/modules/public-site/components/section';
import { CmsImage } from '@/modules/public-site/components/cms-image';
import { getSiteContext, staticPageMetadata } from '@/modules/public-site/services/seo';
import type { Article } from '@/modules/public-site/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const context = await getSiteContext();
  if (!context.articles.length) return { title: 'Page not found', robots: { index: false } };
  return staticPageMetadata(context, '/guides');
}

function date(value: string | null) {
  return value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kathmandu' }) : '';
}

/** Exists only once at least one guide is published — no empty “blog” page for crawlers. */
export default async function GuidesPage() {
  const context = await getSiteContext();
  if (!context.articles.length) notFound();
  const defaults = { title: 'Hair & grooming guides', description: `Practical advice from the team at ${context.info.name}.` };
  return (
    <SiteShell>
      <PageHero breadcrumbs={[{ name: 'Guides', href: '/guides' }]} eyebrow={context.info.name} title={defaults.title} description={defaults.description} />
      <Section hideHeader className="!py-10 md:!py-14">
        <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {context.articles.map((article: Article) => (
            <li key={article.slug}>
              <Link href={`/guides/${article.slug}`} className="group flex h-full flex-col border border-[#e7ded2] bg-white hover:border-[#d7b56d]">
                {article.coverImage ? (
                  <span className="relative block aspect-[16/9] overflow-hidden bg-[#f1e9dc]">
                    <CmsImage src={article.coverImage} alt={article.coverAlt || ''} fill sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw" className="object-cover" />
                  </span>
                ) : null}
                <span className="flex flex-1 flex-col p-5">
                  <span className="text-xs uppercase tracking-wider text-[#6d625b]">{date(article.publishedAt)}</span>
                  <span className="mt-2 font-serif text-2xl font-light text-[#171411] group-hover:underline">{article.title}</span>
                  <span className="mt-2 text-sm leading-relaxed text-[#6d625b]">{article.excerpt}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </SiteShell>
  );
}
