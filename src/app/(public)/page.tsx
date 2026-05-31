import Link from 'next/link';
import { MapPin, MessageCircle, Scissors, Sparkles, Star, Users } from 'lucide-react';
import { PublicLayout } from '@/modules/public-site/components/public-layout';
import { Section } from '@/modules/public-site/components/section';
import { PackageCard, ServiceCard, StaffCard } from '@/modules/public-site/components/cards';
import { salonInfo } from '@/modules/public-site/data/salon-info';
import { popularServices } from '@/modules/public-site/data/services';
import { publicPackages } from '@/modules/public-site/data/packages';
import { publicStaff } from '@/modules/public-site/data/staff';
import { createWhatsAppLink } from '@/modules/public-site/utils/whatsapp';

export const metadata = {
  title: `${salonInfo.name} | Premium Salon and Grooming`,
  description: 'Premium salon services, barber grooming, beauty treatments, packages, and WhatsApp appointment booking.',
};

export default function HomePage() {
  return (
    <PublicLayout>
      <main>
        <section className="px-4 py-16 sm:py-20">
          <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="mb-4 inline-flex rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#8a6a52] shadow-sm">
                Premium salon care in one simple visit
              </p>
              <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-[#211d1a] sm:text-6xl">
                {salonInfo.name}
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-[#6d625b]">{salonInfo.description}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/book-appointment" className="inline-flex items-center justify-center rounded-full bg-[#211d1a] px-6 py-3 font-semibold text-white hover:bg-[#3a312b]">
                  Book Appointment
                </Link>
                <a href={createWhatsAppLink()} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full border border-[#d9cabc] bg-white px-6 py-3 font-semibold text-[#211d1a] hover:bg-[#fffaf5]">
                  <MessageCircle className="h-5 w-5" />
                  WhatsApp
                </a>
              </div>
            </div>
            <div className="min-h-[420px] rounded-[2rem] bg-[#211d1a] p-6 text-white shadow-xl">
              <div className="flex h-full min-h-[372px] flex-col justify-between rounded-[1.5rem] border border-white/15 p-6">
                <Scissors className="h-10 w-10" />
                <div>
                  <p className="text-sm uppercase tracking-wide text-white/60">Salon experience</p>
                  <h2 className="mt-3 text-3xl font-semibold">Clean cuts, polished beauty, calm service.</h2>
                  <div className="mt-6 grid gap-3 text-sm text-white/75">
                    <span>Haircuts and grooming packages</span>
                    <span>Facials and beauty treatments</span>
                    <span>WhatsApp appointment requests</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <Section eyebrow="Services" title="Popular services" description="Fast, clear pricing for daily grooming and beauty care.">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {popularServices.map((service) => <ServiceCard key={service.name} service={service} />)}
          </div>
        </Section>

        <Section eyebrow="Packages" title="Men's packages" description="Grouped services for fast booking and clean billing.">
          <div className="grid gap-5 lg:grid-cols-3">
            {publicPackages.map((item) => <PackageCard key={item.name} item={item} />)}
          </div>
        </Section>

        <Section eyebrow="Team" title="Meet the staff" description="Experienced staff for barbering, hair dressing, beauty care, and reception.">
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {publicStaff.map((member) => <StaffCard key={member.name} member={member} />)}
          </div>
        </Section>

        <Section eyebrow="Why choose us" title="Simple, premium, and reliable" description="Designed around everyday salon needs.">
          <div className="grid gap-5 md:grid-cols-3">
            {[
              [Sparkles, 'Premium finish', 'Clean service flow with careful grooming and beauty treatments.'],
              [Users, 'Friendly staff', 'A focused team for barbering, beauty care, and reception.'],
              [Star, 'Clear packages', 'Transparent service and package pricing before you visit.'],
            ].map(([Icon, title, description]) => (
              <div key={String(title)} className="rounded-2xl border border-[#e7ded2] bg-white p-6 shadow-sm">
                <Icon className="h-7 w-7 text-[#8a6a52]" />
                <h3 className="mt-4 text-xl font-semibold">{String(title)}</h3>
                <p className="mt-2 text-sm leading-6 text-[#6d625b]">{String(description)}</p>
              </div>
            ))}
          </div>
        </Section>

        <section className="px-4 py-16">
          <div className="mx-auto grid max-w-7xl gap-6 rounded-3xl bg-white p-6 shadow-sm md:grid-cols-[1fr_1fr] md:p-8">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-[#8a6a52]">Visit us</p>
              <h2 className="mt-3 text-3xl font-semibold text-[#211d1a]">Location and contact</h2>
              <p className="mt-4 text-[#6d625b]">{salonInfo.address}</p>
              <p className="mt-2 text-[#6d625b]">{salonInfo.openingHours}</p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link href="/contact" className="inline-flex rounded-full border border-[#d9cabc] px-5 py-3 font-semibold">Contact details</Link>
                <Link href="/book-appointment" className="inline-flex rounded-full bg-[#211d1a] px-5 py-3 font-semibold text-white">Book now</Link>
              </div>
            </div>
            <div className="flex min-h-[240px] items-center justify-center rounded-2xl bg-[#f8f3ed] text-center text-[#6d625b]">
              <div>
                <MapPin className="mx-auto mb-3 h-8 w-8 text-[#8a6a52]" />
                {salonInfo.mapLabel}
              </div>
            </div>
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}
