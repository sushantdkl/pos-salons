import { BookingForm } from '@/modules/public-site/components/booking-form';
import { JsonLd } from '@/modules/public-site/components/json-ld';
import { directionsUrl, hasPublishedReviews } from '@/modules/public-site/components/site-shell';
import { breadcrumbJsonLd, getSiteContext, localBusinessJsonLd, staticPageMetadata } from '@/modules/public-site/services/seo';
import type { ServicePage } from '@/modules/public-site/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return staticPageMetadata(await getSiteContext(), '/book-appointment');
}

export default async function BookAppointmentPage() {
  const context = await getSiteContext();
  const { cms } = context;
  return (
    <>
      <JsonLd
        data={[
          localBusinessJsonLd(context),
          breadcrumbJsonLd([{ name: 'Home', href: '/' }, { name: 'Book Appointment', href: '/book-appointment' }]),
        ]}
      />
      <BookingForm
        info={context.info}
        services={cms.services}
        packages={cms.packages}
        staff={cms.staff}
        layout={{
          servicePages: context.servicePages.map((page: ServicePage) => ({ slug: page.slug, name: page.name })),
          showGuides: context.articles.length > 0,
          showReviews: await hasPublishedReviews(),
          directionsUrl: directionsUrl(context),
        }}
      />
    </>
  );
}
