import { Clock, Facebook, MapPin, MessageCircle, Music2, Phone } from 'lucide-react';
import { PublicLayout } from '@/modules/public-site/components/public-layout';
import { Section } from '@/modules/public-site/components/section';
import { getPublicWebsiteData } from '@/modules/public-site/services/cms';
import { createWhatsAppLink } from '@/modules/public-site/utils/whatsapp';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const cms = await getPublicWebsiteData();
  return { title: `Contact | ${cms.info.name}`, description: cms.sections.contact.description };
}

export default async function ContactPage() {
  const cms = await getPublicWebsiteData();
  const { info } = cms;
  return (
    <PublicLayout info={info}>
      <Section eyebrow="Contact" title={info.name} description={cms.sections.contact.description || 'Reach the salon or request an appointment through WhatsApp.'}>
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-2xl border border-[#e7ded2] bg-white p-6 shadow-sm">
            <div className="grid gap-5">
              <div className="flex gap-3"><MapPin className="h-5 w-5 text-[#8a6a52]" /><span>{info.address}</span></div>
              <div className="flex gap-3"><Phone className="h-5 w-5 text-[#8a6a52]" /><span>{info.phone}</span></div>
              <div className="flex gap-3"><Clock className="h-5 w-5 text-[#8a6a52]" /><span>{info.openingHours}</span></div>
              <div className="grid gap-2 sm:grid-cols-3">
                <a href={createWhatsAppLink(undefined, info.whatsappNumber)} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full bg-green-600 px-5 py-3 font-semibold text-white hover:bg-green-700">
                  <MessageCircle className="h-5 w-5" />
                  WhatsApp
                </a>
                <a href={info.social.facebook} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full border border-[#d7b56d] px-5 py-3 font-semibold text-[#171411] hover:bg-[#fff9eb]">
                  <Facebook className="h-5 w-5" />
                  Facebook
                </a>
                <a href={info.social.tiktok} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full border border-[#d7b56d] px-5 py-3 font-semibold text-[#171411] hover:bg-[#fff9eb]">
                  <Music2 className="h-5 w-5" />
                  TikTok
                </a>
              </div>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-[#e7ded2] bg-white shadow-sm">
            <iframe
              src={info.mapEmbedUrl}
              title={`${info.name} map`}
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
