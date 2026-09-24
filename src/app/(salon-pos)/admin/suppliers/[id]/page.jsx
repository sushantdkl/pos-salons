'use client';

import Link from 'next/link';
import { use } from 'react';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { ErpPage, PageHeader } from '@/components/erp';
import SupplierLedgerView from '@/components/suppliers/supplier-ledger';

/** One supplier: profile, ledger with running balance, payments and purchases (admin). */
export default function SupplierDetailPage({ params }) {
  const { id } = use(params);
  return (
    <ErpPage>
      <PageHeader
        icon={BookOpen}
        iconTone="ledger"
        title="Supplier ledger"
        subtitle="Every purchase and payment with this supplier, and what is owed now."
        actions={<Link href="/admin/supplier-ledger" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"><ArrowLeft className="h-4 w-4" /> All suppliers</Link>}
      />
      <SupplierLedgerView supplierId={id} />
    </ErpPage>
  );
}
