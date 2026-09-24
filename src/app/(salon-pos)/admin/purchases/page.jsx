'use client';

/** PURCHASES — stock received from suppliers in the chosen period (admin). */

import Link from 'next/link';
import { useState } from 'react';
import { PackagePlus } from 'lucide-react';
import {
  ErpPage, ErrorState, FinancialTable, LoadingState, MetricCard, MetricGroup, money, PageHeader, PeriodFilter, StatusBadge,
} from '@/components/erp';
import { usePeriod, useReport } from '@/components/erp/use-report';
import PurchaseDrawer from '@/components/suppliers/purchase-drawer';

export default function PurchasesPage() {
  const period = usePeriod('month');
  const { data, error, loading, reload } = useReport(`/api/purchases?${period.query}`, { enabled: period.ready });
  const [openId, setOpenId] = useState(null);

  return (
    <ErpPage>
      <PageHeader
        icon={PackagePlus}
        iconTone="ops"
        title="Purchases"
        subtitle="Products received from suppliers. Each purchase adds stock and increases what you owe that supplier."
        actions={<Link href="/admin/purchases/new" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-900 bg-stone-900 px-3.5 text-sm font-semibold text-white hover:bg-stone-800"><PackagePlus className="h-4 w-4" /> Record purchase</Link>}
      />
      <div className="space-y-4">
        <PeriodFilter {...period.filterProps} />
        {error ? <ErrorState message={error} onRetry={reload} /> : null}
        {loading && !data ? <LoadingState /> : null}
        {data ? (
          <>
            <MetricGroup columns={2}>
              <MetricCard label="Purchases received" value={data.totals.count} tone="neutral" />
              <MetricCard label="Value received" value={money(data.totals.value)} tone="ops" emphasis />
            </MetricGroup>
            <FinancialTable
              caption="Purchases"
              rows={data.purchases}
              empty="No purchases in this period."
              onRowClick={(row) => setOpenId(row.id)}
              columns={[
                { key: 'date', label: 'Date', render: (row) => row.date },
                { key: 'number', label: 'No.', render: (row) => <button type="button" className="font-semibold text-indigo-700 hover:underline" onClick={(event) => { event.stopPropagation(); setOpenId(row.id); }}>{row.number}</button> },
                { key: 'supplier', label: 'Supplier', render: (row) => <Link href={`/admin/suppliers/${row.supplierId}`} onClick={(event) => event.stopPropagation()} className="hover:underline">{row.supplierName}</Link> },
                { key: 'invoice', label: 'Invoice', render: (row) => row.supplierInvoice || '—' },
                { key: 'lines', label: 'Lines', align: 'right', render: (row) => row.lines },
                { key: 'total', label: 'Total', align: 'right', render: (row) => <span className={row.status === 'VOID' ? 'text-stone-400 line-through' : 'font-semibold'}>{money(row.total)}</span> },
                { key: 'status', label: '', render: (row) => (row.status === 'VOID' ? <StatusBadge status="CANCELLED" label="Void" /> : null) },
              ]}
            />
          </>
        ) : null}
      </div>
      {openId ? <PurchaseDrawer id={openId} onClose={() => setOpenId(null)} onVoided={() => { setOpenId(null); reload(); }} /> : null}
    </ErpPage>
  );
}
