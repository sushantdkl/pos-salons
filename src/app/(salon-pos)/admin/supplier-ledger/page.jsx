'use client';

/** SUPPLIER LEDGER — what the salon owes each supplier right now (accounts payable). */

import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import {
  ErpPage, ErrorState, FinancialTable, LoadingState, MetricCard, MetricGroup, money, PageHeader, PrintButton, PrintHeader,
} from '@/components/erp';
import { useReport } from '@/components/erp/use-report';

export default function SupplierLedgerPage() {
  const { data, error, loading, reload } = useReport('/api/suppliers?all=1');
  const suppliers = (data?.suppliers || []).slice().sort((a, b) => b.balance - a.balance);

  return (
    <ErpPage>
      <PrintHeader title="Supplier ledger — amounts owed" period={new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date())} />
      <PageHeader
        icon={BookOpen}
        iconTone="ledger"
        title="Supplier ledger"
        subtitle="What you owe each supplier: opening balance plus purchases, minus payments. Open a supplier for every entry."
        actions={<PrintButton />}
      />
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {loading && !data ? <LoadingState /> : null}
      {data ? (
        <div className="space-y-4">
          <MetricGroup columns={3}>
            <MetricCard label="Total owed" value={money(data.totals.payable)} tone="outflow" emphasis />
            <MetricCard label="Suppliers owed" value={data.totals.withBalance} tone="cash" />
            <MetricCard label="Suppliers" value={suppliers.length} tone="neutral" />
          </MetricGroup>
          <FinancialTable
            caption="Amounts owed to suppliers"
            rows={suppliers}
            empty="No suppliers yet. Add them under Inventory > Suppliers."
            footer={suppliers.length ? (
              <tr>
                <td className="px-3 py-2.5 text-sm" colSpan={4}>Total</td>
                <td className="px-3 py-2.5 text-right text-sm tabular-nums">{money(data.totals.payable)}</td>
                <td />
              </tr>
            ) : null}
            columns={[
              { key: 'name', label: 'Supplier', render: (row) => <Link href={`/admin/suppliers/${row.id}`} className="font-semibold text-stone-900 hover:underline">{row.name}</Link> },
              { key: 'opening', label: 'Opening', align: 'right', render: (row) => money(row.openingBalance) },
              { key: 'purchased', label: 'Purchased', align: 'right', render: (row) => money(row.purchasedTotal) },
              { key: 'paid', label: 'Paid', align: 'right', render: (row) => money(row.paidTotal) },
              { key: 'balance', label: 'Owed now', align: 'right', render: (row) => <span className={row.balance > 0 ? 'font-bold text-rose-700' : 'text-stone-500'}>{money(row.balance)}</span> },
              { key: 'open', label: '', render: (row) => <Link href={`/admin/suppliers/${row.id}`} className="print-hide text-xs font-bold text-indigo-700 hover:underline">Ledger</Link> },
            ]}
          />
        </div>
      ) : null}
    </ErpPage>
  );
}
