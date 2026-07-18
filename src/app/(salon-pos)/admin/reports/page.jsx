'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Award,
  Calendar,
  Download,
  DollarSign,
  ShoppingCart,
  Target,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';

function numberValue(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return numberValue(value).toFixed(2);
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function qrTypeLabel(type) {
  return {
    ESEWA_PHONEPAY: 'Esewa / PhonePay',
    BANK: 'Bank QR',
  }[type] || '-';
}

function csvCell(value) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
  const dataBlob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const PIE_COLORS = ['#171411', '#9b742d', '#6d625b', '#d7b56d', '#b8aea3', '#3a3530'];

function PaymentPie({ slices, total }) {
  if (!slices.length || total <= 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-full border border-dashed border-gray-300 bg-gray-50 text-sm text-gray-500">
        No payment data
      </div>
    );
  }

  let cursor = 0;
  const stops = slices.map((slice, index) => {
    const start = cursor;
    const share = (slice.amount / total) * 100;
    cursor += share;
    return `${PIE_COLORS[index % PIE_COLORS.length]} ${start}% ${cursor}%`;
  });

  return (
    <div
      className="mx-auto h-40 w-40 rounded-full shadow-inner ring-4 ring-white"
      style={{ background: `conic-gradient(${stops.join(', ')})` }}
      aria-label="Payment methods pie chart"
    />
  );
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('today');
  const [customDates, setCustomDates] = useState({ start: '', end: '' });
  const [reports, setReports] = useState(null);

  const fetchReports = async () => {
    try {
      const token = localStorage.getItem('pos_token');
      let url = `/api/admin/reports?period=${period}`;

      if (period === 'custom' && customDates.start && customDates.end) {
        url += `&startDate=${customDates.start}&endDate=${customDates.end}`;
      }

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setReports(data);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [period]);

  const paymentSlices = useMemo(() => {
    const methods = reports?.paymentMethods || {};
    return Object.entries(methods)
      .map(([method, data]) => ({
        method,
        amount: numberValue(data.amount),
        count: Number(data.count || 0),
        cashAmount: numberValue(data.cashAmount),
        qrAmount: numberValue(data.qrAmount),
      }))
      .filter((slice) => slice.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [reports]);

  const paymentTotal = useMemo(
    () => paymentSlices.reduce((sum, slice) => sum + slice.amount, 0),
    [paymentSlices]
  );

  const topItems = reports?.topItems || [];
  const maxTopRevenue = numberValue(topItems[0]?.revenue) || 1;

  const exportReport = () => {
    const transactions = reports?.transactions || [];
    const paymentRows = Object.entries(reports?.paymentMethods || {});
    const rows = [
      ['Report Period', period],
      ['Exported At', new Date().toLocaleString()],
      [],
      ['Summary'],
      ['Total Sales', money(reports?.totalSales)],
      ['Total Bills', reports?.totalBills || 0],
      ['Average Bill Value', money(reports?.avgBillValue)],
      ['Unique Customers', reports?.uniqueCustomers || 0],
      [],
      ['Payment Methods'],
      ['Payment Method', 'Transaction Count', 'Amount', 'Cash Amount', 'QR Amount'],
      ...paymentRows.map(([method, data]) => [
        method,
        data.count || 0,
        money(data.amount),
        money(data.cashAmount),
        money(data.qrAmount),
      ]),
      [],
      ['Transactions'],
      ['Date', 'Invoice', 'Customer', 'Phone', 'Payment', 'Cash', 'QR', 'QR Type', 'Total'],
      ...transactions.map((transaction) => [
        formatDateTime(transaction.transactionDate),
        transaction.billNumber,
        transaction.customerName,
        transaction.customerPhone,
        transaction.paymentMethod,
        money(transaction.cashAmount),
        money(transaction.qrAmount),
        qrTypeLabel(transaction.qrType),
        money(transaction.grandTotal),
      ]),
    ];
    downloadCsv(`salon-report-${period}-${Date.now()}.csv`, rows);
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-50 p-6 text-gray-600">Loading reports...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-950 sm:text-3xl">Reports & Analytics</h1>
            <p className="mt-1 text-sm text-gray-600">Sales and performance insights</p>
          </div>
          <button
            type="button"
            onClick={exportReport}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 sm:w-auto"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {[
            ['today', 'Today'],
            ['week', 'This Week'],
            ['month', 'This Month'],
            ['custom', 'Custom Range'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setPeriod(value)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                period === value ? 'bg-gray-950 text-white' : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {period === 'custom' ? (
          <div className="mb-6 flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3 sm:flex-row sm:items-center sm:gap-3">
            <input
              type="date"
              value={customDates.start}
              onChange={(e) => setCustomDates({ ...customDates, start: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm sm:w-auto"
            />
            <span className="hidden text-sm text-gray-500 sm:inline">to</span>
            <input
              type="date"
              value={customDates.end}
              onChange={(e) => setCustomDates({ ...customDates, end: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm sm:w-auto"
            />
            <button
              type="button"
              onClick={fetchReports}
              className="rounded-lg bg-gray-950 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
            >
              Apply
            </button>
          </div>
        ) : null}

        {reports ? (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
              {[
                [DollarSign, 'green', `Rs ${money(reports.totalSales)}`, 'Total Sales Revenue'],
                [ShoppingCart, 'blue', String(reports.totalBills || 0), 'Total Bills'],
                [Target, 'amber', `Rs ${money(reports.avgBillValue)}`, 'Avg Bill Value'],
                [Users, 'gray', String(reports.uniqueCustomers || 0), 'Customers'],
              ].map(([Icon, tone, value, label]) => {
                const tones = {
                  green: 'bg-green-50 text-green-700',
                  blue: 'bg-blue-50 text-blue-700',
                  amber: 'bg-amber-50 text-amber-800',
                  gray: 'bg-gray-100 text-gray-700',
                };
                return (
                  <div key={label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
                    <div className={`mb-3 inline-flex rounded-lg p-2 ${tones[tone]}`}>
                      <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-950 sm:text-2xl">{value}</h3>
                    <p className="mt-1 text-xs text-gray-500 sm:text-sm">{label}</p>
                  </div>
                );
              })}
            </div>

            <div className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-start gap-3 border-b border-gray-100 px-4 py-4 sm:px-6">
                <div className="rounded-lg bg-gray-100 p-2">
                  <Calendar className="h-5 w-5 text-gray-700" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-950 sm:text-lg">Transactions</h2>
                  <p className="text-sm text-gray-500">Invoices in the selected period</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[720px] w-full">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/80">
                      {['Date', 'Invoice', 'Customer', 'Payment', 'Cash', 'QR', 'QR Type', 'Total'].map((heading) => (
                        <th
                          key={heading}
                          className={`px-3 py-3 text-xs font-semibold uppercase tracking-wider text-gray-600 sm:px-4 ${
                            ['Cash', 'QR', 'Total'].includes(heading) ? 'text-right' : 'text-left'
                          }`}
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(reports.transactions || []).length ? (
                      reports.transactions.map((transaction) => (
                        <tr key={transaction.id || transaction.billNumber} className="hover:bg-gray-50">
                          <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-900 sm:px-4">{formatDateTime(transaction.transactionDate)}</td>
                          <td className="px-3 py-3 text-sm text-gray-700 sm:px-4">{transaction.billNumber || '-'}</td>
                          <td className="px-3 py-3 text-sm sm:px-4">
                            <div className="font-medium text-gray-900">{transaction.customerName || 'Walk-in Customer'}</div>
                            {transaction.customerPhone ? <div className="text-xs text-gray-500">{transaction.customerPhone}</div> : null}
                          </td>
                          <td className="px-3 py-3 text-sm capitalize text-gray-700 sm:px-4">{transaction.paymentMethod || '-'}</td>
                          <td className="px-3 py-3 text-right text-sm text-gray-700 sm:px-4">Rs {money(transaction.cashAmount)}</td>
                          <td className="px-3 py-3 text-right text-sm text-gray-700 sm:px-4">Rs {money(transaction.qrAmount)}</td>
                          <td className="px-3 py-3 text-sm text-gray-700 sm:px-4">{qrTypeLabel(transaction.qrType)}</td>
                          <td className="px-3 py-3 text-right text-sm font-semibold text-gray-950 sm:px-4">Rs {money(transaction.grandTotal)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500">
                          No sales records found for this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mb-6 grid gap-6 lg:grid-cols-[280px_1fr]">
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="mb-4 text-base font-semibold text-gray-950">Payment mix</h2>
                <PaymentPie slices={paymentSlices} total={paymentTotal || numberValue(reports.totalSales)} />
                <div className="mt-5 space-y-2.5">
                  {paymentSlices.length ? (
                    paymentSlices.map((slice, index) => {
                      const pct = paymentTotal > 0 ? (slice.amount / paymentTotal) * 100 : 0;
                      return (
                        <div key={slice.method} className="flex items-center justify-between gap-3 text-sm">
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                            />
                            <span className="truncate capitalize text-gray-700">{slice.method}</span>
                          </div>
                          <span className="shrink-0 font-semibold text-gray-950">
                            {pct.toFixed(0)}% · Rs {money(slice.amount)}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-gray-500">Complete bills to see payment mix.</p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex items-center gap-2">
                  <Award className="h-5 w-5 text-gray-700" />
                  <h2 className="text-base font-semibold text-gray-950">Top services</h2>
                </div>

                {topItems.length ? (
                  <div className="space-y-4">
                    {topItems.slice(0, 6).map((item, index) => {
                      const revenue = numberValue(item.revenue);
                      const pct = (revenue / maxTopRevenue) * 100;
                      const rankStyles = [
                        'bg-[#171411] text-white',
                        'bg-[#9b742d] text-white',
                        'bg-[#6d625b] text-white',
                      ];
                      return (
                        <div key={`${item.name}-${index}`} className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 sm:p-4">
                          <div className="mb-2 flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${rankStyles[index] || 'bg-white text-gray-700 border border-gray-200'}`}>
                                {index + 1}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-gray-950">{item.name}</p>
                                <p className="text-xs text-gray-500">{item.quantity} sold</p>
                              </div>
                            </div>
                            <p className="shrink-0 text-sm font-bold text-gray-950">Rs {money(revenue)}</p>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-white">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[#171411] to-[#9b742d] transition-all duration-700"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}

                    <div className="grid grid-cols-1 gap-3 border-t border-gray-100 pt-4 sm:grid-cols-3">
                      <div className="rounded-lg bg-[#171411] p-4 text-white">
                        <div className="mb-2 flex items-center gap-2 text-white/70">
                          <Zap className="h-4 w-4" />
                          <span className="text-xs font-semibold uppercase tracking-wide">Best seller</span>
                        </div>
                        <p className="font-semibold">{topItems[0]?.name || '—'}</p>
                        <p className="mt-1 text-xs text-white/60">{topItems[0]?.quantity || 0} units</p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-white p-4">
                        <div className="mb-2 flex items-center gap-2 text-gray-500">
                          <TrendingUp className="h-4 w-4" />
                          <span className="text-xs font-semibold uppercase tracking-wide">Top revenue</span>
                        </div>
                        <p className="font-semibold text-gray-950">Rs {money(topItems[0]?.revenue)}</p>
                        <p className="mt-1 text-xs text-gray-500">From best seller</p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-white p-4">
                        <div className="mb-2 flex items-center gap-2 text-gray-500">
                          <Award className="h-4 w-4" />
                          <span className="text-xs font-semibold uppercase tracking-wide">In list</span>
                        </div>
                        <p className="font-semibold text-gray-950">{topItems.length}</p>
                        <p className="mt-1 text-xs text-gray-500">Services ranked</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="py-8 text-center text-sm text-gray-500">No service sales yet for this period.</p>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center text-gray-500">
            Could not load reports.
          </div>
        )}
      </div>
    </div>
  );
}
