import { PublicLayout } from '@/modules/public-site/components/public-layout';
import { Section } from '@/modules/public-site/components/section';
import { PackageCard } from '@/modules/public-site/components/cards';
import { publicPackages } from '@/modules/public-site/data/packages';

export const metadata = {
  title: "Men's Packages | The Haircut Salon",
  description: 'Silver, Gold, and Platinum salon grooming packages.',
};

export default function PackagesPage() {
  return (
    <PublicLayout>
      <Section eyebrow="Fast grooming" title="Men's packages" description="Choose a package for a complete grooming visit.">
        <div className="grid gap-5 lg:grid-cols-3">
          {publicPackages.map((item) => <PackageCard key={item.name} item={item} />)}
        </div>
      </Section>
    </PublicLayout>
  );
}
