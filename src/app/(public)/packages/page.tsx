import { PublicLayout } from '@/modules/public-site/components/public-layout';
import { Section } from '@/modules/public-site/components/section';
import { PackageCard } from '@/modules/public-site/components/cards';
import { getPublicWebsiteData } from '@/modules/public-site/services/cms';
import type { PublicPackage } from '@/modules/public-site/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const cms = await getPublicWebsiteData();
  return { title: `Packages | ${cms.info.name}`, description: cms.sections.packages.description };
}

export default async function PackagesPage() {
  const cms = await getPublicWebsiteData();
  const section = cms.sections.packages;
  return (
    <PublicLayout info={cms.info}>
      <Section eyebrow={section.subtitle || 'Fast grooming'} title={section.title || "Men's packages"} description={section.description || 'Choose a package for a complete grooming visit.'}>
        <div className="grid gap-5 lg:grid-cols-3">
          {cms.packages.map((item: PublicPackage) => <PackageCard key={item.name} item={item} />)}
        </div>
      </Section>
    </PublicLayout>
  );
}
