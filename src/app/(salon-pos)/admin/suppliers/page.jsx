'use client';

/** SUPPLIERS — who the salon buys products from, and what is owed to each (admin). */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Plus, Search, Truck } from 'lucide-react';
import SupplierForm from '@/components/suppliers/supplier-form';
import {
  ErpButton, ErpPage, ErrorState, FinancialTable, LoadingState, MetricCard, MetricGroup, money, PageHeader, StatusBadge,
} from '@/components/erp';
import { erpFetch } from '@/components/erp/use-report';

export default function SuppliersPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await erpFetch(`/api/suppliers?${new URLSearchParams({ q: query, all: showInactive ? '1' : '0' })}`));
      setError('');
    } catch (loadError) { setError(loadError.message); }
  }, [query, showInactive]);
  useEffect(() => { load(); }, [load]);

  return (
    <ErpPage>
      <PageHeader
        icon={Truck}
        iconTone="ops"
        title="Suppliers"
        subtitle="The businesses you buy products from, and what you owe each of them."
        actions={(
          <>
            <Link href="/admin/purchases/new" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3.5 text-sm font-semibold text-stone-700 hover:bg-stone-50">Record purchase</Link>
            <ErpButton variant="primary" icon={Plus} onClick={() => setEditing({})}>New supplier</ErpButton>
          </>
        )}
      />
      <div className="space-y-4">
        {error ? <ErrorState message={error} onRetry={load} /> : null}
        {!data && !error ? <LoadingState /> : null}
        {data ? (
          <>
            <MetricGroup columns={3}>
              <MetricCard label="Suppliers" value={data.totals.suppliers} tone="neutral" />
              <MetricCard label="Total owed to suppliers" value={money(data.totals.payable)} tone="outflow" emphasis />
              <MetricCard label="Suppliers with a balance" value={data.totals.withBalance} tone="cash" />
            </MetricGroup>
            <div className="flex flex-wrap items-center gap-3">
              <label className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" aria-hidden="true" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, phone, contact" aria-label="Search suppliers" className="h-9 w-60 rounded-lg border border-stone-200 bg-white pl-8 pr-2 text-[13px]" />
              </label>
              <label className="flex items-center gap-2 text-xs text-stone-600"><input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} /> Show inactive</label>
            </div>
            <FinancialTable
              caption="Suppliers"
              rows={data.suppliers}
              empty="No suppliers yet. Add the businesses you buy products from."
              columns={[
                { key: 'name', label: 'Supplier', render: (row) => <Link href={`/admin/suppliers/${row.id}`} className="font-semibold text-stone-900 hover:underline">{row.name}</Link> },
                { key: 'contact', label: 'Contact', render: (row) => [row.contactPerson, row.phone].filter(Boolean).join(' · ') || '—' },
                { key: 'last', label: 'Last purchase', render: (row) => row.lastPurchaseDate || '—' },
                { key: 'purchased', label: 'Purchased', align: 'right', render: (row) => money(row.purchasedTotal) },
                { key: 'paid', label: 'Paid', align: 'right', render: (row) => money(row.paidTotal) },
                { key: 'balance', label: 'Owed now', align: 'right', render: (row) => <span className={row.balance > 0 ? 'font-bold text-rose-700' : 'text-stone-500'}>{money(row.balance)}</span> },
                { key: 'status', label: '', render: (row) => (row.isActive ? null : <StatusBadge status="CLOSED" label="Inactive" />) },
                { key: 'edit', label: '', render: (row) => <button type="button" onClick={() => setEditing(row)} className="text-xs font-bold text-indigo-700 hover:underline">Edit</button> },
              ]}
            />
          </>
        ) : null}
      </div>
      {editing ? <SupplierForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} /> : null}
    </ErpPage>
  );
}
