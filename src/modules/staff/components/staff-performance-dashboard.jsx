'use client';

import { useEffect, useState } from 'react';
import { Award, CalendarDays, Scissors, TrendingUp, Users } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';

function MetricCard({ title, value, icon: Icon, sub }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <Icon className="mb-3 h-6 w-6 text-gray-700" />
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-950">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

export default function StaffPerformanceDashboard({ title, accent = 'text-indigo-600' }) {
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState('today');
  const [customDates, setCustomDates] = useState({ start: '', end: '' });

  useEffect(() => {
    async function load() {
      const token = localStorage.getItem('pos_token');
      let url = `/api/admin/staff-performance?period=${period}`;
      if (period === 'custom' && customDates.start && customDates.end) {
        url += `&startDate=${customDates.start}&endDate=${customDates.end}`;
      } else if (period === 'custom') {
        return;
      }
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) setData(await response.json());
    }
    load();
  }, [period, customDates.start, customDates.end]);

  const today = data?.metrics?.today || {};
  const week = data?.metrics?.week || {};
  const month = data?.metrics?.month || {};
  const summary = data?.summary || {};
  const report = data?.report || { rows: [], totals: {} };

  return (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6">
            <h1 className="text-3xl font-semibold text-gray-950">{title}</h1>
            <p className="mt-1 text-sm text-gray-600">Daily service activity, revenue, customers, and commission.</p>
          </div>

          <section className="mb-6">
            <h2 className={`mb-3 text-lg font-semibold ${accent}`}>Today</h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard title="Services Completed" value={today.servicesCompleted || 0} icon={Scissors} />
              <MetricCard title="Customers Served" value={today.customersServed || 0} icon={Users} />
              <MetricCard title="Revenue Generated" value={formatCurrency(today.revenue || 0)} icon={TrendingUp} />
              <MetricCard title="Commission Earned" value={formatCurrency(today.commission || 0)} icon={Award} />
            </div>
          </section>

          <section className="mb-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-950"><CalendarDays className="h-5 w-5" /> This Week</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <MetricCard title="Services" value={week.servicesCompleted || 0} icon={Scissors} />
                <MetricCard title="Revenue" value={formatCurrency(week.revenue || 0)} icon={TrendingUp} />
                <MetricCard title="Commission" value={formatCurrency(week.commission || 0)} icon={Award} />
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-950"><CalendarDays className="h-5 w-5" /> This Month</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <MetricCard title="Services" value={month.servicesCompleted || 0} icon={Scissors} />
                <MetricCard title="Revenue" value={formatCurrency(month.revenue || 0)} icon={TrendingUp} />
                <MetricCard title="Commission" value={formatCurrency(month.commission || 0)} icon={Award} />
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 p-5">
                <h2 className="text-lg font-semibold text-gray-950">Recent Services</h2>
              </div>
              <table className="w-full">
                <thead className="bg-gray-50 text-left text-sm text-gray-600">
                  <tr>
                    <th className="px-5 py-3">Customer</th>
                    <th className="px-5 py-3">Service</th>
                    <th className="px-5 py-3">Invoice</th>
                    <th className="px-5 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(data?.recentServices || []).map((item) => (
                    <tr key={`${item.invoice}-${item.serviceName}`}>
                      <td className="px-5 py-3 text-gray-950">{item.customerName || 'Walk-in Customer'}</td>
                      <td className="px-5 py-3 text-gray-700">{item.serviceName}</td>
                      <td className="px-5 py-3 text-gray-700">{item.invoice}</td>
                      <td className="px-5 py-3 text-gray-500">{new Date(item.date).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data?.recentServices?.length && <div className="p-8 text-center text-gray-500">No completed services yet.</div>}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-950">Performance Summary</h2>
              <div className="mt-4 space-y-3">
                <MetricCard title="Avg Services / Day" value={(summary.averageServicesPerDay || 0).toFixed(1)} icon={Scissors} />
                <MetricCard title="Avg Revenue / Day" value={formatCurrency(summary.averageRevenuePerDay || 0)} icon={TrendingUp} />
              </div>
            </div>
          </section>

          <section className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-gray-100 p-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-950">Service Report</h2>
                <p className="text-sm text-gray-500">Only your completed service items are included.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  ['today', 'Today'],
                  ['week', 'This Week'],
                  ['month', 'This Month'],
                  ['custom', 'Custom'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPeriod(value)}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold ${period === value ? 'bg-gray-950 text-white' : 'border border-gray-300 bg-white text-gray-700'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {period === 'custom' ? (
              <div className="flex flex-col gap-2 border-b border-gray-100 p-4 sm:flex-row">
                <input type="date" value={customDates.start} onChange={(event) => setCustomDates({ ...customDates, start: event.target.value })} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                <input type="date" value={customDates.end} onChange={(event) => setCustomDates({ ...customDates, end: event.target.value })} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </div>
            ) : null}
            <div className="grid gap-3 border-b border-gray-100 p-4 sm:grid-cols-4">
              <MetricCard title="Total Services" value={report.totals?.services || 0} icon={Scissors} />
              <MetricCard title="Total Revenue" value={formatCurrency(report.totals?.revenue || 0)} icon={TrendingUp} />
              <MetricCard title="Total Customers" value={report.totals?.customers || 0} icon={Users} />
              <MetricCard title="Total Commission" value={formatCurrency(report.totals?.commission || 0)} icon={Award} />
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[780px] w-full">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Invoice</th>
                    <th className="px-5 py-3">Customer</th>
                    <th className="px-5 py-3">Service</th>
                    <th className="px-5 py-3 text-right">Amount</th>
                    <th className="px-5 py-3 text-right">Commission</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {report.rows?.length ? report.rows.map((row) => (
                    <tr key={`${row.invoice}-${row.serviceName}-${row.date}`}>
                      <td className="px-5 py-3 text-sm text-gray-500">{new Date(row.date).toLocaleString()}</td>
                      <td className="px-5 py-3 text-sm text-gray-700">{row.invoice}</td>
                      <td className="px-5 py-3 text-sm text-gray-950">{row.customerName || 'Walk-in Customer'}</td>
                      <td className="px-5 py-3 text-sm text-gray-700">{row.serviceName}</td>
                      <td className="px-5 py-3 text-right text-sm font-semibold text-gray-950">{formatCurrency(row.amount || 0)}</td>
                      <td className="px-5 py-3 text-right text-sm font-semibold text-gray-950">{formatCurrency(row.commission || 0)}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-500">No services have been recorded for this staff member yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
  );
}
