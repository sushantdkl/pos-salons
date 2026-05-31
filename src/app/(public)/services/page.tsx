import { PublicLayout } from '@/modules/public-site/components/public-layout';
import { Section } from '@/modules/public-site/components/section';
import { ServiceCard } from '@/modules/public-site/components/cards';
import { publicServices } from '@/modules/public-site/data/services';

export const metadata = {
  title: 'Services | The Haircut Salon',
  description: 'Salon services and rates for hair, beard, facial, beauty, and treatment services.',
};

export default function ServicesPage() {
  return (
    <PublicLayout>
      <Section eyebrow="Rate card" title="Services" description="Transparent pricing for grooming, beauty care, and treatments.">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {publicServices.map((service) => <ServiceCard key={service.name} service={service} />)}
        </div>
      </Section>
    </PublicLayout>
  );
}
