import { PublicLayout } from '@/modules/public-site/components/public-layout';
import { Section } from '@/modules/public-site/components/section';
import { ServiceCard } from '@/modules/public-site/components/cards';
import { getPublicWebsiteData } from '@/modules/public-site/services/cms';
import type { PublicService } from '@/modules/public-site/types';

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
      <Section eyebrow={section.subtitle || 'Rate card'} title="Services" description={section.description || 'Transparent pricing for grooming, beauty care, and treatments.'}>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cms.services.map((service: PublicService) => <ServiceCard key={service.name} service={service} />)}
        </div>
      </Section>
    </PublicLayout>
  );
}
