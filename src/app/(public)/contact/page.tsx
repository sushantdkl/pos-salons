import { Clock, Facebook, MapPin, MessageCircle, Music2, Phone } from 'lucide-react';
import { PublicLayout } from '@/modules/public-site/components/public-layout';
import { Section } from '@/modules/public-site/components/section';
import { salonInfo } from '@/modules/public-site/data/salon-info';
import { createWhatsAppLink } from '@/modules/public-site/utils/whatsapp';

export const metadata = {
  title: 'Contact | The Hair Cut',
  description: 'Contact The Hair Cut, open WhatsApp, and find location details.',
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
              <div className="grid gap-2 sm:grid-cols-3">
                <a href={createWhatsAppLink()} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full bg-green-600 px-5 py-3 font-semibold text-white hover:bg-green-700">
                  <MessageCircle className="h-5 w-5" />
                  WhatsApp
                </a>
                <a href={salonInfo.social.facebook} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full border border-[#d7b56d] px-5 py-3 font-semibold text-[#171411] hover:bg-[#fff9eb]">
                  <Facebook className="h-5 w-5" />
                  Facebook
                </a>
                <a href={salonInfo.social.tiktok} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full border border-[#d7b56d] px-5 py-3 font-semibold text-[#171411] hover:bg-[#fff9eb]">
                  <Music2 className="h-5 w-5" />
                  TikTok
                </a>
              </div>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-[#e7ded2] bg-white shadow-sm">
            <iframe
              src={salonInfo.mapEmbedUrl}
              title={`${salonInfo.name} map`}
              className="h-[420px] w-full"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      </Section>
    </PublicLayout>
  );
}
