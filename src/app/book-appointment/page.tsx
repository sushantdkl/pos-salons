import { BookingForm } from '@/modules/public-site/components/booking-form';
import { getPublicWebsiteData } from '@/modules/public-site/services/cms';

export const dynamic = 'force-dynamic';

export function generateMetadata() {
  const cms = getPublicWebsiteData();
  return {
    title: `Book Appointment | ${cms.info.name}`,
    description: `Send a WhatsApp appointment request to ${cms.info.name}.`,
  };
}

export default function BookAppointmentPage() {
  const cms = getPublicWebsiteData();
  return (
    <BookingForm
      info={cms.info}
      services={cms.services}
      packages={cms.packages}
      staff={cms.staff}
    />
  );
}
