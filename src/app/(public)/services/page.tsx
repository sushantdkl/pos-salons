import Link from 'next/link';
import { PublicLayout } from '@/modules/public-site/components/public-layout';
import { PageHero } from '@/modules/public-site/components/page-hero';
import { Section } from '@/modules/public-site/components/section';
import { ServiceMenuList } from '@/modules/public-site/components/service-menu-list';
import { getPublicWebsiteData } from '@/modules/public-site/services/cms';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const cms = await getPublicWebsiteData();
  return { title: `Services | ${cms.info.name}`, description: cms.sections.services.description };
}

export default async function ServicesPage() {
  const cms = await getPublicWebsiteData();
  const section = cms.sections.services;
  return (
    <PublicLayout info={cms.info}>
      <PageHero
        eyebrow={section.subtitle || 'Rate card'}
        title="Services"
        description={section.description || 'Transparent pricing for grooming, beauty care, and treatments.'}
        imageUrl={section.imageUrl || cms.info.assets.services}
      />
      <Section hideHeader className="!py-10 md:!py-14">
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
    </PublicLayout>
  );
}
