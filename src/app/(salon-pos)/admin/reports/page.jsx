'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, GitCompareArrows, Lightbulb, PieChart } from 'lucide-react';
import { BillDetailDrawer, BillLink } from '@/components/bills/bill-detail';
import {
  AlertBanner, BreakdownCard, ChartCard, count, ErpPage, ErrorState, FinancialTable, LoadingState, money, PageHeader,
  PeriodFilter, PrintButton, PrintHeader, SectionHeading, StatusBadge, TONES,
} from '@/components/erp';
import { DonutChart } from '@/components/erp/charts';
import { usePeriod, useReport } from '@/components/erp/use-report';
import { ExportButtons } from '@/components/exports/export-buttons';
import { KpiCard } from '@/components/reports/kpi-card';
import FinancialSummary from '@/modules/reports/components/financial-summary';

const PERIOD_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7days', label: 'Last 7 days' },
  { value: '30days', label: 'Last 30 days' },
  { value: 'month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'custom', label: 'Custom range' },
];

const METHOD_TONES = { cash: 'cash', online: 'online', credit: 'ledger', split: 'ops' };
const methodLabel = (method) => ({ cash: 'Cash', online: 'Online / QR', credit: 'Credit', split: 'Split' }[method] || String(method || '—'));

function shiftDate(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function daysBetween(start, end) {
  return Math.round((new Date(`${end}T12:00:00Z`) - new Date(`${start}T12:00:00Z`)) / 86400000) + 1;
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-GB', { timeZone: 'Asia/Kathmandu', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const TRANSACTION_COLUMNS = [
  { key: 'date', label: 'Date & time', render: (row) => <span className="tabular-nums">{formatDateTime(row.transactionDate)}</span> },
  { key: 'bill', label: 'Bill', render: (row) => <BillLink billId={row.id} number={row.billNumber} /> },
  {
    key: 'customer', label: 'Customer',
    render: (row) => (
      <div className="leading-tight">
        <p className="font-medium text-stone-900">{row.customerName || 'Walk-in Customer'}</p>
        {row.customerPhone ? <p className="text-xs text-stone-400">{row.customerPhone}</p> : null}
      </div>
    ),
  },
  {
    key: 'services', label: 'Services / staff',
    render: (row) => {
      const lines = row.assignedStaff || [];
      if (!lines.length) return <span className="text-stone-300">—</span>;
      return <span className="block max-w-[230px] truncate text-xs text-stone-600" title={lines.join(' · ')}>{lines[0]}{lines.length > 1 ? <span className="ml-1 font-semibold text-stone-400">+{lines.length - 1} more</span> : null}</span>;
    },
  },
  { key: 'payment', label: 'Payment', render: (row) => <StatusBadge label={methodLabel(row.paymentMethod)} tone={METHOD_TONES[row.paymentMethod] || 'neutral'} /> },
  { key: 'discount', label: 'Discount', align: 'right', className: 'text-rose-700', render: (row) => (Number(row.discountAmount) ? money(row.discountAmount) : <span className="text-stone-300">—</span>) },
  { key: 'cash', label: 'Cash', align: 'right', className: 'text-amber-700', render: (row) => (Number(row.cashAmount) ? money(row.cashAmount) : <span className="text-stone-300">—</span>) },
  { key: 'qr', label: 'Online', align: 'right', className: 'text-sky-700', render: (row) => (Number(row.qrAmount) ? money(row.qrAmount) : <span className="text-stone-300">—</span>) },
  { key: 'total', label: 'Bill total', align: 'right', className: 'font-bold text-stone-900', render: (row) => money(row.grandTotal) },
];

function exportSheets(reports) {
  const f = reports.financial || {};
  const summary = [
    ['Gross sales before discount', f.grossSalesBeforeDiscount, 'inflow'],
    ['Total discounts', f.totalDiscounts, 'outflow'],
    ['Net sales after discount', f.netSalesAfterDiscount, 'inflow'],
    ['Cash collected', f.grossCashCollected, 'cash'],
    ['Online / QR collected', f.grossQrCollected, 'online'],
    ['Total collected', f.grossTotalCollected, 'inflow'],
    ['Operating expenses', f.operatingExpenses, 'outflow'],
    ['Salary expenses', f.salaryExpenses, 'outflow'],
    ['Savings transfers', f.savingsTransfers, 'outflow'],
    ['Net cash collections', f.netCashInHand, 'cash'],
    ['Net online balance', f.netOnlineBalance, 'online'],
    ['Net available balance', f.netAvailableBalance, 'ledger'],
    ['Staff commission', reports.commissionSummary, 'hrm'],
  ].map(([label, value, tone]) => ({ label, value: Number(value || 0), tone }));
  const counts = [
    { label: 'Average bill value', value: Number(Number(reports.avgBillValue || 0).toFixed(2)) },
    { label: 'Bills', count: reports.totalBills }, { label: 'Customers served', count: reports.uniqueCustomers },
  ];
  return [
    {
      name: 'Summary',
      columns: [{ header: 'Measure', key: 'label', bold: true, width: 32 }, { header: 'Amount', key: 'value', type: 'money', tone: 'ledger' }, { header: 'Count', key: 'count', type: 'number', tone: 'ops' }],
      rows: [...summary, ...counts],
      note: 'Figures are calculated by the server with the same rules as the dashboards.',
    },
    {
      name: 'Payment methods',
      columns: [
        { header: 'Method', key: 'method', type: 'status' }, { header: 'Bills', key: 'count', type: 'number', tone: 'ledger' },
        { header: 'Amount', key: 'amount', type: 'money', tone: 'inflow' }, { header: 'Cash part', key: 'cashAmount', type: 'money', tone: 'cash' },
        { header: 'Online part', key: 'qrAmount', type: 'money', tone: 'online' },
      ],
      rows: Object.entries(reports.paymentMethods || {}).map(([method, data]) => ({ method: methodLabel(method), ...data })),
    },
    {
      name: 'Bills',
      columns: [
        { header: 'Date & time', key: 'date', value: (row) => formatDateTime(row.transactionDate) },
        { header: 'Bill', key: 'billNumber', bold: true, tone: 'ledger' },
        { header: 'Customer', key: 'customerName' }, { header: 'Phone', key: 'customerPhone' },
        { header: 'Services / staff', key: 'staff', value: (row) => (row.assignedStaff || []).join('; ') },
        { header: 'Created by', key: 'createdByName' },
        { header: 'Payment', key: 'paymentMethod', type: 'status', value: (row) => methodLabel(row.paymentMethod) },
        { header: 'Subtotal', key: 'subtotal', type: 'money', tone: 'neutral' },
        { header: 'Discount', key: 'discountAmount', type: 'money', tone: 'outflow' },
        { header: 'Cash', key: 'cashAmount', type: 'money', tone: 'cash' },
        { header: 'Online', key: 'qrAmount', type: 'money', tone: 'online' },
        { header: 'Bill total', key: 'grandTotal', type: 'money', tone: 'inflow', bold: true },
        { header: 'Token', key: 'tokenNumber' },
        { header: 'Status', key: 'status', type: 'status' },
      ],
      rows: reports.transactions || [],
      totals: ['subtotal', 'discountAmount', 'cashAmount', 'qrAmount', 'grandTotal'].reduce((totals, key) => ({ ...totals, [key]: Number((reports.transactions || []).reduce((sum, row) => sum + Number(row[key] || 0), 0).toFixed(2)) }), { date: 'Total' }),
    },
    {
      name: 'Top services',
      columns: [{ header: 'Service', key: 'name', bold: true }, { header: 'Times done', key: 'quantity', type: 'number', tone: 'ops' }, { header: 'Revenue', key: 'revenue', type: 'money', tone: 'inflow' }],
      rows: reports.topServices || [],
    },
    {
      name: 'Staff',
      columns: [{ header: 'Staff', key: 'name', bold: true }, { header: 'Services', key: 'services', type: 'number', tone: 'ops' }, { header: 'Revenue', key: 'revenue', type: 'money', tone: 'inflow' }, { header: 'Commission', key: 'commission', type: 'money', tone: 'hrm' }],
      rows: reports.bestStaff || [],
    },
    {
      name: 'Products',
      columns: [{ header: 'Product', key: 'name', bold: true }, { header: 'Units', key: 'quantity', type: 'number', tone: 'ops' }, { header: 'Revenue', key: 'revenue', type: 'money', tone: 'inflow' }],
      rows: reports.productSales || [],
    },
  ];
}

export default function ReportsPage() {
  const period = usePeriod('today');
  const [openBill, setOpenBill] = useState(null);
  const { data: reports, error, loading, reload } = useReport(period.ready ? `/api/admin/reports?${period.query}` : null);

  // The equal-length period just before this one, for the comparison on the KPI cards.
  const range = reports?.period;
  const days = range?.startDate && range?.endDate ? daysBetween(range.startDate, range.endDate) : 0;
  const previousUrl = days ? `/api/admin/reports?period=custom&startDate=${shiftDate(range.startDate, -days)}&endDate=${shiftDate(range.startDate, -1)}` : null;
  const { data: previous } = useReport(previousUrl, { enabled: Boolean(previousUrl) });
  const compareLabel = days === 1 ? 'vs previous day' : `vs previous ${days} days`;
  const periodText = range ? `${range.label}${range.displayRange ? ` · ${range.displayRange}` : ''}` : '';

  const paymentRows = Object.entries(reports?.paymentMethods || {}).map(([method, data]) => ({
    label: methodLabel(method), value: Number(data.amount || 0), color: TONES[METHOD_TONES[method] || 'neutral'].hex,
  }));
  const transactions = reports?.transactions || [];

  return (
    <ErpPage>
      <PrintHeader title="Business Overview" period={periodText} />
      <PageHeader
        icon={PieChart}
        iconTone="ledger"
        title="Business Overview"
        subtitle="Sales, collections, outflows and what sold — for the period you choose."
        meta={periodText ? <span>{periodText}</span> : null}
        actions={(
          <>
            <Link href="/admin/reports/compare" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"><GitCompareArrows className="h-4 w-4" />Compare</Link>
            <ExportButtons
              filename={`Business overview ${range?.startDate || ''} to ${range?.endDate || ''}`}
              title="Business Overview"
              subtitle={periodText}
              getSheets={async () => exportSheets(reports)}
              disabled={!reports}
            />
            <PrintButton />
          </>
        )}
      />

      <PeriodFilter {...period.filterProps} options={PERIOD_OPTIONS} className="mb-5" />

      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {loading && !reports ? <LoadingState label="Loading the overview…" /> : null}

      {reports ? (
        <div className={`space-y-6 ${loading ? 'opacity-60 transition-opacity' : ''}`}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Net sales" value={reports.totalSales} format={money} tone="inflow" emphasis previous={previous?.totalSales} compareLabel={compareLabel} />
            <KpiCard label="Bills" value={reports.totalBills} format={count} tone="ledger" previous={previous?.totalBills} compareLabel={compareLabel} />
            <KpiCard label="Average bill" value={reports.avgBillValue} format={money} tone="ops" previous={previous?.avgBillValue} compareLabel={compareLabel} />
            <KpiCard label="Customers served" value={reports.uniqueCustomers} format={count} tone="crm" previous={previous?.uniqueCustomers} compareLabel={compareLabel} />
          </div>

          <FinancialSummary financial={reports.financial} className="mb-0!" />

          {reports.lowStockProducts?.length ? (
            <AlertBanner tone="cash" title={`${reports.lowStockProducts.length} product${reports.lowStockProducts.length === 1 ? '' : 's'} at or below the low-stock level`} action={<Link href="/admin/stock" className="text-sm font-semibold underline">Open stock</Link>}>
              {reports.lowStockProducts.map((product) => `${product.name} (${product.current_stock} left)`).join(' · ')}
            </AlertBanner>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard title="Payment mix" note="How this period's bills were settled" height={300} empty={!paymentRows.some((row) => row.value > 0)} emptyMessage="No bills in this period.">
              <DonutChart rows={paymentRows} centerLabel="Billed" stacked />
            </ChartCard>
            <BreakdownCard title="Top services" note="By revenue" tone="ops" limit={6} rows={(reports.topServices || []).map((row) => ({ label: row.name, value: row.revenue, sub: `${count(row.quantity)} times` }))} empty="No services sold in this period." />
            <BreakdownCard title="Staff performance" note="Service revenue · commission" tone="hrm" limit={6} rows={(reports.bestStaff || []).map((row) => ({ label: row.name, value: row.revenue, sub: `${count(row.services)} services · ${money(row.commission)} commission` }))} empty="No staff sales in this period." />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <BreakdownCard title="Retail products" note="By revenue" tone="inflow" limit={5} rows={(reports.productSales || []).map((row) => ({ label: row.name, value: row.revenue, sub: `${count(row.quantity)} sold` }))} empty="No products sold in this period." />
            <section className="rounded-xl border border-stone-200 bg-white lg:col-span-2">
              <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-2.5">
                <Lightbulb className="h-4 w-4 text-amber-500" aria-hidden="true" />
                <h3 className="text-[12.5px] font-bold uppercase tracking-[0.05em] text-stone-800">Highlights</h3>
              </div>
              <ul className="divide-y divide-stone-100 text-sm text-stone-700">
                {(reports.insights || []).map((insight) => <li key={insight} className="px-4 py-2.5">{insight}</li>)}
                {!(reports.insights || []).length ? <li className="px-4 py-6 text-center text-stone-400">Nothing to highlight for this period yet.</li> : null}
              </ul>
            </section>
          </div>

          <section>
            <SectionHeading
              title={`Bills in this period (${count(transactions.length)})`}
              note="Click a bill number to see the full bill."
              action={<Link href={`/admin/reports/transactions?period=${period.period === 'custom' ? 'today' : period.period}`} className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-700 hover:underline">All transactions<ArrowRight className="h-4 w-4" /></Link>}
            />
            <FinancialTable columns={TRANSACTION_COLUMNS} rows={transactions.slice(0, 15)} onRowClick={(row) => setOpenBill(row.id)} rowKey={(row) => row.id || row.billNumber} empty="No bills in this period." caption="Bills in this period" />
            {transactions.length > 15 ? <p className="mt-2 text-xs text-stone-500">Showing the latest 15 of {count(transactions.length)} bills — the Excel export has all of them.</p> : null}
          </section>
        </div>
      ) : null}
      {openBill ? <BillDetailDrawer billId={openBill} onClose={() => setOpenBill(null)} /> : null}
    </ErpPage>
  );
}
