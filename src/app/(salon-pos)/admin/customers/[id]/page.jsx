'use client';

import Link from 'next/link';
import { use } from 'react';
import { ArrowLeft, UserRound } from 'lucide-react';
import { ErpPage, PageHeader } from '@/components/erp';
import CustomerProfileView from '@/components/customers/customer-profile';

/** One customer: profile, visits, services, credit ledger and timeline (admin + front desk). */
export default function CustomerProfilePage({ params }) {
  const { id } = use(params);
  return (
    <ErpPage>
      <PageHeader
        icon={UserRound}
        iconTone="ledger"
        title="Customer profile"
        subtitle="Visits, services, credit given and collected, with a running balance."
        actions={<Link href="/admin/customers" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"><ArrowLeft className="h-4 w-4" /> Customers</Link>}
      />
      <CustomerProfileView customerId={id} />
    </ErpPage>
  );
}
