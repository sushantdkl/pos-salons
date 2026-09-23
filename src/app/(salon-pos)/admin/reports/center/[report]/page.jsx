'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CalendarRange, ChevronLeft, ChevronRight, Download, Loader2, Printer, RefreshCw } from 'lucide-react';
import { CalendarDateInput } from '@/components/shared/calendar-date-input';
import { MONEY_FIELDS, REPORT_CATALOG, humanizeReportField } from '@/lib/reports/report-catalog';

function nepalToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());
}

function shiftDate(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function displayValue(key, value) {
  if (value === null || value === undefined || value === '') return '—';
  if (MONEY_FIELDS.has(key)) return `Rs ${Number(value || 0).toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (typeof value === 'number') return value.toLocaleString('en-NP', { maximumFractionDigits: 2 });
  if (String(key).includes('date') || String(key).includes('time') || key === 'created_at') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleString('en-NP', { timeZone: 'Asia/Kathmandu', dateStyle: 'medium', timeStyle: key.includes('time') || key === 'created_at' ? 'short' : undefined });
  }
  return String(value).replaceAll('_', ' ');
}

function downloadCsv(report, rows, start, end) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = [keys.map(humanizeReportField).map(quote).join(','), ...rows.map((row) => keys.map((key) => quote(row[key])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${report}-${start}-${end}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function FeatureReportPage() {
  const params = useParams();
  const report = String(params.report || '');
  const catalog = REPORT_CATALOG[report];
  const today = useMemo(nepalToday, []);
  const [range, setRange] = useState({ start: today, end: today });
  const [page, setPage] = useState(1);
  const [calendarSystem, setCalendarSystem] = useState('AD');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const requestSequence = useRef(0);

  const loadReport = useCallback(async () => {
    if (!catalog) return;
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError('');
    setData(null);
    try {
      const query = new URLSearchParams({ report, start: range.start, end: range.end, page: String(page), pageSize: '25' });
      const response = await fetch(`/api/reports/center?${query}`, { headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` } });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to load report');
      if (sequence === requestSequence.current) setData(body);
    } catch (loadError) {
      if (sequence === requestSequence.current) setError(loadError.message || 'Unable to load report. Try again.');
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [catalog, page, range.end, range.start, report]);

  useEffect(() => { loadReport(); }, [loadReport]);
  useEffect(() => {
    fetch('/api/admin/settings', { headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` } })
      .then((response) => response.ok ? response.json() : null)
      .then((body) => setCalendarSystem(body?.settings?.calendar_system === 'BS' ? 'BS' : 'AD'))
      .catch(() => {});
  }, []);

  if (!catalog) {
    return <main className="min-h-screen bg-[#F7F5F2] p-5 sm:p-8"><div className="mx-auto max-w-3xl rounded-[14px] bg-white p-8 text-center"><h1 className="text-2xl font-bold text-[#1A1714]">Report not found</h1><Link href="/admin/reports" className="mt-4 inline-flex text-sm font-semibold text-[#5433C9]">Return to reports</Link></div></main>;
  }

  const rows = data?.rows || [];
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  const setPreset = (days) => { setPage(1); setRange({ start: shiftDate(today, -(days - 1)), end: today }); };
  const exportAllRows = async () => {
    setExporting(true); setError('');
    try {
      const headers = { Authorization: `Bearer ${localStorage.getItem('pos_token')}` };
      const firstQuery = new URLSearchParams({ report, start: range.start, end: range.end, page: '1', pageSize: '100' });
      const firstResponse = await fetch(`/api/reports/center?${firstQuery}`, { headers });
      const firstBody = await firstResponse.json();
      if (!firstResponse.ok) throw new Error(firstBody.error || 'Unable to export report');
      const pages = Number(firstBody.pagination?.pages || 1);
      const remaining = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, async (_, index) => {
        const query = new URLSearchParams({ report, start: range.start, end: range.end, page: String(index + 2), pageSize: '100' });
        const response = await fetch(`/api/reports/center?${query}`, { headers });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Unable to export report');
        return body.rows || [];
      }));
      downloadCsv(report, [firstBody.rows || [], ...remaining].flat(), range.start, range.end);
    } catch (exportError) { setError(exportError.message || 'Unable to export report'); }
    finally { setExporting(false); }
  };

  return (
    <main className="min-h-screen bg-[#F7F5F2] px-4 py-5 sm:px-8 sm:py-7">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4 print:mb-3">
          <div>
            <Link href="/admin/reports" className="print-hide mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#6B625A] hover:text-[#17140F]"><ArrowLeft className="h-4 w-4" />All reports</Link>
            <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-[#17140F] sm:text-3xl">{catalog.title}</h1>
            <p className="mt-1 max-w-3xl text-sm text-[#6B625A]">{catalog.description}</p>
          </div>
          <div className="print-hide flex gap-2">
            <button type="button" disabled={loading || exporting || !Number(data?.pagination?.total || 0)} onClick={exportAllRows} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#DED8D0] bg-white px-4 text-sm font-semibold text-[#332E29] disabled:opacity-40">{exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{exporting ? 'Exporting…' : 'CSV'}</button>
            <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#17140F] px-4 text-sm font-semibold text-white"><Printer className="h-4 w-4" />Print</button>
          </div>
        </header>

        <section className="print-hide mb-5 rounded-[14px] bg-white p-4 shadow-[0_2px_12px_rgba(42,34,28,0.06)] sm:p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-h-11 items-center gap-2 text-sm font-bold text-[#332E29]"><CalendarRange className="h-5 w-5 text-[#5E5CE6]" />Report period</div>
            <div className="flex flex-wrap gap-2">
              {[['Today', 1], ['Last 7 days', 7], ['Last 30 days', 30]].map(([label, days]) => <button key={label} type="button" onClick={() => setPreset(days)} className="min-h-11 rounded-[10px] bg-[#F1F0EC] px-3 text-sm font-semibold text-[#4D463F] hover:bg-[#E8E5DF]">{label}</button>)}
            </div>
            <label className="min-w-[175px] flex-1"><span className="mb-1 block text-xs font-semibold text-[#6B625A]">From ({calendarSystem})</span><CalendarDateInput value={range.start} max={range.end} calendarSystem={calendarSystem} onChange={(value) => { setPage(1); setRange((current) => ({ ...current, start: value })); }} className="min-h-11 w-full rounded-xl border border-[#D8D1C8] bg-white px-3" /></label>
            <label className="min-w-[175px] flex-1"><span className="mb-1 block text-xs font-semibold text-[#6B625A]">To ({calendarSystem})</span><CalendarDateInput value={range.end} min={range.start} calendarSystem={calendarSystem} onChange={(value) => { setPage(1); setRange((current) => ({ ...current, end: value })); }} className="min-h-11 w-full rounded-xl border border-[#D8D1C8] bg-white px-3" /></label>
            <button type="button" onClick={loadReport} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#D8D1C8] bg-white px-4 text-sm font-semibold"><RefreshCw className="h-4 w-4" />Refresh</button>
          </div>
        </section>

        {error ? <div role="alert" className="mb-5 rounded-[12px] bg-[#FCEDEA] px-4 py-3 text-sm font-semibold text-[#8B2E24]">{error}</div> : null}

        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Object.entries(data?.metrics || {}).map(([key, value]) => (
            <div key={key} className="rounded-[14px] bg-white px-5 py-4 shadow-[0_2px_12px_rgba(42,34,28,0.06)]">
              <p className="text-xs font-semibold text-[#746C64]">{humanizeReportField(key)}</p>
              <p className="mt-1 text-2xl font-extrabold tracking-[-0.02em] text-[#17140F]">{displayValue(key, value)}</p>
            </div>
          ))}
        </div>

        <section className="overflow-hidden rounded-[14px] bg-white shadow-[0_2px_12px_rgba(42,34,28,0.06)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EEE9E3] px-4 py-4 sm:px-5">
            <div><h2 className="font-bold text-[#17140F]">Detailed records</h2><p className="mt-0.5 text-xs text-[#746C64]">{catalog.question}</p></div>
            <p className="text-xs text-[#746C64]">Date basis: {data?.definition?.dateBasis || '—'} · Included: {(data?.definition?.statuses || []).join(', ') || '—'}</p>
          </div>
          {loading ? <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-[#6B625A]"><Loader2 className="h-5 w-5 animate-spin" />Loading report…</div> : rows.length ? (
            <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-[#F8F6F2]"><tr>{columns.map((key) => <th key={key} className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold text-[#5B534B]">{humanizeReportField(key)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={row.id || row.bill_number || `${report}-${rowIndex}`} className="border-t border-[#F0ECE6] hover:bg-[#FCFAF7]">{columns.map((key) => <td key={key} className="whitespace-nowrap px-4 py-3 text-[#332E29]">{displayValue(key, row[key])}</td>)}</tr>)}</tbody></table></div>
          ) : <div className="flex min-h-56 flex-col items-center justify-center px-5 text-center"><CalendarRange className="mb-3 h-9 w-9 text-[#B4ABA2]" /><p className="font-semibold text-[#332E29]">No records in this period</p><p className="mt-1 text-sm text-[#746C64]">Choose a wider date range, then refresh the report.</p></div>}
          <div className="print-hide flex items-center justify-between border-t border-[#EEE9E3] px-4 py-3 text-sm"><span className="text-[#746C64]">{data?.pagination?.total || 0} records</span><div className="flex items-center gap-2"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} className="inline-flex min-h-11 items-center gap-1 rounded-[10px] border border-[#DED8D0] px-3 font-semibold disabled:opacity-40"><ChevronLeft className="h-4 w-4" />Previous</button><span className="px-2 font-semibold">{page} / {data?.pagination?.pages || 1}</span><button type="button" disabled={page >= (data?.pagination?.pages || 1) || loading} onClick={() => setPage((value) => value + 1)} className="inline-flex min-h-11 items-center gap-1 rounded-[10px] border border-[#DED8D0] px-3 font-semibold disabled:opacity-40">Next<ChevronRight className="h-4 w-4" /></button></div></div>
        </section>
      </div>
    </main>
  );
}
