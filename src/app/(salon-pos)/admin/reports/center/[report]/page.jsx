'use client';

import { useCalendarSystem } from '@/lib/dates/display';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft, Banknote, CalendarDays, CreditCard, FileText, GitCompareArrows, Package, Receipt, Scissors, Search, Wallet,
} from 'lucide-react';
import { CalendarDateInput } from '@/components/shared/calendar-date-input';
import { AlertBanner, ErpPage, LoadingState, PrintButton, PrintHeader, tone } from '@/components/erp';
import { erpFetch } from '@/components/erp/use-report';
import { ExportButtons } from '@/components/exports/export-buttons';
import { exportColumnsFor, ReportTable, statusLabel } from '@/components/reports/report-table';
import { adToBsIso, bsToAdIso, formatCalendarDate } from '@/lib/dates/calendar';
import { REPORT_CATALOG } from '@/lib/reports/report-catalog';
import { WORKSPACE_COLUMNS, WORKSPACE_METRICS, WORKSPACE_SNAPSHOT } from '@/lib/reports/workspace-columns';
import { isSensitiveReportField } from '@/lib/reports/redact';

const REPORT_ICONS = { sales: Receipt, services: Scissors, products: Package, payments: CreditCard, credit: Wallet, expenses: Banknote, advances: FileText };
const REPORT_TONES = { sales: 'inflow', services: 'ops', products: 'ops', payments: 'online', credit: 'ledger', expenses: 'outflow', advances: 'hrm' };
const ACCENT = { inflow: 'border-t-emerald-500', ops: 'border-t-teal-500', online: 'border-t-sky-500', ledger: 'border-t-indigo-500', outflow: 'border-t-rose-500', hrm: 'border-t-violet-500' };

function nepalToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());
}

