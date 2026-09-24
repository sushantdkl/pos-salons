import Link from 'next/link';
import { SiteShell } from '@/modules/public-site/components/site-shell';
import { PageHero } from '@/modules/public-site/components/page-hero';
import { Section } from '@/modules/public-site/components/section';
import { PackageCard } from '@/modules/public-site/components/cards';
import { getSiteContext, staticPageMetadata } from '@/modules/public-site/services/seo';
import type { PublicPackage } from '@/modules/public-site/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return staticPageMetadata(await getSiteContext(), '/packages');
}

export default async function PackagesPage() {
  const context = await getSiteContext();
  const { cms } = context;
  const section = cms.sections.packages;
  return (
    <SiteShell>
      <PageHero
        breadcrumbs={[{ name: 'Packages', href: '/packages' }]}
        eyebrow={section.subtitle || 'Fast grooming'}
        title={section.title || "Men's packages"}
        description={section.description || 'Choose a package for a complete grooming visit.'}
        imageUrl={section.imageUrl || context.info.assets.services}
      />
      <Section hideHeader className="!py-10 md:!py-14">
        <div className="grid gap-6 lg:grid-cols-3">
          {cms.packages.map((item: PublicPackage, index: number) => (
            <PackageCard key={item.name} item={item} variant="tier" featured={index === 1} />
          ))}
        </div>
        <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
          <Link
            href="/book-appointment"
            className="inline-flex items-center justify-center border border-[#171411] bg-[#171411] px-8 py-4 text-xs font-bold uppercase tracking-wider text-white transition-colors duration-300 hover:bg-[#332920]"
          >
            Book a package
          </Link>
          <Link
            href="/services"
            className="inline-flex items-center justify-center border border-[#d7b56d] bg-white px-8 py-4 text-xs font-bold uppercase tracking-wider text-[#171411] transition-colors duration-300 hover:bg-[#f8f3ed]"
          >
            View services
          </Link>
        </div>
      </Section>
    </SiteShell>
  );
}
