import { Clock, MapPin, MessageCircle, Phone } from 'lucide-react';
import { PublicLayout } from '@/modules/public-site/components/public-layout';
import { Section } from '@/modules/public-site/components/section';
import { salonInfo } from '@/modules/public-site/data/salon-info';
import { createWhatsAppLink } from '@/modules/public-site/utils/whatsapp';

export const metadata = {
  title: 'Contact | The Haircut Salon',
  description: 'Contact The Haircut Salon, open WhatsApp, and find location details.',
};

export default function ContactPage() {
  return (
    <PublicLayout>
      <Section eyebrow="Contact" title={salonInfo.name} description="Reach the salon or request an appointment through WhatsApp.">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-2xl border border-[#e7ded2] bg-white p-6 shadow-sm">
            <div className="grid gap-5">
              <div className="flex gap-3"><MapPin className="h-5 w-5 text-[#8a6a52]" /><span>{salonInfo.address}</span></div>
              <div className="flex gap-3"><Phone className="h-5 w-5 text-[#8a6a52]" /><span>{salonInfo.phone}</span></div>
              <div className="flex gap-3"><Clock className="h-5 w-5 text-[#8a6a52]" /><span>{salonInfo.openingHours}</span></div>
              <a href={createWhatsAppLink()} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full bg-green-600 px-5 py-3 font-semibold text-white hover:bg-green-700">
                <MessageCircle className="h-5 w-5" />
                WhatsApp
              </a>
            </div>
          </div>
          <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-[#e7ded2] bg-white p-6 text-center text-[#6d625b] shadow-sm">
            <div>
              <MapPin className="mx-auto mb-3 h-10 w-10 text-[#8a6a52]" />
              <p className="font-semibold text-[#211d1a]">Google Map placeholder</p>
              <p className="mt-2 text-sm">{salonInfo.mapLabel}</p>
            </div>
          </div>
        </div>
      </Section>
    </PublicLayout>
  );
}
