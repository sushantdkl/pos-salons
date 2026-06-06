import Link from 'next/link';
import Image from 'next/image';
import { MessageCircle, Sparkles, Star, Users } from 'lucide-react';
import { PublicLayout } from '@/modules/public-site/components/public-layout';
import { Section } from '@/modules/public-site/components/section';
import { PackageCard, ServiceCard } from '@/modules/public-site/components/cards';
import { StaffCarousel } from '@/modules/public-site/components/staff-carousel';
import { getPublicWebsiteData } from '@/modules/public-site/services/cms';
import { createWhatsAppLink } from '@/modules/public-site/utils/whatsapp';
import type { PublicPackage, PublicService } from '@/modules/public-site/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const cms = await getPublicWebsiteData();
  return cms.seo;
}

export default async function HomePage() {
  const cms = await getPublicWebsiteData();
  const { info, sections } = cms;
  const hero = sections.hero;
  const servicesSection = sections.services;
  const packagesSection = sections.packages;
  const staffSection = sections.staff;
  const about = sections.about;
  const contact = sections.contact;
  const aboutImages = about.metadata.galleryImages?.length ? about.metadata.galleryImages : [info.assets.banner, info.assets.details];
  return (
    <PublicLayout info={info} isHome={true}>
      <main>
        {hero.isVisible ? (
          <section className="relative w-full h-[90vh] min-h-[600px] md:h-screen md:min-h-[750px] bg-[#12100e] overflow-hidden flex items-end">
            {/* Background Image */}
            <div className="absolute inset-0 w-full h-full">
              <Image 
                src={hero.imageUrl || info.assets.hero} 
                alt="The Hair Cut premium salon interior" 
                fill 
                priority 
                sizes="100vw" 
                className="object-cover opacity-60 transition-all duration-1000 scale-102 hover:scale-100" 
              />
              {/* Premium dark gradient overlay to ensure readability */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#0d0b0a] via-[#0d0b0a]/50 to-[#0d0b0a]/70" />
            </div>

            {/* Content Container (Bottom-Left Positioned) */}
            <div className="relative z-10 w-full mx-auto max-w-7xl px-6 md:px-8 pb-16 md:pb-24 lg:pb-28">
              <div className="max-w-2xl text-left">
                {/* Small luxury sub-eyebrow */}
                <span className="text-xs md:text-sm font-semibold uppercase tracking-widest text-[#d7b56d] block mb-4">
                  {hero.subtitle || info.tagline}
                </span>
                
                {/* Premium Serif Heading */}
                <h1 className="text-4xl md:text-6xl lg:text-7xl font-light tracking-tight text-white leading-[1.15] font-serif">
                  {hero.title || info.name}
                </h1>
                
                {/* Minimal description */}
                <p className="mt-6 max-w-lg text-sm md:text-base text-white/70 font-light leading-relaxed">
                  {hero.description || info.description}
                </p>
                
                {/* Elegant geometric buttons */}
                <div className="mt-8 flex flex-col sm:flex-row gap-4">
                  <Link 
                    href={hero.buttonLink || '/book-appointment'} 
                    className="inline-flex items-center justify-center bg-[#d7b56d] text-[#171411] px-8 py-4 text-xs font-bold uppercase tracking-wider hover:bg-[#c39e2e] transition-all duration-300"
                  >
                    {hero.buttonText || 'Book Appointment'}
                  </Link>
                  <a 
                    href={createWhatsAppLink(undefined, info.whatsappNumber)} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="inline-flex items-center justify-center gap-2 border border-white/20 bg-white/5 backdrop-blur-sm px-8 py-4 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/10 hover:border-white/45 transition-all duration-300"
                  >
                    <MessageCircle className="h-4 w-4" />
                    {hero.secondaryButtonText || 'WhatsApp'}
                  </a>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {servicesSection.isVisible ? (
          <Section
            theme="dark"
            eyebrow={servicesSection.subtitle || 'Services'}
            title={servicesSection.title}
            description={servicesSection.description}
          >
            <div className="grid items-start gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14">
              <div className="relative min-h-[420px] overflow-hidden bg-[#3a3530] lg:min-h-[560px]">
                <Image
                  src={servicesSection.imageUrl || info.assets.services}
                  alt="Haircut service at The Hair Cut"
                  fill
                  sizes="(min-width: 1024px) 42vw, 100vw"
                  className="object-cover opacity-75"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#141210] via-[#141210]/30 to-[#2e2a26]/40" />
                <div className="absolute bottom-0 left-0 right-0 border-t border-[#d7b56d]/30 bg-[#161412]/75 px-6 py-5 backdrop-blur-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d7b56d]">Signature grooming</p>
                  <p className="mt-2 max-w-sm font-serif text-lg font-light leading-snug text-white/85">
                    Precision cuts, clean shaves, and treatments done with care.
                  </p>
                </div>
              </div>
              <div>
                <div className="border-t border-white/10">
                  {cms.popularServices.slice(0, 4).map((service: PublicService) => (
                    <ServiceCard key={service.name} service={service} variant="menu" compact />
                  ))}
                </div>
                <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
                  <Link
                    href="/services"
                    className="inline-flex items-center justify-center bg-[#d7b56d] px-8 py-4 text-xs font-bold uppercase tracking-wider text-[#171411] transition-colors duration-300 hover:bg-[#c39e2e]"
                  >
                    View full rate card
                  </Link>
                  <Link
                    href="/book-appointment"
                    className="inline-flex items-center justify-center border border-white/20 bg-white/5 px-8 py-4 text-xs font-bold uppercase tracking-wider text-white backdrop-blur-sm transition-colors duration-300 hover:border-white/45 hover:bg-white/10"
                  >
                    Book a service
                  </Link>
                </div>
              </div>
            </div>
          </Section>
        ) : null}

        {packagesSection.isVisible ? (
          <Section
            eyebrow={packagesSection.subtitle || 'Packages'}
            title={packagesSection.title}
            description={packagesSection.description}
          >
            <div className="grid gap-6 lg:grid-cols-3 lg:gap-0 lg:border lg:border-[#e7ded2]">
              {cms.packages.map((item: PublicPackage, index: number) => (
                <PackageCard
                  key={item.name}
                  item={item}
                  variant="tier"
                  featured={index === 1}
                />
              ))}
            </div>
            <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <Link
                href="/packages"
                className="inline-flex items-center justify-center border border-[#171411] bg-[#171411] px-8 py-4 text-xs font-bold uppercase tracking-wider text-white transition-colors duration-300 hover:bg-[#332920]"
              >
                Compare all packages
              </Link>
              <Link
                href="/book-appointment"
                className="inline-flex items-center justify-center border border-[#d7b56d] px-8 py-4 text-xs font-bold uppercase tracking-wider text-[#171411] transition-colors duration-300 hover:bg-[#f8f3ed]"
              >
                Book a package
              </Link>
            </div>
          </Section>
        ) : null}

        {staffSection.isVisible ? (
          <Section
            theme="dark"
            eyebrow={staffSection.subtitle || 'Team'}
            title={staffSection.title}
            description={staffSection.description}
          >
            <StaffCarousel staff={cms.staff} tone="dark" />
            <div className="mt-10">
              <Link
                href="/staff"
                className="inline-flex items-center justify-center border border-white/20 bg-white/5 px-8 py-4 text-xs font-bold uppercase tracking-wider text-white backdrop-blur-sm transition-colors duration-300 hover:border-white/45 hover:bg-white/10"
              >
                Meet the full team
              </Link>
            </div>
          </Section>
        ) : null}

        <Section
          eyebrow="Why choose us"
          title="Simple, premium, and reliable"
          description="Designed around everyday salon needs."
        >
          <div className="grid items-stretch gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
            <div className="divide-y divide-[#e7ded2] border border-[#e7ded2]">
              {[
                [Sparkles, 'Premium finish', 'Clean service flow with careful grooming and beauty treatments.'],
                [Users, 'Friendly staff', 'A focused team for barbering, beauty care, and reception.'],
                [Star, 'Clear packages', 'Transparent service and package pricing before you visit.'],
              ].map(([Icon, title, description], index) => (
                <div key={String(title)} className="flex gap-6 p-7 md:p-8">
                  <span className="shrink-0 font-serif text-3xl font-light leading-none text-[#d7b56d]/50">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <Icon className="mb-4 h-5 w-5 text-[#9b742d]" strokeWidth={1.5} />
                    <h3 className="font-serif text-xl font-light tracking-tight text-[#171411] md:text-2xl">{String(title)}</h3>
                    <p className="mt-3 max-w-md text-sm font-light leading-relaxed text-[#6d625b]">{String(description)}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="relative min-h-[440px] overflow-hidden bg-[#171411] lg:min-h-full">
              <Image
                src={about.imageUrl || info.assets.about}
                alt="The Hair Cut outside view"
                fill
                sizes="(min-width: 1024px) 42vw, 100vw"
                className="object-cover opacity-80"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0d0b0a] via-[#0d0b0a]/15 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 border-t border-[#d7b56d]/30 bg-[#0d0b0a]/80 px-6 py-5 backdrop-blur-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d7b56d]">The experience</p>
                <p className="mt-2 max-w-sm font-serif text-lg font-light leading-snug text-white/85">
                  A calm space built for consistent grooming, every visit.
                </p>
              </div>
            </div>
          </div>
        </Section>

        {about.isVisible ? (
          <Section
            theme="dark"
            eyebrow={about.subtitle || 'About'}
            title={about.title}
            description={about.description}
          >
            <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
              {aboutImages.map((image: string, index: number) => (
                <div
                  key={image}
                  className={`relative overflow-hidden bg-[#0d0b0a] ${
                    index === 0
                      ? 'min-h-[360px] lg:col-span-7 lg:min-h-[520px]'
                      : 'min-h-[280px] lg:col-span-5 lg:min-h-[520px]'
                  }`}
                >
                  <Image
                    src={image}
                    alt={index === 0 ? 'The Hair Cut banner' : 'The Hair Cut details'}
                    fill
                    sizes={index === 0 ? '(min-width: 1024px) 55vw, 100vw' : '(min-width: 1024px) 40vw, 100vw'}
                    className="object-cover opacity-80"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0d0b0a]/80 via-transparent to-transparent" />
                  {index === 0 ? (
                    <div className="absolute bottom-0 left-0 right-0 border-t border-[#d7b56d]/30 px-6 py-5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d7b56d]">{info.name}</p>
                      <p className="mt-2 max-w-lg font-serif text-lg font-light leading-snug text-white/85">{info.tagline}</p>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link
                href="/gallery"
                className="inline-flex items-center justify-center bg-[#d7b56d] px-8 py-4 text-xs font-bold uppercase tracking-wider text-[#171411] transition-colors duration-300 hover:bg-[#c39e2e]"
              >
                View gallery
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center justify-center border border-white/20 bg-white/5 px-8 py-4 text-xs font-bold uppercase tracking-wider text-white backdrop-blur-sm transition-colors duration-300 hover:border-white/45 hover:bg-white/10"
              >
                Get in touch
              </Link>
            </div>
          </Section>
        ) : null}

        <Section
          theme="dark"
          eyebrow={contact.subtitle || 'Visit us'}
          title={contact.title || 'Find us in Birendranagar'}
          description={contact.description}
          className="!border-b-0"
        >
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
            <div>
              <div className="divide-y divide-white/10 border-t border-white/10">
                <div className="py-7">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d7b56d]">Address</p>
                  <p className="mt-3 font-serif text-xl font-light leading-relaxed text-white/85 md:text-2xl">{info.address}</p>
                </div>
                <div className="py-7">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d7b56d]">Opening hours</p>
                  <p className="mt-3 font-serif text-xl font-light leading-relaxed text-white/85 md:text-2xl">{info.openingHours}</p>
                </div>
                <div className="py-7">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d7b56d]">Phone</p>
                  <p className="mt-3 font-serif text-xl font-light text-white/85 md:text-2xl">{info.phone}</p>
                </div>
              </div>
              <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center bg-[#d7b56d] px-8 py-4 text-xs font-bold uppercase tracking-wider text-[#171411] transition-colors duration-300 hover:bg-[#c39e2e]"
                >
                  Contact details
                </Link>
                <Link
                  href="/book-appointment"
                  className="inline-flex items-center justify-center border border-white/20 bg-white/5 px-8 py-4 text-xs font-bold uppercase tracking-wider text-white backdrop-blur-sm transition-colors duration-300 hover:border-white/45 hover:bg-white/10"
                >
                  Book now
                </Link>
                <a
                  href={createWhatsAppLink(undefined, info.whatsappNumber)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 border border-white/20 px-8 py-4 text-xs font-bold uppercase tracking-wider text-white transition-colors duration-300 hover:border-[#d7b56d]/60 hover:text-[#d7b56d]"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </a>
              </div>
            </div>
            <div className="border border-white/10 bg-[#0d0b0a]">
              <iframe
                src={info.mapEmbedUrl}
                title={`${info.name} map`}
                className="h-[320px] w-full md:h-[400px]"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>
        </Section>
      </main>
    </PublicLayout>
  );
}
