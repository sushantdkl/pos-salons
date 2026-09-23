'use client';

/**
 * STAFF HOME (barber / stylist / beautician) — the same ERP layout as admin and cashier.
 * /api/admin/staff-performance returns only the signed-in staff member's own figures;
 * /api/appointments returns only their own bookings (without customer phone numbers).
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, CalendarClock, Scissors } from 'lucide-react';
import {
  count, EmptyState, ErpButton, ErpPage, FinancialTable, MetricCard, MetricGroup, money, PageHeader, SectionHeading, StatusBadge,
} from '@/components/erp';
import { erpFetch } from '@/components/erp/use-report';

const PERIODS = [['today', 'Today'], ['week', 'This Week'], ['month', 'This Month'], ['custom', 'Custom']];
const APPOINTMENT_LABEL = { PENDING: ['Pending', 'cash'], CONFIRMED: ['Confirmed', 'online'], CHECKED_IN: ['Arrived', 'ledger'], IN_SERVICE: ['In service', 'hrm'], COMPLETED: ['Completed', 'inflow'], CANCELLED: ['Cancelled', 'neutral'], NO_SHOW: ['No show', 'outflow'] };

function nepalToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());
}
function dateTime(value) {
  return value ? new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Kathmandu', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
}

export default function StaffPerformanceDashboard({ title }) {
  const [data, setData] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [period, setPeriod] = useState('today');
  const [customDates, setCustomDates] = useState({ start: '', end: '' });

  useEffect(() => {
    let url = `/api/admin/staff-performance?period=${period}`;
    if (period === 'custom') {
      if (!customDates.start || !customDates.end) return;
      url += `&startDate=${customDates.start}&endDate=${customDates.end}`;
    }
    erpFetch(url).then(setData).catch(() => setData((current) => current));
  }, [period, customDates.start, customDates.end]);

  useEffect(() => {
    const today = nepalToday();
    erpFetch(`/api/appointments?from=${today}&to=${today}`).then((payload) => setAppointments(payload.appointments || [])).catch(() => setAppointments([]));
  }, []);

  const today = data?.metrics?.today || {};
  const week = data?.metrics?.week || {};
  const month = data?.metrics?.month || {};
  const summary = data?.summary || {};
  const report = data?.report || { rows: [], totals: {} };
  const upcoming = appointments.filter((item) => !['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(item.status));

  return (
    <ErpPage>
      <PageHeader icon={Scissors} iconTone="ops" title={title} subtitle="Your services, customers, revenue and commission." />
      <div className="space-y-5">
        <div>
          <SectionHeading title="Today" />
          <MetricGroup columns={4}>
            <MetricCard label="Services completed" value={count(today.servicesCompleted)} tone="ops" emphasis />
            <MetricCard label="Customers served" value={count(today.customersServed)} tone="ops" />
            <MetricCard label="Revenue generated" value={money(today.revenue)} tone="inflow" />
            <MetricCard label="Commission earned" value={money(today.commission)} tone="hrm" />
          </MetricGroup>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="min-w-0">
            <SectionHeading title="My appointments today" action={<Link href="/appointments/my" className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 hover:underline">Week <ArrowRight className="h-3.5 w-3.5" /></Link>} />
            {upcoming.length ? (
              <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
                {upcoming.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="w-12 shrink-0 text-sm font-extrabold tabular-nums">{item.startTime}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-stone-900">{item.customerName}</p>
                      <p className="truncate text-xs text-stone-500">{item.services.map((service) => service.name).join(', ')}</p>
                    </div>
                    <StatusBadge status={item.status} label={APPOINTMENT_LABEL[item.status][0]} tone={APPOINTMENT_LABEL[item.status][1]} />
                  </li>
                ))}
              </ul>
            ) : <EmptyState icon={CalendarClock} title="No more appointments today" />}
          </div>
          <div className="min-w-0">
            <SectionHeading title="Week & month" />
            <MetricGroup columns={2}>
              <MetricCard label="This week" value={money(week.revenue)} tone="inflow" sub={`${count(week.servicesCompleted)} services · ${money(week.commission)} commission`} />
              <MetricCard label="This month" value={money(month.revenue)} tone="inflow" sub={`${count(month.servicesCompleted)} services · ${money(month.commission)} commission`} />
              <MetricCard label="Avg services / day" value={(summary.averageServicesPerDay || 0).toFixed(1)} tone="neutral" />
              <MetricCard label="Avg revenue / day" value={money(summary.averageRevenuePerDay)} tone="neutral" />
            </MetricGroup>
          </div>
        </div>

        <div className="min-w-0">
          <SectionHeading title="Recent services" />
          <FinancialTable
            caption="Recent services"
            rows={data?.recentServices || []}
            rowKey={(row, index) => `${row.invoice}-${index}`}
            empty="No completed services yet."
            columns={[
              { key: 'customer', label: 'Customer', render: (row) => row.customerName || 'Walk-in Customer' },
              { key: 'service', label: 'Service', render: (row) => row.serviceName },
              { key: 'invoice', label: 'Invoice', render: (row) => row.invoice },
              { key: 'date', label: 'Date', render: (row) => dateTime(row.date) },
            ]}
          />
        </div>

        <div className="min-w-0">
          <SectionHeading
            title="Service report"
            note="Only your completed service items are included."
            action={(
              <div className="flex flex-wrap gap-1">
                {PERIODS.map(([value, label]) => (
                  <ErpButton key={value} variant={period === value ? 'primary' : 'secondary'} onClick={() => setPeriod(value)}>{label}</ErpButton>
                ))}
              </div>
            )}
          />
          {period === 'custom' ? (
            <div className="mb-3 flex flex-wrap gap-2">
              <input type="date" aria-label="From" value={customDates.start} onChange={(event) => setCustomDates({ ...customDates, start: event.target.value })} className="h-10 rounded-lg border border-stone-300 bg-white px-3 text-sm" />
              <input type="date" aria-label="To" value={customDates.end} onChange={(event) => setCustomDates({ ...customDates, end: event.target.value })} className="h-10 rounded-lg border border-stone-300 bg-white px-3 text-sm" />
            </div>
          ) : null}
          <div className="mb-3">
            <MetricGroup columns={6}>
              <MetricCard label="Services" value={count(report.totals?.services)} tone="ops" />
              <MetricCard label="Revenue" value={money(report.totals?.revenue)} tone="inflow" />
              <MetricCard label="Commission" value={money(report.totals?.commission)} tone="hrm" />
              <MetricCard label="Cash collected" value={money(report.totals?.cashCollected)} tone="cash" />
              <MetricCard label="QR collected" value={money(report.totals?.qrCollected)} tone="online" />
              <MetricCard label="Customers" value={count(report.totals?.customers)} tone="neutral" />
            </MetricGroup>
          </div>
          <FinancialTable
            caption="Service report"
            rows={report.rows || []}
            rowKey={(row, index) => `${row.invoice}-${index}`}
            empty="No services recorded for this period."
            columns={[
              { key: 'date', label: 'Date', render: (row) => dateTime(row.date) },
              { key: 'invoice', label: 'Invoice', render: (row) => row.invoice },
              { key: 'customer', label: 'Customer', render: (row) => row.customerName || 'Walk-in Customer' },
              { key: 'service', label: 'Service', render: (row) => row.serviceName },
              { key: 'amount', label: 'Amount', align: 'right', render: (row) => money(row.amount) },
              { key: 'cash', label: 'Cash', align: 'right', render: (row) => money(row.cash) },
              { key: 'qr', label: 'QR', align: 'right', render: (row) => money(row.qr) },
              { key: 'commission', label: 'Commission', align: 'right', render: (row) => money(row.commission) },
            ]}
            footer={report.rows?.length ? (
              <tr>
                <td className="px-3 py-2.5 text-sm" colSpan={4}>Totals · {count(report.totals?.services)} services</td>
                <td className="px-3 py-2.5 text-right text-sm tabular-nums">{money(report.totals?.revenue)}</td>
                <td className="px-3 py-2.5 text-right text-sm tabular-nums">{money(report.totals?.cashCollected)}</td>
                <td className="px-3 py-2.5 text-right text-sm tabular-nums">{money(report.totals?.qrCollected)}</td>
                <td className="px-3 py-2.5 text-right text-sm tabular-nums">{money(report.totals?.commission)}</td>
              </tr>
            ) : null}
          />
        </div>
      </div>
    </ErpPage>
  );
}
