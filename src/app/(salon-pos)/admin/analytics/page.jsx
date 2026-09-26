'use client';

/**
 * SALON ANALYTICS — "What is driving the salon?"
 * Everything is aggregated server-side by /api/admin/analytics (lib/reports/analytics.js +
 * analytics-money.js, which reuse the Summary's money services). This page only lays it out.
 */

import { AnalyticsQueryContext } from '@/components/analytics/bill-drill';
import { useCalendarSystem } from '@/lib/dates/display';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity, BarChart3, CalendarClock, CalendarDays, ChartColumnBig, ClipboardCheck, History, Package, Plus, RefreshCw, Scissors,
  Ticket, UsersRound, HeartHandshake,
} from 'lucide-react';
import { AlertBanner, ErrorState, LoadingState, PeriodFilter, PrintButton, PrintHeader } from '@/components/erp';
import { erpFetch, usePeriod, useReport } from '@/components/erp/use-report';
import { ExportButtons } from '@/components/exports/export-buttons';
import { analyticsSheets } from '@/components/analytics/export-sheets';
import { MoneyFlow } from '@/components/analytics/money-flow';
import { MoneyTab } from '@/components/analytics/money-tab';
import { OverviewTab } from '@/components/analytics/overview-tab';
import {
  CancellationsTab, ControlsTab, CustomersTab, FrontDeskTab, ProductsTab, ServicesTab, StaffTab,
} from '@/components/analytics/other-tabs';
import { formatCalendarDate } from '@/lib/dates/calendar';

const TABS = [
  { key: 'overview', label: 'Overview', icon: Activity, body: OverviewTab },
  { key: 'money', label: 'Sales & Money', icon: BarChart3, body: MoneyTab },
  { key: 'services', label: 'Services', icon: Scissors, body: ServicesTab },
  { key: 'customers', label: 'Customers & Loyalty', icon: HeartHandshake, body: CustomersTab },
  { key: 'staff', label: 'Staff & Team', icon: UsersRound, body: StaffTab },
  { key: 'products', label: 'Products & Stock', icon: Package, body: ProductsTab },
  { key: 'frontdesk', label: 'Front Desk', icon: Ticket, body: FrontDeskTab },
  { key: 'controls', label: 'Controls & Activity', icon: ClipboardCheck, body: ControlsTab },
  { key: 'cancellations', label: 'Cancellations & Changes', icon: History, body: CancellationsTab },
];

function shiftDate(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

const daysBetween = (start, end) => Math.round((new Date(`${end}T12:00:00Z`) - new Date(`${start}T12:00:00Z`)) / 86400000) + 1;

function nepalTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', { timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit' });
}

