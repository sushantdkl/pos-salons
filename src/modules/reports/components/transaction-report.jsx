'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Download } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import { DASHBOARD_PERIOD_OPTIONS, resolveDashboardPeriod } from '@/lib/reports/dashboard-period';
import TransactionDetail, { formatTransactionDateTime as formatDateTime } from '@/modules/reports/components/transaction-detail';

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const RIGHT_ALIGNED = ['Subtotal', 'Discount', 'Cash', 'QR', 'Final Total'];

const COLUMNS = [
  'Date & Time', 'Invoice', 'Customer', 'Services / Products', 'Staff', 'Created By',
  'Payment', 'Subtotal', 'Discount', 'Cash', 'QR', 'QR Type', 'Final Total', 'Token', 'Status', '',
];

const PAGE_SIZE = 50;

export default function TransactionReport({ basePath, backPath, title }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryPeriod = resolveDashboardPeriod(searchParams.get('period'));
  const queryStart = searchParams.get('startDate') || '';
  const queryEnd = searchParams.get('endDate') || '';

  const [period, setPeriod] = useState(queryPeriod);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (queryPeriod !== period) setPeriod(queryPeriod);
  }, [queryPeriod, period]);

  // A custom period only carries its dates through to the fetch.
  const customQuery = period === 'custom' && queryStart && queryEnd
    ? `&startDate=${queryStart}&endDate=${queryEnd}`
    : '';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/reports/transactions?period=${period}${customQuery}`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not load the transaction report');
      setData(payload);
      setPage(1); // New data set: always start at the first page.
    } catch (err) {
      setError(err.message || 'Could not load the transaction report');
    } finally {
      setLoading(false);
    }
  }, [period, customQuery]);

  useEffect(() => {
    load();
  }, [load]);

  const changePeriod = (next) => {
    setPeriod(next);
    // Non-custom periods drop any lingering custom dates from the URL.
    if (next !== 'custom') router.replace(`${basePath}?period=${next}`, { scroll: false });
  };

  const transactions = data?.transactions || [];
  const totals = data?.listedTotals || {};
  const financial = data?.financial || {};
  const periodMeta = data?.period || {};

  const pageCount = Math.max(1, Math.ceil(transactions.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageTransactions = transactions.slice(pageStart, pageStart + PAGE_SIZE);

  const exportCsv = () => {
    downloadCsv(`salon-transactions-${period}-${Date.now()}.csv`, [
      ['Transaction Report', periodMeta.label || period],
      ['Date Range', periodMeta.displayRange || ''],
      [],
      COLUMNS.slice(0, -1),
      ...transactions.map((transaction) => [
        formatDateTime(transaction.transactionDate),
        transaction.billNumber,
        `${transaction.customerName}${transaction.customerPhone ? ` (${transaction.customerPhone})` : ''}`,
        transaction.items.map((item) => `${item.name} x${item.quantity}`).join('; '),
        transaction.assignedStaff.join('; '),
        transaction.createdByName,
        transaction.paymentLabel,
        transaction.subtotal.toFixed(2),
        transaction.discountAmount.toFixed(2),
        transaction.cashAmount.toFixed(2),
        transaction.qrAmount.toFixed(2),
        transaction.qrTypeLabel,
        transaction.grandTotal.toFixed(2),
        transaction.tokenNumber,
        transaction.status,
      ]),
      [],
      ['Listed totals', '', '', '', '', '', '',
        Number(totals.subtotal || 0).toFixed(2),
        Number(totals.discount || 0).toFixed(2),
        Number(totals.cash || 0).toFixed(2),
        Number(totals.qr || 0).toFixed(2),
        '',
        Number(totals.grandTotal || 0).toFixed(2)],
    ]);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <button
              type="button"
              onClick={() => router.push(backPath)}
              className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to dashboard
            </button>
            <h1 className="text-2xl font-semibold text-gray-950 sm:text-3xl">{title}</h1>
            <p className="mt-1 text-sm text-gray-600">
              {periodMeta.label || ''}{periodMeta.displayRange ? ` · ${periodMeta.displayRange}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!transactions.length}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-2">
          {/* Custom range is set from the dashboard; here the quick tabs are the standard periods. */}
          {DASHBOARD_PERIOD_OPTIONS.filter((option) => option.value !== 'custom').map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => changePeriod(option.value)}
              className={`min-h-11 rounded-lg px-4 text-sm font-semibold transition ${
                period === option.value
                  ? 'bg-gray-950 text-white'
                  : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {option.label}
            </button>
          ))}
          {period === 'custom' ? (
            <span className="inline-flex min-h-11 items-center rounded-lg bg-gray-950 px-4 text-sm font-semibold text-white">
              Custom · {periodMeta.displayRange || 'Selected range'}
            </span>
          ) : null}
        </div>

        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>
        ) : null}

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {[
            ['Gross Sales Before Discount', financial.grossSalesBeforeDiscount],
            ['Total Discounts', financial.totalDiscounts],
            ['Net Sales After Discount', financial.netSalesAfterDiscount],
            ['Gross Cash Collected', financial.grossCashCollected],
            ['Gross QR Collected', financial.grossQrCollected],
            ['Gross Total Collected', financial.grossTotalCollected],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
              <p className="mt-1.5 text-lg font-semibold text-gray-950">{formatCurrency(value)}</p>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1500px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80">
                  {COLUMNS.map((heading) => (
                    <th
                      key={heading || 'actions'}
                      className={`px-3 py-3 text-xs font-semibold uppercase tracking-wider text-gray-600 ${
                        RIGHT_ALIGNED.includes(heading) ? 'text-right' : 'text-left'
                      }`}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={COLUMNS.length} className="px-4 py-12 text-center text-sm text-gray-500">
                      Loading transactions…
                    </td>
                  </tr>
                ) : pageTransactions.length ? (
                  pageTransactions.map((transaction) => (
                    <tr key={transaction.id} className="align-top hover:bg-gray-50">
                      <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-900">{formatDateTime(transaction.transactionDate)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm font-medium text-gray-900">{transaction.billNumber}</td>
                      <td className="px-3 py-3 text-sm">
                        <div className="font-medium text-gray-900">{transaction.customerName}</div>
                        {transaction.customerPhone ? <div className="text-xs text-gray-500">{transaction.customerPhone}</div> : null}
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-700">
                        {transaction.items.length ? (
                          <div className="space-y-0.5">
                            {transaction.items.map((item, index) => (
                              <div key={`${transaction.id}-item-${index}`} className="text-xs">
                                {item.name}{item.quantity > 1 ? ` x${item.quantity}` : ''}
                              </div>
                            ))}
                          </div>
                        ) : <span className="text-xs text-gray-400">No items</span>}
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-700">
                        {transaction.assignedStaff.length ? (
                          <div className="space-y-0.5">
                            {transaction.assignedStaff.map((line, index) => (
                              <div key={`${transaction.id}-staff-${index}`} className="text-xs">{line}</div>
                            ))}
                          </div>
                        ) : <span className="text-xs text-gray-400">-</span>}
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-700">{transaction.createdByName || '-'}</td>
                      <td className="px-3 py-3 text-sm text-gray-700">{transaction.paymentLabel}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-sm text-gray-700">{formatCurrency(transaction.subtotal)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-sm text-gray-700">{formatCurrency(transaction.discountAmount)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-sm text-gray-700">{formatCurrency(transaction.cashAmount)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-sm text-gray-700">{formatCurrency(transaction.qrAmount)}</td>
                      <td className="px-3 py-3 text-sm text-gray-700">{transaction.qrTypeLabel}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-semibold text-gray-950">{formatCurrency(transaction.grandTotal)}</td>
                      <td className="px-3 py-3 text-sm text-gray-700">{transaction.tokenNumber || '-'}</td>
                      <td className="px-3 py-3 text-sm capitalize text-gray-700">{transaction.status}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm">
                        <button
                          type="button"
                          onClick={() => setSelected(transaction)}
                          className="font-semibold text-gray-950 hover:underline"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={COLUMNS.length} className="px-4 py-12 text-center text-sm text-gray-500">
                      No transactions found for {periodMeta.label || 'this period'}.
                    </td>
                  </tr>
                )}
              </tbody>
              {transactions.length ? (
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-gray-950">
                    <td className="px-3 py-3 text-sm" colSpan={7}>
                      {totals.count} transactions
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-sm">{formatCurrency(totals.subtotal)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-sm">{formatCurrency(totals.discount)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-sm">{formatCurrency(totals.cash)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-sm">{formatCurrency(totals.qr)}</td>
                    <td />
                    <td className="whitespace-nowrap px-3 py-3 text-right text-sm">{formatCurrency(totals.grandTotal)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>

          {transactions.length > PAGE_SIZE ? (
            <div className="flex flex-col items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 sm:flex-row">
              <p className="text-xs text-gray-600">
                Showing {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, transactions.length)} of {transactions.length}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={safePage <= 1}
                  className="min-h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="px-2 text-sm font-medium text-gray-700">Page {safePage} of {pageCount}</span>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                  disabled={safePage >= pageCount}
                  className="min-h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <TransactionDetail transaction={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
