'use client';

import { fmtDate, fmtDayNumber } from '@/lib/dates/display';
import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Award,
  Banknote,
  BarChart3,
  ChevronRight,
  Clock,
  Scissors,
  Smartphone,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { formatCurrency } from '@/lib/currency';

const periodLabels = {
  today: 'Today',
  week: 'This Week',
  month: 'This Month',
  lifetime: 'Lifetime',
};

const roleLabels = {
  barber: 'Barber',
  stylist: 'Stylist',
  beautician: 'Beautician',
};

function numberValue(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateTime(value) {
  if (!value) return 'No services yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function MetricCard({ title, value, helper, icon: Icon, tone = 'gray' }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-700',
    green: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-800',
    blue: 'bg-blue-100 text-blue-700',
    pink: 'bg-pink-100 text-pink-700',
  };
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg ${tones[tone] || tones.gray}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-950">{value}</p>
      {helper ? <p className="mt-1 text-xs text-gray-500">{helper}</p> : null}
    </div>
  );
}

function Highlight({ title, staff, metric, icon: Icon }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-gray-100 p-2 text-gray-700">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
          <p className="mt-1 truncate text-base font-semibold text-gray-950">{staff?.name || 'No data'}</p>
          <p className="text-sm text-gray-600">{metric || roleLabels[staff?.role] || ''}</p>
        </div>
      </div>
    </div>
  );
}

function SmallBar({ value, max }) {
  const width = max > 0 ? Math.max(4, Math.round((numberValue(value) / max) * 100)) : 0;
  return (
    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
      <div className="h-full rounded-full bg-gray-950" style={{ width: `${width}%` }} />
    </div>
  );
}

function StaffDetail({ staff, selectedPeriod, maxRevenue }) {
  const metric = staff.metrics?.[selectedPeriod] || {};
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-950">{staff.name}</h3>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold capitalize text-gray-700">{roleLabels[staff.role] || staff.role}</span>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">{staff.commissionPercentage}% commission</span>
          </div>
          <p className="mt-1 text-sm text-gray-500">Last service: {dateTime(staff.lastServiceAt)}</p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Performance Score</p>
          <p className="text-2xl font-semibold text-gray-950">{staff.performanceScore || 0}</p>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-500">Services</p><p className="font-semibold text-gray-950">{metric.servicesCompleted || 0}</p></div>
        <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-500">Customers</p><p className="font-semibold text-gray-950">{metric.customersServed || 0}</p></div>
        <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-500">Revenue</p><p className="font-semibold text-gray-950">{formatCurrency(metric.revenue || 0)}</p></div>
        <div className="rounded-lg bg-emerald-50 p-3"><p className="text-xs text-emerald-700">Cash Collected</p><p className="font-semibold text-emerald-900">{formatCurrency(metric.cashCollected || 0)}</p></div>
        <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-500">QR Collected</p><p className="font-semibold text-gray-950">{formatCurrency(metric.qrCollected || 0)}</p></div>
        <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-500">Commission</p><p className="font-semibold text-gray-950">{formatCurrency(metric.commission || 0)}</p></div>
      </div>

      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
          <span>Revenue contribution this month</span>
          <span>{staff.monthRevenueShare || 0}%</span>
        </div>
        <SmallBar value={staff.metrics?.month?.revenue || 0} max={maxRevenue} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-950"><Scissors className="h-4 w-4" /> Top Services This Month</h4>
          <div className="space-y-2">
            {staff.topServices?.length ? staff.topServices.map((service) => (
              <div key={`${staff.id}-${service.name}`} className="rounded-lg border border-gray-100 bg-gray-50/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-gray-950">{service.name}</p>
                  <p className="text-sm font-semibold text-gray-950">{formatCurrency(service.revenue)}</p>
                </div>
                <p className="text-xs text-gray-500">{service.count} completed</p>
              </div>
            )) : <p className="rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-500">No service mix yet for this month.</p>}
          </div>
        </div>
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-950"><Clock className="h-4 w-4" /> Recent Services</h4>
          <div className="space-y-2">
            {staff.recentServices?.length ? staff.recentServices.map((service, index) => (
              <div key={service.itemId || `${staff.id}-${service.invoice}-${service.serviceName}-${service.date}-${index}`} className="rounded-lg border border-gray-100 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-950">{service.serviceName}</p>
                    <p className="text-xs text-gray-500">{service.customerName || 'Walk-in Customer'} - {service.invoice}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-gray-950">{formatCurrency(service.amount)}</p>
                </div>
              </div>
            )) : <p className="rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-500">No recent completed services.</p>}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 border-t border-gray-100 pt-4 sm:grid-cols-3">
        <div className="text-sm"><span className="text-gray-500">Avg service value:</span> <span className="font-semibold text-gray-950">{formatCurrency(staff.averages?.serviceValue || 0)}</span></div>
        <div className="text-sm"><span className="text-gray-500">Services / active day:</span> <span className="font-semibold text-gray-950">{numberValue(staff.averages?.servicesPerActiveDay).toFixed(1)}</span></div>
        <div className="text-sm"><span className="text-gray-500">Revenue / active day:</span> <span className="font-semibold text-gray-950">{formatCurrency(staff.averages?.revenuePerActiveDay || 0)}</span></div>
      </div>
    </div>
  );
}

