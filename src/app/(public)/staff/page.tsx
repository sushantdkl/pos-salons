import Link from 'next/link';
import { PublicLayout } from '@/modules/public-site/components/public-layout';
import { PageHero } from '@/modules/public-site/components/page-hero';
import { Section } from '@/modules/public-site/components/section';
import { StaffCard } from '@/modules/public-site/components/cards';
import { getPublicWebsiteData } from '@/modules/public-site/services/cms';
import type { PublicStaffMember } from '@/modules/public-site/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const cms = await getPublicWebsiteData();
  return { title: `Staff | ${cms.info.name}`, description: cms.sections.staff.description };
}

export default async function StaffPage() {
  const cms = await getPublicWebsiteData();
  const section = cms.sections.staff;
  return (
    <PublicLayout info={cms.info}>
      <PageHero
        eyebrow={section.subtitle || 'Team'}
        title="Staff"
        description={section.description || 'A focused salon team for grooming, hair dressing, beauty care, and reception.'}
        imageUrl={section.imageUrl || cms.info.assets.about}
      />
      <Section hideHeader className="!py-10 md:!py-14">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cms.staff.map((member: PublicStaffMember) => (
            <StaffCard key={member.name} member={member} variant="profile" tone="light" />
          ))}
        </div>
        <div className="mt-10">
          <Link
            href="/book-appointment"
            className="inline-flex items-center justify-center bg-[#d7b56d] px-8 py-4 text-xs font-bold uppercase tracking-wider text-[#171411] transition-colors duration-300 hover:bg-[#c39e2e]"
          >
            Book with our team
          </Link>
        </div>
      </Section>
    </PublicLayout>
  );
}
