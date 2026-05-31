import { PublicLayout } from '@/modules/public-site/components/public-layout';
import { Section } from '@/modules/public-site/components/section';
import { StaffCard } from '@/modules/public-site/components/cards';
import { publicStaff } from '@/modules/public-site/data/staff';

export const metadata = {
  title: 'Staff | The Haircut Salon',
  description: 'Meet the salon staff: Raashid, Salman, Saajid, and Kanchan.',
};

export default function StaffPage() {
  return (
    <PublicLayout>
      <Section eyebrow="Team" title="Staff" description="A focused salon team for grooming, hair dressing, beauty care, and reception.">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {publicStaff.map((member) => <StaffCard key={member.name} member={member} />)}
        </div>
      </Section>
    </PublicLayout>
  );
}
