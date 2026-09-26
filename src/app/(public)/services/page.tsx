import Link from 'next/link';
import { SiteShell } from '@/modules/public-site/components/site-shell';
import { PageHero } from '@/modules/public-site/components/page-hero';
import { Section } from '@/modules/public-site/components/section';
import { ServiceMenuList } from '@/modules/public-site/components/service-menu-list';
import { getSiteContext, staticPageMetadata } from '@/modules/public-site/services/seo';
import type { ServicePage } from '@/modules/public-site/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return staticPageMetadata(await getSiteContext(), '/services');
}

export default async function ServicesPage() {
  const context = await getSiteContext();
  const { cms, servicePages } = context;
  const section = cms.sections.services;
  return (
    <SiteShell>
      <PageHero
        breadcrumbs={[{ name: 'Services', href: '/services' }]}
        eyebrow={section.subtitle || 'Rate card'}
        title="Services & prices"
        description={section.description || 'Transparent pricing for grooming, beauty care, and treatments.'}
        imageUrl={section.imageUrl || context.info.assets.services}
      />
      <Section hideHeader className="!py-10 md:!py-14">
        {servicePages.length ? (
          <div className="mb-10">
            <h2 className="font-serif text-2xl font-light text-[#171411] md:text-3xl">Service details</h2>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {servicePages.map((page: ServicePage) => (
                <li key={page.slug}>
                  <Link href={`/services/${page.slug}`} className="group flex h-full flex-col border border-[#e7ded2] bg-white p-5 transition-colors hover:border-[#d7b56d]">
                    <span className="font-serif text-xl font-light text-[#171411]">{page.name}</span>
                    <span className="mt-2 flex-1 text-sm leading-relaxed text-[#6d625b]">{page.summary}</span>
                    <span className="mt-4 text-xs font-bold uppercase tracking-wider text-[#8a6727] group-hover:underline">Prices & details</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <h2 className="mb-5 font-serif text-2xl font-light text-[#171411] md:text-3xl">Full price list</h2>
        <ServiceMenuList services={cms.services} />
        <div className="mt-8">
          <Link
            href="/book-appointment"
            className="inline-flex items-center justify-center bg-[#d7b56d] px-8 py-4 text-xs font-bold uppercase tracking-wider text-[#171411] transition-colors duration-300 hover:bg-[#c39e2e]"
          >
            Book a service
          </Link>
        </div>
      </Section>
    </SiteShell>
  );
}
