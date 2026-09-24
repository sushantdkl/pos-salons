'use client';

/** CUSTOMER LEDGER — every customer who has used credit, and what each owes now (receivables). */

import Link from 'next/link';
import { useState } from 'react';
import { BookUser, Search } from 'lucide-react';
import {
  ErpPage, ErrorState, FinancialTable, LoadingState, MetricCard, MetricGroup, money, PageHeader, PrintButton, PrintHeader,
} from '@/components/erp';
import { useReport } from '@/components/erp/use-report';
import { formatDateTime } from '@/components/profiles';

export default function CustomerLedgerPage() {
  const [query, setQuery] = useState('');
  const { data, error, loading, reload } = useReport(`/api/customers/ledger?${new URLSearchParams({ q: query })}`);
  const customers = data?.customers || [];

  return (
    <ErpPage>
      <PrintHeader title="Customer ledger — credit due" period={new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date())} />
      <PageHeader
        icon={BookUser}
        iconTone="ledger"
        title="Customer ledger"
        subtitle="What each customer owes: credit given on bills, minus what they have paid back. Open a customer for every entry."
        actions={<PrintButton />}
      />
      <div className="space-y-4">
        {error ? <ErrorState message={error} onRetry={reload} /> : null}
        {loading && !data ? <LoadingState /> : null}
        {data ? (
          <>
            <MetricGroup columns={4}>
              <MetricCard label="Total credit due" value={money(data.totals.outstanding)} tone="outflow" emphasis />
              <MetricCard label="Customers owing" value={data.totals.withBalance} tone="cash" />
              <MetricCard label="Credit given (all time)" value={money(data.totals.creditGiven)} tone="neutral" />
              <MetricCard label="Collected (all time)" value={money(data.totals.collected)} tone="inflow" />
            </MetricGroup>
            <label className="print-hide relative block w-full sm:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or phone" aria-label="Search customers" className="h-9 w-full rounded-lg border border-stone-200 bg-white pl-8 pr-2 text-[13px]" />
            </label>
            <FinancialTable
              caption="Customer credit balances"
              rows={customers}
              empty="No customer has used credit yet."
              footer={customers.length ? (
                <tr>
                  <td className="px-3 py-2.5 text-sm" colSpan={5}>Total due</td>
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums">{money(data.totals.outstanding)}</td>
                  <td colSpan={2} />
                </tr>
              ) : null}
              columns={[
                { key: 'name', label: 'Customer', render: (row) => <Link href={`/admin/customers/${row.id}`} className="font-semibold text-stone-900 hover:underline">{row.name}</Link> },
                { key: 'phone', label: 'Phone', render: (row) => row.phone || '—' },
                { key: 'given', label: 'Credit given', align: 'right', render: (row) => money(row.creditGiven) },
                { key: 'collected', label: 'Collected', align: 'right', render: (row) => money(row.collected) },
                { key: 'reversed', label: 'Voided / written off', align: 'right', render: (row) => money(row.reversed) },
                { key: 'balance', label: 'Due now', align: 'right', render: (row) => <span className={row.balance > 0 ? 'font-bold text-rose-700' : 'text-stone-500'}>{money(row.balance)}</span> },
                { key: 'last', label: 'Last activity', render: (row) => formatDateTime(row.lastActivity) },
                { key: 'open', label: '', render: (row) => <Link href={`/admin/customers/${row.id}`} className="print-hide text-xs font-bold text-indigo-700 hover:underline">Ledger</Link> },
              ]}
            />
          </>
        ) : null}
      </div>
    </ErpPage>
  );
}
