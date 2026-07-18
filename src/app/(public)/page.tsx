import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { PublicLayout } from '@/modules/public-site/components/public-layout';
import { Section } from '@/modules/public-site/components/section';
import { PackageCard, ServiceCard } from '@/modules/public-site/components/cards';
import { StaffCarousel } from '@/modules/public-site/components/staff-carousel';
import { CmsImage } from '@/modules/public-site/components/cms-image';
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
  return (
    <PublicLayout info={info} isHome={true}>
      <main>
        {hero.isVisible ? (
          <section className="relative w-full h-[90vh] min-h-[600px] md:h-screen md:min-h-[750px] bg-[#12100e] overflow-hidden flex items-end">
            {/* Background Image */}
            <div className="absolute inset-0 w-full h-full">
              <CmsImage 
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
                <CmsImage
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

        {about.isVisible ? (
          <Section
            eyebrow={about.subtitle || 'About'}
            title={about.title}
            description={about.description}
          >
            <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
              <div className="relative min-h-[420px] overflow-hidden bg-[#171411] lg:min-h-[560px]">
                <CmsImage
                  src={about.imageUrl || about.metadata.galleryImages?.[0] || info.assets.about}
                  alt={`${info.name} salon`}
                  fill
                  sizes="(min-width: 1024px) 48vw, 100vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0d0b0a]/60 via-transparent to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 px-6 py-5 md:px-8 md:py-6">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d7b56d]">{info.name}</p>
                  <p className="mt-2 max-w-md font-serif text-xl font-light leading-snug text-white/90 md:text-2xl">
                    {info.tagline}
                  </p>
                </div>
              </div>

              <div>
                <ul className="divide-y divide-[#e7ded2] border-y border-[#e7ded2]">
                  {(
                    Array.isArray(about.metadata.highlights) && about.metadata.highlights.length
                      ? about.metadata.highlights
                      : ['Premium finish', 'Friendly staff', 'Clear packages']
                  )
                    .slice(0, 3)
                    .map((item: string, index: number) => (
                      <li key={item} className="flex gap-5 py-5 md:py-6">
                        <span className="shrink-0 font-serif text-2xl font-light leading-none text-[#d7b56d]/70">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <p className="font-serif text-lg font-light tracking-tight text-[#171411] md:text-xl">{item}</p>
                      </li>
                    ))}
                </ul>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Link
                    href={about.buttonLink || '/gallery'}
                    className="inline-flex items-center justify-center bg-[#171411] px-8 py-4 text-xs font-bold uppercase tracking-wider text-white transition-colors duration-300 hover:bg-[#332920]"
                  >
                    {about.buttonText || 'View gallery'}
                  </Link>
                  <Link
                    href={about.secondaryButtonLink || '/contact'}
                    className="inline-flex items-center justify-center border border-[#d7b56d] px-8 py-4 text-xs font-bold uppercase tracking-wider text-[#171411] transition-colors duration-300 hover:bg-[#f8f3ed]"
                  >
                    {about.secondaryButtonText || 'Get in touch'}
                  </Link>
                </div>
              </div>
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
