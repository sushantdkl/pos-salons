import Link from 'next/link';
import { Clock, Facebook, MapPin, MessageCircle, Music2, Navigation, Phone } from 'lucide-react';
import { SiteShell, directionsUrl } from '@/modules/public-site/components/site-shell';
import { PageHero } from '@/modules/public-site/components/page-hero';
import { Section } from '@/modules/public-site/components/section';
import { getSiteContext, staticPageMetadata } from '@/modules/public-site/services/seo';
import { createWhatsAppLink } from '@/modules/public-site/utils/whatsapp';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return staticPageMetadata(await getSiteContext(), '/contact');
}

export default async function ContactPage() {
  const context = await getSiteContext();
  const { cms, info, settings } = context;
  const tel = `tel:${String(info.phone || '').replace(/[^\d+]/g, '')}`;
  const rows: Array<[typeof MapPin, string, string, string?]> = [
    [MapPin, 'Address', [info.address, settings.region, 'Nepal'].filter(Boolean).join(', ')],
    [Phone, 'Phone', info.phone, tel],
    [Clock, 'Opening hours', info.openingHours || "Please call or WhatsApp to confirm today's hours."],
  ];
  if (settings.landmark) rows.splice(1, 0, [MapPin, 'Landmark', settings.landmark]);
  if (settings.parking) rows.push([MapPin, 'Parking', settings.parking]);
  return (
    <SiteShell>
      <PageHero
        breadcrumbs={[{ name: 'Contact', href: '/contact' }]}
        eyebrow={info.name}
        title="Contact & Directions"
        description={cms.sections.contact.description || 'Reach the salon or request an appointment through WhatsApp.'}
        imageUrl={cms.sections.contact.imageUrl || info.assets.about}
      />
      <Section hideHeader className="!py-10 md:!py-14 !border-b-0">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
          <div className="space-y-6">
            {rows.map(([Icon, label, value, href]) => (
              <div key={String(label)} className="flex gap-4 border border-[#e7ded2] bg-white p-6">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#8a6727]" strokeWidth={1.5} />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8a6727]">{String(label)}</p>
                  <p className="mt-2 font-serif text-xl font-light leading-relaxed text-[#171411] md:text-2xl">
                    {href ? <a href={href} className="hover:text-[#8a6727]">{value}</a> : value}
                  </p>
                </div>
              </div>
            ))}
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a
                href={directionsUrl(context)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 border border-[#171411] bg-white px-8 py-4 text-xs font-bold uppercase tracking-wider text-[#171411] transition-colors duration-300 hover:bg-[#f8f3ed]"
              >
                <Navigation className="h-4 w-4" />
                Get directions
              </a>
              <a
                href={createWhatsAppLink(undefined, info.whatsappNumber)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 bg-[#d7b56d] px-8 py-4 text-xs font-bold uppercase tracking-wider text-[#171411] transition-colors duration-300 hover:bg-[#c39e2e]"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
              <a
                href={info.social.facebook}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 border border-[#e7ded2] bg-white px-8 py-4 text-xs font-bold uppercase tracking-wider text-[#171411] transition-colors duration-300 hover:bg-[#f8f3ed]"
              >
                <Facebook className="h-4 w-4" />
                Facebook
              </a>
              <a
                href={info.social.tiktok}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 border border-[#e7ded2] bg-white px-8 py-4 text-xs font-bold uppercase tracking-wider text-[#171411] transition-colors duration-300 hover:bg-[#f8f3ed]"
              >
                <Music2 className="h-4 w-4" />
                TikTok
              </a>
              <Link
                href="/book-appointment"
                className="inline-flex items-center justify-center border border-[#171411] bg-[#171411] px-8 py-4 text-xs font-bold uppercase tracking-wider text-white transition-colors duration-300 hover:bg-[#332920]"
              >
                Book appointment
              </Link>
            </div>
          </div>
          <div className="overflow-hidden border border-[#e7ded2] bg-white">
            <iframe
              src={info.mapEmbedUrl}
              title={`Map showing ${info.name}, ${info.address}`}
              className="h-[380px] w-full md:h-[440px]"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      </Section>
    </SiteShell>
  );
}
