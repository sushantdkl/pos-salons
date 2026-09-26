import AdminLayout from '@/components/layout/dashboard-layout';

// Internal salon ERP (admin, cashier, store, appointments, attendance): never indexed.
// Access is enforced by login + role checks (dashboard layout and every API), not by this tag.
export const metadata = {
  title: 'Salon ERP',
  robots: { index: false, follow: false },
};

export default function SalonPosLayout({ children }) {
  return <AdminLayout>{children}</AdminLayout>;
}
