'use client';

/**
 * Customer Ledger / Supplier Ledger page: total owed, how long it has been owed (ageing),
 * Outstanding and History lists, period + search filters. Clicking a row opens the statement
 * pop-up. Figures come from /api/ledgers/overview (summed on the server).
 */

import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Printer, Search } from 'lucide-react';
import { count, money } from '@/components/erp';
import { erpFetch, useReport } from '@/components/erp/use-report';
import { CalendarDateInput } from '@/components/shared/calendar-date-input';
import { LedgerStatement } from '@/components/ledgers/ledger-statement';
import { adToBsIso, bsToAdIso, formatCalendarDate } from '@/lib/dates/calendar';

const BUCKET_TONES = ['text-emerald-700', 'text-amber-700', 'text-orange-700', 'text-rose-700'];

function nepalToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());
}

function shiftDate(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function presets(today, calendarSystem) {
  const pad = (n) => String(n).padStart(2, '0');
  let monthStart = `${today.slice(0, 8)}01`;
  let yearStart = `${today.slice(0, 4)}-01-01`;
  if (calendarSystem === 'BS') {
    const [y, m] = adToBsIso(today).split('-').map(Number);
    monthStart = bsToAdIso(`${y}-${pad(m)}-01`);
    yearStart = bsToAdIso(`${y}-01-01`);
  }
  const weekStart = shiftDate(today, -new Date(`${today}T12:00:00Z`).getUTCDay()); // Nepal week starts Sunday
  return [
    { key: 'all', label: 'All Time', from: '', to: '' },
    { key: 'today', label: 'Today', from: today, to: today },
    { key: 'yesterday', label: 'Yesterday', from: shiftDate(today, -1), to: shiftDate(today, -1) },
    { key: 'week', label: 'This Week', from: weekStart, to: today },
    { key: 'month', label: 'This Month', from: monthStart, to: today },
    { key: 'year', label: 'This Year', from: yearStart, to: today },
  ];
}

const COPY = {
  customer: {
    banner: 'Owed on credit accounts',
    bannerNote: 'Named credit customers only. Walk-in bills paid in full never appear here.',
    ageingTitle: 'How long it has been owed',
    ageingNote: (total) => `The same ${money(total)} split by the age of each unpaid bill. Anything past 90 days is unlikely to be collected without chasing.`,
    listTitle: 'Customers with dues',
    historyTitle: 'Customers with ledger activity',
    search: 'Search customer by name or phone…',
    periodNote: 'Shows customers with ledger activity (charged or paid) in this period — the amount shown is still their current total owed.',
    empty: 'No customer owes anything right now.',
  },
  supplier: {
    banner: 'Total outstanding to suppliers',
    bannerNote: 'Opening balances plus purchases received, less payments made.',
    ageingTitle: 'How long supplier balances have been owed',
    ageingNote: (total) => `The same ${money(total)} split by the date of each unpaid purchase, so overdue supplier balances are easy to spot.`,
    listTitle: 'Suppliers with dues',
    historyTitle: 'Suppliers with ledger activity',
    search: 'Search supplier by name…',
    periodNote: 'Shows suppliers with purchases or payments in this period — the amount shown is still what you owe them now.',
    empty: 'You do not owe any supplier right now.',
  },
};

export function LedgerOverview({ kind, title, subtitle, accent = 'rose' }) {
  const copy = COPY[kind];
  const today = useMemo(nepalToday, []);
  const [calendarSystem, setCalendarSystem] = useState('AD');
  const [tab, setTab] = useState('outstanding');
  const [preset, setPreset] = useState('all');
  const [range, setRange] = useState({ from: '', to: '' });
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    erpFetch('/api/admin/settings').then((body) => setCalendarSystem(body?.settings?.calendar_system === 'BS' ? 'BS' : 'AD')).catch(() => {});
  }, []);
  useEffect(() => { const t = setTimeout(() => setQuery(search.trim()), 250); return () => clearTimeout(t); }, [search]);

  const url = `/api/ledgers/overview?${new URLSearchParams(Object.fromEntries(Object.entries({ kind, q: query, from: range.from, to: range.to }).filter(([, v]) => v)))}`;
  const { data, error, loading, reload } = useReport(url);
  const presetList = useMemo(() => presets(today, calendarSystem), [today, calendarSystem]);
  const periodActive = Boolean(range.from || range.to);
  const activeIds = new Set((data?.history || []).map((row) => String(row.id)));
  const outstandingRows = (data?.outstandingRows || []).filter((row) => !periodActive || activeIds.has(String(row.id)));
  const fmt = (iso) => (iso ? formatCalendarDate(iso, calendarSystem) : '');
  const tabAccent = { rose: 'border-rose-500', orange: 'border-orange-500' }[accent] || 'border-stone-900';

  const choose = (item) => { setPreset(item.key); setRange({ from: item.from, to: item.to }); };

  return (
    <main className="mx-auto w-full min-w-0 max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
      <header className="mb-5 border-b border-stone-200/80 pb-4">
        <h1 className="font-[family-name:var(--font-dashboard-heading)] text-2xl font-extrabold tracking-tight text-stone-900 sm:text-[28px]">{title}</h1>
        <p className="mt-1 text-sm text-stone-500">{subtitle}</p>
      </header>

      {error ? <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p> : null}

      <section className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#1C1917] px-5 py-4 text-white shadow-[0_8px_24px_rgba(28,25,23,0.18)]">
        <div className="min-w-0">
          <p className="text-sm font-bold">{copy.banner}</p>
          <p className="mt-0.5 text-xs text-white/60">{copy.bannerNote}</p>
        </div>
        <p className="font-[family-name:var(--font-dashboard-heading)] text-2xl font-extrabold tabular-nums text-[#E8CC8A]">{data ? money(data.outstanding) : '…'}</p>
      </section>

      <section className="mb-5 rounded-2xl border border-stone-200/80 bg-white p-4 shadow-[0_1px_3px_rgba(28,25,23,0.05)] sm:p-5">
        <h2 className="text-[15px] font-bold text-stone-900">{copy.ageingTitle}</h2>
        <p className="mt-0.5 text-xs text-stone-500">{data ? copy.ageingNote(data.outstanding) : ''}</p>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(data?.ageing || [{ label: '0–30 days' }, { label: '31–60 days' }, { label: '61–90 days' }, { label: 'Over 90 days' }]).map((bucket, index) => (
            <div key={bucket.label} className="rounded-xl border border-stone-200 bg-white px-4 py-3">
              <p className="text-xs font-medium text-stone-500">{bucket.label}</p>
              <p className={`mt-1 text-lg font-extrabold tabular-nums ${bucket.amount ? BUCKET_TONES[index] : 'text-stone-300'}`}>{money(bucket.amount || 0)}</p>
              <p className="text-[11px] text-stone-400">{bucket.share || 0}% of what is owed</p>
            </div>
          ))}
        </div>
      </section>

      <div role="tablist" className="mb-4 flex gap-1 border-b border-stone-200">
        {[['outstanding', 'Outstanding'], ['history', 'History']].map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={`-mb-px border-b-[3px] px-3 py-2.5 text-sm font-semibold ${tab === key ? `${tabAccent} text-stone-900` : 'border-transparent text-stone-500 hover:text-stone-800'}`}>
            {label}
          </button>
        ))}
      </div>

      <section className="mb-5 rounded-2xl border border-stone-200/80 bg-white p-4 shadow-[0_1px_3px_rgba(28,25,23,0.05)] sm:p-5">
        <div className="flex flex-wrap gap-1.5">
          {presetList.map((item) => (
            <button key={item.key} type="button" onClick={() => choose(item)}
              className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${preset === item.key ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'}`}>
              {item.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11.5px] text-stone-400">{copy.periodNote}</p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold text-stone-500">From
            <CalendarDateInput value={range.from} max={range.to || undefined} calendarSystem={calendarSystem} onChange={(value) => { setPreset('custom'); setRange((r) => ({ ...r, from: value })); }} className="mt-1 block h-10 w-48 rounded-lg border border-stone-300 bg-white px-3 text-sm" />
          </label>
          <span className="pb-2 text-stone-400">—</span>
          <label className="text-xs font-semibold text-stone-500">To
            <CalendarDateInput value={range.to} min={range.from || undefined} calendarSystem={calendarSystem} onChange={(value) => { setPreset('custom'); setRange((r) => ({ ...r, to: value })); }} className="mt-1 block h-10 w-48 rounded-lg border border-stone-300 bg-white px-3 text-sm" />
          </label>
        </div>
        <label className="relative mt-3 block">
          <span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.search} className="h-11 w-full rounded-xl border border-stone-300 bg-white pl-10 pr-3 text-sm" />
        </label>
      </section>

      <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[0_1px_3px_rgba(28,25,23,0.05)]">
        <h2 className="border-b border-stone-100 px-5 py-3.5 text-sm font-bold text-stone-900">
          {tab === 'outstanding' ? copy.listTitle : copy.historyTitle} ({count(tab === 'outstanding' ? outstandingRows.length : (data?.history || []).length)})
        </h2>
        {loading && !data ? <p className="px-5 py-8 text-center text-sm text-stone-400">Loading…</p> : null}
        {data && tab === 'outstanding' ? (
          outstandingRows.length ? (
            <ul className="divide-y divide-stone-100">
              {outstandingRows.map((row) => (
                <li key={row.id}>
                  <button type="button" onClick={() => setOpenId(row.id)} className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-stone-50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-stone-900">{row.name}</span>
                      <span className="block text-xs text-stone-400">{[row.phone, `${row.openBills} open ${kind === 'customer' ? 'bill' : 'invoice'}${row.openBills === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className={`hidden rounded-md px-2 py-0.5 text-[11px] font-bold sm:inline ${row.oldestDays > 90 ? 'bg-rose-50 text-rose-700' : row.oldestDays > 30 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>oldest {row.oldestDays} day{row.oldestDays === 1 ? '' : 's'}</span>
                      <span className="text-sm font-bold tabular-nums text-rose-700">{money(row.balance)}</span>
                      <Printer className="h-4 w-4 text-stone-300" aria-hidden="true" />
                      <ChevronRight className="h-4 w-4 text-stone-300" aria-hidden="true" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="px-5 py-10 text-center text-sm text-stone-400">{periodActive ? 'Nobody with a balance had activity in this period.' : copy.empty}</p>
        ) : null}
        {data && tab === 'history' ? (
          !periodActive ? <p className="px-5 py-10 text-center text-sm text-stone-400">Choose a period (Today, This Month…) to see who had ledger activity.</p>
            : data.history.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 bg-stone-50 text-[11px] font-bold uppercase tracking-[0.05em] text-stone-500">
                      <th className="px-5 py-2.5 text-left">{kind === 'customer' ? 'Customer' : 'Supplier'}</th>
                      <th className="px-4 py-2.5 text-left">Last activity</th>
                      <th className="px-4 py-2.5 text-right">Entries</th>
                      <th className="px-4 py-2.5 text-right">{kind === 'customer' ? 'Credit given' : 'Purchased'}</th>
                      <th className="px-4 py-2.5 text-right">{kind === 'customer' ? 'Paid / removed' : 'Paid'}</th>
                      <th className="px-5 py-2.5 text-right">Owed now</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {data.history.map((row) => (
                      <tr key={row.id} onClick={() => setOpenId(row.id)} className="cursor-pointer hover:bg-stone-50">
                        <td className="px-5 py-3"><span className="font-semibold text-stone-900">{row.name}</span>{row.phone ? <span className="block text-xs text-stone-400">{row.phone}</span> : null}</td>
                        <td className="px-4 py-3 text-stone-600">{fmt(row.lastActivity)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{count(row.entries)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-rose-700">{row.added ? money(row.added) : '—'}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{row.removed ? money(row.removed) : '—'}</td>
                        <td className="px-5 py-3 text-right font-bold tabular-nums text-stone-900">{money(row.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="px-5 py-10 text-center text-sm text-stone-400">No ledger activity in this period.</p>
        ) : null}
      </section>

      {openId ? <LedgerStatement kind={kind} id={openId} calendarSystem={calendarSystem} onClose={() => setOpenId(null)} onChanged={reload} /> : null}
    </main>
  );
}
