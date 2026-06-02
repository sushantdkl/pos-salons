import Link from 'next/link';
import Image from 'next/image';
import { MessageCircle, Sparkles, Star, Users } from 'lucide-react';
import { PublicLayout } from '@/modules/public-site/components/public-layout';
import { Section } from '@/modules/public-site/components/section';
import { PackageCard, ServiceCard, StaffCard } from '@/modules/public-site/components/cards';
import { getPublicWebsiteData } from '@/modules/public-site/services/cms';
import { createWhatsAppLink } from '@/modules/public-site/utils/whatsapp';
import type { PublicPackage, PublicService, PublicStaffMember } from '@/modules/public-site/types';

export const dynamic = 'force-dynamic';

export function generateMetadata() {
  const cms = getPublicWebsiteData();
  return cms.seo;
}

export default function HomePage() {
  const cms = getPublicWebsiteData();
  const { info, sections } = cms;
  const hero = sections.hero;
  const servicesSection = sections.services;
  const packagesSection = sections.packages;
  const staffSection = sections.staff;
  const about = sections.about;
  const contact = sections.contact;
  const aboutImages = about.metadata.galleryImages?.length ? about.metadata.galleryImages : [info.assets.banner, info.assets.details];
  return (
    <PublicLayout info={info}>
      <main>
        {hero.isVisible ? <section className="px-4 py-16 sm:py-20">
          <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="mb-4 inline-flex rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#9b742d] shadow-sm">
                {hero.subtitle || info.tagline}
              </p>
              <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-[#171411] sm:text-6xl">
                {hero.title || info.name}
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-[#6d625b]">{hero.description || info.description}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href={hero.buttonLink || '/book-appointment'} className="inline-flex items-center justify-center rounded-full bg-[#171411] px-6 py-3 font-semibold text-white hover:bg-[#332920]">
                  {hero.buttonText || 'Book Appointment'}
                </Link>
                <a href={createWhatsAppLink(undefined, info.whatsappNumber)} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full border border-[#d7b56d] bg-white px-6 py-3 font-semibold text-[#171411] hover:bg-[#fffaf5]">
                  <MessageCircle className="h-5 w-5" />
                  {hero.secondaryButtonText || 'WhatsApp'}
                </a>
              </div>
            </div>
            <div className="relative min-h-[440px] overflow-hidden rounded-[2rem] bg-[#171411] text-white shadow-xl">
              <Image src={hero.imageUrl || info.assets.hero} alt="The Hair Cut salon interior" fill priority sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover opacity-75" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-7">
                <p className="text-sm uppercase tracking-wide text-[#f0c65d]">Salon experience</p>
                <h2 className="mt-3 text-3xl font-semibold">Clean cuts, polished beauty, calm service.</h2>
                <div className="mt-6 grid gap-3 text-sm text-white/85">
                  <span>Haircuts and grooming packages</span>
                  <span>Facials and beauty treatments</span>
                  <span>WhatsApp appointment requests</span>
                </div>
              </div>
            </div>
          </div>
        </section> : null}

        {servicesSection.isVisible ? <Section eyebrow={servicesSection.subtitle || 'Services'} title={servicesSection.title} description={servicesSection.description}>
          <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="relative min-h-[320px] overflow-hidden rounded-3xl bg-[#171411]">
              <Image src={servicesSection.imageUrl || info.assets.services} alt="Haircut service at The Hair Cut" fill sizes="(min-width: 1024px) 40vw, 100vw" className="object-cover" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {cms.popularServices.map((service: PublicService) => <ServiceCard key={service.name} service={service} />)}
            </div>
          </div>
        </Section> : null}

        {packagesSection.isVisible ? <Section eyebrow={packagesSection.subtitle || 'Packages'} title={packagesSection.title} description={packagesSection.description}>
          <div className="grid gap-5 lg:grid-cols-3">
            {cms.packages.map((item: PublicPackage) => <PackageCard key={item.name} item={item} />)}
          </div>
        </Section> : null}

        {staffSection.isVisible ? <Section eyebrow={staffSection.subtitle || 'Team'} title={staffSection.title} description={staffSection.description}>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {cms.staff.map((member: PublicStaffMember) => <StaffCard key={member.name} member={member} />)}
          </div>
        </Section> : null}

        <Section eyebrow="Why choose us" title="Simple, premium, and reliable" description="Designed around everyday salon needs.">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="grid gap-5 md:grid-cols-3 lg:grid-cols-1">
              {[
                [Sparkles, 'Premium finish', 'Clean service flow with careful grooming and beauty treatments.'],
                [Users, 'Friendly staff', 'A focused team for barbering, beauty care, and reception.'],
                [Star, 'Clear packages', 'Transparent service and package pricing before you visit.'],
              ].map(([Icon, title, description]) => (
                <div key={String(title)} className="rounded-2xl border border-[#e7ded2] bg-white p-6 shadow-sm">
                  <Icon className="h-7 w-7 text-[#9b742d]" />
                  <h3 className="mt-4 text-xl font-semibold">{String(title)}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#6d625b]">{String(description)}</p>
                </div>
              ))}
            </div>
            <div className="relative min-h-[420px] overflow-hidden rounded-3xl bg-[#171411]">
              <Image src={about.imageUrl || info.assets.about} alt="The Hair Cut outside view" fill sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover" />
            </div>
          </div>
        </Section>

        {about.isVisible ? <Section eyebrow={about.subtitle || 'About'} title={about.title} description={about.description}>
          <div className="grid gap-5 md:grid-cols-2">
            {aboutImages.map((image: string, index: number) => (
              <div key={image} className="relative min-h-[260px] overflow-hidden rounded-3xl border border-[#e7ded2] bg-white shadow-sm">
                <Image src={image} alt={index === 0 ? 'The Hair Cut banner' : 'The Hair Cut details'} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
              </div>
            ))}
          </div>
        </Section> : null}

        <section className="px-4 py-16">
          <div className="mx-auto grid max-w-7xl gap-6 rounded-3xl bg-white p-6 shadow-sm md:grid-cols-[1fr_1fr] md:p-8">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-[#8a6a52]">{contact.subtitle || 'Visit us'}</p>
              <h2 className="mt-3 text-3xl font-semibold text-[#211d1a]">{contact.title}</h2>
              <p className="mt-4 text-[#6d625b]">{info.address}</p>
              <p className="mt-2 text-[#6d625b]">{info.openingHours}</p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link href="/contact" className="inline-flex rounded-full border border-[#d7b56d] px-5 py-3 font-semibold">Contact details</Link>
                <Link href="/book-appointment" className="inline-flex rounded-full bg-[#171411] px-5 py-3 font-semibold text-white">Book now</Link>
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl bg-[#f8f3ed]">
              <iframe
                src={info.mapEmbedUrl}
                title={`${info.name} map`}
                className="h-[300px] w-full"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}
