import { PublicLayout } from '@/modules/public-site/components/public-layout';
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
      <Section eyebrow={section.subtitle || 'Team'} title="Staff" description={section.description || 'A focused salon team for grooming, hair dressing, beauty care, and reception.'}>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {cms.staff.map((member: PublicStaffMember) => <StaffCard key={member.name} member={member} />)}
        </div>
      </Section>
    </PublicLayout>
  );
}