function shiftDate(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

const daysBetween = (start, end) => Math.round((new Date(`${end}T12:00:00Z`) - new Date(`${start}T12:00:00Z`)) / 86400000) + 1;

/** Month / year presets follow the salon's calendar (BS months when the salon uses BS). */
function presetRanges(today, calendarSystem) {
  let monthStart; let lastMonthStart; let yearStart;
  if (calendarSystem === 'BS') {
    const [y, m] = adToBsIso(today).split('-').map(Number);
    const pad = (n) => String(n).padStart(2, '0');
    monthStart = bsToAdIso(`${y}-${pad(m)}-01`);
    lastMonthStart = bsToAdIso(m === 1 ? `${y - 1}-12-01` : `${y}-${pad(m - 1)}-01`);
    yearStart = bsToAdIso(`${y}-01-01`);
  } else {
    monthStart = `${today.slice(0, 8)}01`;
    lastMonthStart = `${shiftDate(monthStart, -1).slice(0, 8)}01`;
    yearStart = `${today.slice(0, 4)}-01-01`;
  }
  return [
    { key: 'today', label: 'Today', start: today, end: today },
    { key: 'yesterday', label: 'Yesterday', start: shiftDate(today, -1), end: shiftDate(today, -1) },
    { key: '7', label: 'Last 7 days', start: shiftDate(today, -6), end: today },
    { key: '30', label: 'Last 30 days', start: shiftDate(today, -29), end: today },
    { key: 'month', label: 'This month', start: monthStart, end: today },
    { key: 'lastmonth', label: 'Last month', start: lastMonthStart, end: shiftDate(monthStart, -1) },
    { key: 'year', label: 'This year', start: yearStart, end: today },
  ];
}

const selectClass = 'h-11 min-w-0 rounded-xl border border-stone-200 bg-white px-3 text-sm font-medium text-stone-800 focus:border-stone-400 focus:outline-none';

export default function ReportWorkspacePage() {
  const params = useParams();
  const report = String(params.report || '');
  const catalog = REPORT_CATALOG[report];
  const columnsByTable = WORKSPACE_COLUMNS[report];
  const today = useMemo(nepalToday, []);
  // Settings → Calendar, shared by every screen (see lib/dates/display).
  const calendarSystem = useCalendarSystem();
  const [presetKey, setPresetKey] = useState('today');
  const [range, setRange] = useState({ start: today, end: today });
  const [filters, setFilters] = useState({ basis: 'calendar', staff: '', method: '', category: '' });
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  // Commission / cost / profit columns disappear when the server withheld them (Staff Permissions).
  const visibleColumns = (key) => (columnsByTable?.[key] || []).filter((column) => !(data?.hiddenFields && isSensitiveReportField(column.key)));
  const [previous, setPrevious] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const sequence = useRef(0);

  const presets = useMemo(() => presetRanges(today, calendarSystem), [today, calendarSystem]);
  const periodDays = daysBetween(range.start, range.end);
  const previousRange = useMemo(() => ({ start: shiftDate(range.start, -periodDays), end: shiftDate(range.start, -1) }), [range.start, periodDays]);

  // Deep link: ?start=YYYY-MM-DD&end=YYYY-MM-DD (e.g. from an Analytics card) opens that range.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const start = params.get('start');
    const end = params.get('end');
    if (/^\d{4}-\d{2}-\d{2}$/.test(start || '') && /^\d{4}-\d{2}-\d{2}$/.test(end || '') && start <= end) {
      setRange({ start, end });
      setPresetKey(start === end && start === today ? 'today' : 'custom');
    }
  }, [today]);


  const load = useCallback(async () => {
    if (!catalog || !columnsByTable) return;
    const id = ++sequence.current;
    setLoading(true);
    setError('');
    const query = (start, end, extra = {}) => new URLSearchParams(Object.fromEntries(Object.entries({ report, start, end, ...filters, ...extra }).filter(([, v]) => v !== '' && v !== null)));
    try {
      const [body, prev] = await Promise.all([
        erpFetch(`/api/reports/workspace?${query(range.start, range.end)}`),
        erpFetch(`/api/reports/workspace?${query(previousRange.start, previousRange.end, { metricsOnly: '1' })}`).catch(() => null),
      ]);
      if (id === sequence.current) { setData(body); setPrevious(prev); }
    } catch (loadError) {
      if (id === sequence.current) setError(loadError.message || 'Unable to load the report.');
    } finally {
      if (id === sequence.current) setLoading(false);
    }
  }, [catalog, columnsByTable, report, range.start, range.end, previousRange.start, previousRange.end, filters]);

  useEffect(() => { load(); }, [load]);

  if (!catalog || !columnsByTable) {
    return (
      <ErpPage narrow>
        <div className="rounded-xl border border-stone-200 bg-white p-8 text-center">
          <h1 className="text-2xl font-bold text-stone-900">Report not found</h1>
          <Link href="/admin/reports" className="mt-4 inline-flex text-sm font-semibold text-indigo-700">Return to reports</Link>
        </div>
      </ErpPage>
    );
  }

  const Icon = REPORT_ICONS[report] || FileText;
  const reportTone = REPORT_TONES[report] || 'ledger';
  const t = tone(reportTone);
  const fmt = (iso) => formatCalendarDate(iso, calendarSystem);
  const periodLabel = range.start === range.end ? fmt(range.start) : `${fmt(range.start)} – ${fmt(range.end)}`;
  const previousLabel = previousRange.start === previousRange.end ? fmt(previousRange.start) : `${fmt(previousRange.start)} – ${fmt(previousRange.end)}`;
  const options = data?.options || {};
  const snapshot = WORKSPACE_SNAPSHOT[report] || [];
  const tables = data?.tables || [];
  const exportBase = `${catalog.title} ${range.start} to ${range.end}`;
  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const choosePreset = (preset) => { setPresetKey(preset.key); setRange({ start: preset.start, end: preset.end }); };

  const workbook = async () => {
    const metricsSheet = {
      name: 'Summary',
      columns: [
        { header: 'Measure', key: 'label', bold: true, width: 30 },
        { header: 'This period', key: 'value', type: 'decimal', tone: 'ledger' },
        { header: 'Previous period', key: 'previous', type: 'decimal', tone: 'neutral' },
      ],
      rows: Object.entries(data?.metrics || {}).map(([key, value]) => ({ label: WORKSPACE_METRICS[key]?.label || statusLabel(key), value, previous: snapshot.includes(key) ? null : previous?.metrics?.[key] ?? null })),
      note: `Previous period: ${previousLabel}.`,
    };
    return [metricsSheet, ...tables.map((item) => {
      const columns = visibleColumns(item.key);
      const firstText = columns.find((column) => !['money', 'number', 'percent'].includes(column.type))?.key;
      return {
        name: item.title,
        columns: exportColumnsFor(columns, calendarSystem),
        rows: item.rows,
        totals: Object.keys(item.totals || {}).length && item.rows.length ? { ...item.totals, ...(firstText ? { [firstText]: 'TOTAL' } : {}) } : undefined,
      };
    })];
  };

  const activeFilters = [
    filters.staff && options.staff?.find((s) => String(s.id) === String(filters.staff))?.name,
    filters.method && statusLabel(filters.method),
    filters.category && (options.categories?.find((c) => c.value === filters.category)?.label || filters.category),
    filters.basis === 'business' && 'Business-day dates',
  ].filter(Boolean);
  const subtitle = [periodLabel, ...activeFilters].join(' · ');

  return (
    <ErpPage>
      <PrintHeader title={catalog.title} period={subtitle} />
      <Link href="/admin/reports" className="print-hide mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-stone-500 hover:text-stone-900"><ArrowLeft className="h-4 w-4" />All reports</Link>

      <header className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${t.soft} ${t.text}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
          <div className="min-w-0">
            <h1 className="font-[family-name:var(--font-dashboard-heading)] text-2xl font-extrabold tracking-tight text-stone-900 sm:text-[28px]">{catalog.title}</h1>
            <p className="mt-0.5 max-w-2xl text-sm text-stone-500">{catalog.description}</p>
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              {data?.businessDay ? `Current Business Day · ${fmt(data.businessDay)}` : `No business day open · Today ${fmt(today)}`}
            </p>
          </div>
        </div>
        <div className="print-hide flex flex-wrap items-center gap-2">
          <Link href="/admin/reports/compare" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3.5 text-sm font-semibold text-stone-700 shadow-sm hover:bg-stone-50"><GitCompareArrows className="h-4 w-4" />Compare report</Link>
          <ExportButtons filename={exportBase} title={catalog.title} subtitle={subtitle} getSheets={workbook} disabled={!data || loading} />
          <PrintButton />
        </div>
      </header>

      <section className={`print-hide mb-5 rounded-2xl border border-stone-200 border-t-4 bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04)] ${ACCENT[reportTone] || 'border-t-indigo-500'}`}>
        <div className="px-4 pb-4 pt-3.5 sm:px-5">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-stone-500">Period</p>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Report period">
            {presets.map((preset) => (
              <button key={preset.key} type="button" role="tab" aria-selected={presetKey === preset.key} onClick={() => choosePreset(preset)}
                className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${presetKey === preset.key ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}>
                {preset.label}
              </button>
            ))}
            <button type="button" role="tab" aria-selected={presetKey === 'custom'} onClick={() => setPresetKey('custom')}
              className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${presetKey === 'custom' ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}>
              Custom dates
            </button>
          </div>
          {presetKey === 'custom' ? (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="text-xs font-semibold text-stone-500">From ({calendarSystem})
                <CalendarDateInput value={range.start} max={range.end} calendarSystem={calendarSystem} onChange={(value) => setRange((r) => ({ ...r, start: value }))} className="mt-1 block h-10 w-44 rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900" />
              </label>
              <label className="text-xs font-semibold text-stone-500">To ({calendarSystem})
                <CalendarDateInput value={range.end} min={range.start} calendarSystem={calendarSystem} onChange={(value) => setRange((r) => ({ ...r, end: value }))} className="mt-1 block h-10 w-44 rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900" />
              </label>
            </div>
          ) : null}
        </div>
        <div className="grid gap-2 border-t border-stone-100 px-4 py-3.5 sm:grid-cols-2 sm:px-5 lg:flex lg:flex-wrap">
          {options.basis !== false ? (
            <select aria-label="Date basis" value={filters.basis} onChange={(event) => setFilter('basis', event.target.value)} className={`${selectClass} lg:w-52`}>
              <option value="calendar">Calendar date range</option>
              <option value="business">Business day range</option>
            </select>
          ) : null}
          {options.staff?.length ? (
            <select aria-label="Employee" value={filters.staff} onChange={(event) => setFilter('staff', event.target.value)} className={`${selectClass} lg:w-48`}>
              <option value="">All employees</option>
              {options.staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          ) : null}
          {options.methods?.length ? (
            <select aria-label="Payment method" value={filters.method} onChange={(event) => setFilter('method', event.target.value)} className={`${selectClass} lg:w-52`}>
              <option value="">All payment methods</option>
              {options.methods.map((method) => <option key={method} value={method}>{statusLabel(method)}</option>)}
            </select>
          ) : null}
          {options.categories?.length ? (
            <select aria-label="Category" value={filters.category} onChange={(event) => setFilter('category', event.target.value)} className={`${selectClass} lg:w-52`}>
              <option value="">{options.categoryLabel || 'All categories'}</option>
              {options.categories.map((category) => <option key={category.value} value={category.value}>{statusLabel(category.label)}</option>)}
            </select>
          ) : null}
          <label className="relative min-w-0 sm:col-span-2 lg:min-w-[220px] lg:flex-1">
            <span className="sr-only">Search these records</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search these records…" className={`${selectClass} w-full pl-10`} />
          </label>
        </div>
      </section>

      {error ? <div className="mb-5"><AlertBanner tone="outflow" title="Report could not load">{error}</AlertBanner></div> : null}
      {loading && !data ? <LoadingState label="Building the report…" /> : null}

      {data ? (
        <div className={`space-y-5 ${loading ? 'opacity-60 transition-opacity' : ''}`}>
          {tables.map((item, index) => (
            <ReportTable
              key={`${item.key}-${index}`}
              title={item.title}
              columns={visibleColumns(item.key)}
              rows={item.rows}
              totals={item.totals}
              truncated={item.truncated}
              calendarSystem={calendarSystem}
              globalSearch={search}
              exportName={`${catalog.title} - ${item.title} ${range.start} to ${range.end}`}
              exportSubtitle={subtitle}
              defaultPageSize={index === 0 ? 50 : 25}
            />
          ))}
        </div>
      ) : null}
    </ErpPage>
  );
}