export default function AnalyticsPage() {
  const period = usePeriod('today');
  const [tab, setTab] = useState('overview');
  // Settings → Calendar, shared by every screen (see lib/dates/display).
  const calendarSystem = useCalendarSystem();
  const url = period.ready ? `/api/admin/analytics?${period.query}` : null;
  const { data, error, loading, reload } = useReport(url, { enabled: period.ready });
  const a = data?.analytics;


  // The equal-length period right before this one, for the workbook's comparison column.
  const days = a?.period?.startDate && a?.period?.endDate ? daysBetween(a.period.startDate, a.period.endDate) : 0;
  const previousUrl = days ? `/api/admin/analytics?period=custom&startDate=${shiftDate(a.period.startDate, -days)}&endDate=${shiftDate(a.period.startDate, -1)}` : null;
  const { data: previousData } = useReport(previousUrl, { enabled: Boolean(previousUrl) });
  const prev = previousData?.analytics;

  const fmt = (iso) => (iso ? formatCalendarDate(String(iso).slice(0, 10), calendarSystem) : '');
  const periodText = a ? `${a.period?.label || ''} · ${a.period?.displayRange || ''}` : '';
  const live = a?.period?.value === 'today' && a?.businessDay?.status === 'OPEN';
  // Cards that open a tab also scroll it into view.
  const openTab = (key) => {
    setTab(key);
    requestAnimationFrame(() => document.getElementById('analytics-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const active = TABS.find((item) => item.key === tab) || TABS[0];
  const Body = active.body;

  return (
    <main className="mx-auto w-full min-w-0 max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
      <PrintHeader title="Salon Analytics" period={periodText} />

      <header className="mb-5 flex flex-col gap-4 border-b border-stone-200/80 pb-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1C1917] text-[#E8CC8A]"><ChartColumnBig className="h-5 w-5" aria-hidden="true" /></span>
            <h1 className="font-[family-name:var(--font-dashboard-heading)] text-2xl font-extrabold tracking-tight text-stone-900 sm:text-[28px]">Salon Analytics</h1>
            {live ? <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />Live</span> : null}
          </div>
          <p className="mt-1.5 max-w-3xl text-sm text-stone-500">Sales, collections, services, team, customers, stock and salon health for the selected period.</p>
          {a ? (
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-stone-500">
              <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                {a.businessDay?.scoped && a.businessDay?.date ? `Current Business Day · ${fmt(a.businessDay.date)}` : `${a.period?.label} · ${a.period?.displayRange}`}
              </span>
              <span>Updated {fmt(a.generatedAt)} · {nepalTime(a.generatedAt)} NPT</span>
            </p>
          ) : null}
        </div>
        <div className="print-hide flex flex-wrap items-center gap-2 xl:max-w-[640px] xl:justify-end">
          <Link href="/admin/billing" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#1C1917] px-3.5 text-sm font-semibold text-white hover:bg-stone-800"><Plus className="h-4 w-4" />New Bill</Link>
          <Link href="/admin/appointments" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"><CalendarClock className="h-4 w-4" />Appointments</Link>
          <Link href="/dashboard/admin/tokens" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"><Ticket className="h-4 w-4" />Queue</Link>
          <ExportButtons filename={`Salon analytics ${a?.period?.startDate || ''} to ${a?.period?.endDate || ''}`} title="Salon Analytics" subtitle={periodText} getSheets={async () => analyticsSheets(a, prev)} disabled={!a} />
          <PrintButton />
          <button type="button" onClick={reload} disabled={loading} aria-label="Refresh" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <PeriodFilter {...period.filterProps} className="mb-5" />

      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {!period.ready ? <AlertBanner tone="online" title="Choose a date range">Select a start and end date, then Apply.</AlertBanner> : null}
      {loading && !a ? <LoadingState label="Crunching the numbers…" /> : null}

      {a ? (
        <div className={`space-y-6 ${loading ? 'opacity-60 transition-opacity' : ''}`}>
          <MoneyFlow a={a} onTab={openTab} />

          <div id="analytics-tabs" role="tablist" aria-label="Analytics sections" className="print-hide -mx-1 flex gap-1 overflow-x-auto border-b border-stone-200 px-1">
            {TABS.map((item) => {
              const Icon = item.icon;
              const selected = tab === item.key;
              return (
                <button key={item.key} type="button" role="tab" aria-selected={selected} onClick={() => setTab(item.key)}
                  className={`inline-flex shrink-0 items-center gap-2 border-b-[3px] px-3 py-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900/30 ${selected ? 'border-[#C9A55C] text-stone-900' : 'border-transparent text-stone-500 hover:text-stone-800'}`}>
                  <Icon className={`h-4 w-4 ${selected ? 'text-[#9B742D]' : ''}`} aria-hidden="true" />{item.label}
                </button>
              );
            })}
          </div>
          <div role="tabpanel" aria-label={active.label}>
            <AnalyticsQueryContext.Provider value={period.query}><Body a={a} calendarSystem={calendarSystem} /></AnalyticsQueryContext.Provider>
          </div>
        </div>
      ) : null}
    </main>
  );
}