export default function AdminStaffPerformancePage() {
  const [data, setData] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [selectedRole, setSelectedRole] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const token = localStorage.getItem('pos_token');
        const response = await fetch('/api/admin/staff-performance?scope=admin', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not load staff performance');
        setData(payload);
      } catch (err) {
        setError(err.message || 'Could not load staff performance');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const details = useMemo(() => {
    const rows = data?.staffDetails || [];
    const filtered = selectedRole === 'all' ? rows : rows.filter((staff) => staff.role === selectedRole);
    return [...filtered].sort((a, b) => numberValue(b.metrics?.[selectedPeriod]?.revenue) - numberValue(a.metrics?.[selectedPeriod]?.revenue));
  }, [data, selectedPeriod, selectedRole]);

  const maxRevenue = Math.max(...(data?.staffDetails || []).map((staff) => numberValue(staff.metrics?.month?.revenue)), 0);
  const totals = data?.totals?.[selectedPeriod] || {};
  const highlights = data?.highlights || {};
  const trendMax = Math.max(...(data?.trend || []).map((row) => numberValue(row.revenue)), 0);

  if (loading) {
    return <div className="min-h-screen bg-gray-50 p-6 text-gray-600">Loading staff performance...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-950 sm:text-3xl">Staff Performance Report</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-600">
              Clear owner-level view of every barber, stylist, and beautician: services completed, revenue, customers, commission, service mix, recent work, and trends.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(periodLabels).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setSelectedPeriod(value)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${selectedPeriod === value ? 'bg-gray-950 text-white' : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {error ? <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard title={`${periodLabels[selectedPeriod]} Revenue`} value={formatCurrency(totals.revenue || 0)} helper="Service revenue only" icon={TrendingUp} tone="green" />
          <MetricCard title="Cash Collected" value={formatCurrency(totals.cashCollected || 0)} helper="Cash collected from staff services" icon={Banknote} tone="green" />
          <MetricCard title="QR Collected" value={formatCurrency(totals.qrCollected || 0)} helper="Online / QR from staff services" icon={Smartphone} tone="blue" />
          <MetricCard title="Services Completed" value={totals.servicesCompleted || 0} helper="Paid service lines" icon={Scissors} tone="blue" />
          <MetricCard title="Commission Earned" value={formatCurrency(totals.commission || 0)} helper="Calculated from bill items" icon={Award} tone="amber" />
          <MetricCard title="Customers Served" value={totals.customersServed || 0} helper="Unique billed customers" icon={Users} tone="pink" />
        </div>

        <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Highlight title="Top Revenue" staff={highlights.topRevenueGenerator} metric={formatCurrency(highlights.topRevenueGenerator?.revenue || 0)} icon={TrendingUp} />
          <Highlight title="Top Commission" staff={highlights.topCommissionEarner} metric={formatCurrency(highlights.topCommissionEarner?.commission || 0)} icon={Award} />
          <Highlight title="Most Services" staff={highlights.mostServicesCompleted} metric={`${highlights.mostServicesCompleted?.servicesCompleted || 0} services`} icon={Scissors} />
          <Highlight title="Most Customers" staff={highlights.mostCustomersServed} metric={`${highlights.mostCustomersServed?.customersServed || 0} customers`} icon={Users} />
        </div>

        <div className="mb-6 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-semibold text-gray-950"><BarChart3 className="h-5 w-5" /> 14-Day Service Revenue Trend</h2>
                <p className="text-sm text-gray-500">Based on actual transaction dates in Asia/Kathmandu.</p>
              </div>
            </div>
            <div className="flex h-56 items-end gap-2">
              {(data?.trend || []).map((row) => {
                const height = trendMax > 0 ? Math.max(6, Math.round((numberValue(row.revenue) / trendMax) * 100)) : 0;
                return (
                  <div key={row.date} className="flex h-full flex-1 flex-col justify-end gap-2">
                    <div className="rounded-t-lg bg-gray-950 transition-all" style={{ height: `${height}%` }} title={`${fmtDate(row.date)}: ${formatCurrency(row.revenue)}`} />
                    <p className="truncate text-center text-[10px] text-gray-500">{fmtDayNumber(row.date)}</p>
                  </div>
                );
              })}
            </div>
            {!trendMax ? <p className="mt-4 rounded-lg border border-dashed border-gray-200 p-4 text-center text-sm text-gray-500">No revenue trend data is available yet.</p> : null}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-gray-950"><Sparkles className="h-5 w-5" /> Business Insights</h2>
            <div className="space-y-3">
              {(data?.insights || []).map((insight) => (
                <div key={insight} className="flex gap-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                  <p>{insight}</p>
                </div>
              ))}
              {!data?.insights?.length ? <p className="rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-500">No staff insights are available yet.</p> : null}
            </div>
          </section>
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-gray-950">Detailed Staff Breakdown</h2>
          <div className="flex flex-wrap gap-2">
            {[
              ['all', 'All Staff'],
              ['barber', 'Barbers'],
              ['stylist', 'Stylists'],
              ['beautician', 'Beauticians'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setSelectedRole(value)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${selectedRole === value ? 'bg-gray-950 text-white' : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[920px] w-full">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-3">Staff</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3 text-right">Services</th>
                  <th className="px-5 py-3 text-right">Customers</th>
                  <th className="px-5 py-3 text-right">Revenue</th>
                  <th className="px-5 py-3 text-right">Cash Collected</th>
                  <th className="px-5 py-3 text-right">QR</th>
                  <th className="px-5 py-3 text-right">Commission</th>
                  <th className="px-5 py-3 text-right">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {details.length ? details.map((staff) => {
                  const metric = staff.metrics?.[selectedPeriod] || {};
                  return (
                    <tr key={staff.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-950">{staff.name}</td>
                      <td className="px-5 py-3 capitalize text-gray-600">{roleLabels[staff.role] || staff.role}</td>
                      <td className="px-5 py-3 text-right">{metric.servicesCompleted || 0}</td>
                      <td className="px-5 py-3 text-right">{metric.customersServed || 0}</td>
                      <td className="px-5 py-3 text-right font-semibold">{formatCurrency(metric.revenue || 0)}</td>
                      <td className="px-5 py-3 text-right font-semibold text-emerald-700">{formatCurrency(metric.cashCollected || 0)}</td>
                      <td className="px-5 py-3 text-right">{formatCurrency(metric.qrCollected || 0)}</td>
                      <td className="px-5 py-3 text-right">{formatCurrency(metric.commission || 0)}</td>
                      <td className="px-5 py-3 text-right">{staff.monthRevenueShare || 0}%</td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={9} className="px-5 py-10 text-center text-sm text-gray-500">No staff performance data is available for this filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-5">
          {details.map((staff) => (
            <StaffDetail key={staff.id} staff={staff} selectedPeriod={selectedPeriod} maxRevenue={maxRevenue} />
          ))}
          {!details.length ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white p-10 text-gray-500">
              <TrendingDown className="h-5 w-5" />
              No staff performance data yet.
            </div>
          ) : null}
        </div>

        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-gray-950"><Activity className="h-5 w-5" /> How To Read This Report</h2>
          <div className="grid gap-3 text-sm text-gray-600 md:grid-cols-3">
            <p><strong className="text-gray-950">Revenue</strong> is service revenue from paid bills where the staff member was assigned to the service line.</p>
            <p><strong className="text-gray-950">Commission</strong> uses the commission stored on each bill item, preserving history after rate changes.</p>
            <p><strong className="text-gray-950">Share</strong> compares each staff member&apos;s monthly service revenue against the active service team.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
