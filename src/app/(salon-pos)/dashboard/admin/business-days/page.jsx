'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Printer, RefreshCw } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';

const CARD = 'rounded-2xl border border-[#ece7e1] bg-white shadow-[0_1px_2px_rgba(40,30,20,0.04)]';

function formatDate(iso) {
  if (!iso) return '—';
  const [year, month, day] = String(iso).slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

function formatTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function DiffBadge({ value }) {
  const state = value === 0 ? 'MATCHED' : value < 0 ? 'SHORT' : 'OVER';
  const tone = state === 'MATCHED'
    ? 'bg-[#eaf8ef] text-[#15803d]'
    : state === 'SHORT' ? 'bg-[#fdecec] text-[#dc2626]' : 'bg-[#fef4e6] text-[#b45309]';
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold ${tone}`}>
      {state}{value !== 0 ? ` ${formatCurrency(Math.abs(value))}` : ''}
    </span>
  );
}

function StatusBadge({ status }) {
  const open = status === 'OPEN';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-xs font-semibold ${open ? 'bg-[#eaf8ef] text-[#15803d]' : 'bg-[#f1eef6] text-[#5f5570]'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${open ? 'bg-[#1f8a5b]' : 'bg-[#9a938b]'}`} />
      {open ? 'Open' : 'Closed'}
    </span>
  );
}

export default function BusinessDayHistoryPage() {
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/store/history', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not load business day history');
      setDays(payload.days || []);
    } catch (err) {
      setError(err.message || 'Could not load business day history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-[#f7f5f2] px-3 py-4 text-[#21182f] sm:px-5 lg:px-7 lg:py-6">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-4 sm:gap-5">
        <header className="flex flex-col gap-3 border-b border-[#e9e3db] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-[-0.02em] text-[#17140f] sm:text-[28px]">
              <CalendarDays className="h-6 w-6 text-[#6b46e5]" /> Business Day History
            </h1>
            <p className="mt-1 text-sm text-[#7a736b]">
              Sales aggregate across all of a day&apos;s store sessions. Cash balances are per session: opening cash is the first
              session&apos;s float and final expected / counted cash are the last session&apos;s figures — never a sum. Historical records are never altered.
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => window.print()} className="inline-flex h-[38px] items-center gap-2 rounded-[10px] border border-[#e4ded6] bg-white px-3.5 text-sm font-semibold text-[#3a342d] hover:bg-[#f7f5f2]">
              <Printer className="h-4 w-4" /> Print
            </button>
            <button type="button" onClick={load} className="inline-flex h-[38px] items-center gap-2 rounded-[10px] border border-[#e4ded6] bg-white px-3.5 text-sm font-semibold text-[#3a342d] hover:bg-[#f7f5f2]">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>
        </header>

        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div> : null}

        {/* Legacy rows only — creating a future-dated business day is blocked now. Their
            transactions fall outside calendar-window reports until the calendar catches up. */}
        {days.some((day) => day.futureDated) ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-semibold">
              {days.filter((day) => day.futureDated).length} business day(s) are dated in the future
              ({days.filter((day) => day.futureDated).map((day) => formatDate(day.businessDate)).join(', ')}).
            </p>
            <p className="mt-1 text-[13px]">
              Their sales report under that business day but stay outside Last 3 Days / Last 7 Days / This Month
              until the Nepal calendar reaches that date. Run
              <span className="font-mono"> docs/migrations/2026-08-11-fix-future-business-days.sql </span>
              to clear any that never traded; days that did trade are left alone because re-dating them would move revenue between periods.
            </p>
          </div>
        ) : null}

        <section className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-[#eee8df] bg-[#fbfaf8] text-[11px] font-bold uppercase tracking-[0.04em] text-[#6c6175]">
                  <th className="px-4 py-3">Business Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Sessions</th>
                  <th className="px-4 py-3">Opened</th>
                  <th className="px-4 py-3">Closed</th>
                  <th className="px-4 py-3">Opened By</th>
                  <th className="px-4 py-3">Closed By</th>
                  <th className="px-4 py-3 text-right">Opening Cash</th>
                  <th className="px-4 py-3 text-right">Final Expected</th>
                  <th className="px-4 py-3 text-right">Final Counted</th>
                  <th className="px-4 py-3">Difference</th>
                  <th className="px-4 py-3 text-right">Net Sales</th>
                  <th className="px-4 py-3 text-right">Bills</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0ebe4]">
                {loading ? (
                  <tr><td colSpan={13} className="px-4 py-10 text-center text-[#8a837b]">Loading…</td></tr>
                ) : days.length === 0 ? (
                  <tr><td colSpan={13} className="px-4 py-10 text-center text-[#8a837b]">No business days recorded yet.</td></tr>
                ) : days.map((day) => (
                  <tr key={day.id} className="align-top hover:bg-[#fbf8ff]">
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-[#21182f]">
                      {formatDate(day.businessDate)}
                      {day.futureDated ? <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">FUTURE</span> : null}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={day.status} /></td>
                    <td className="px-4 py-3 text-right">{day.sessions}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-[#62576b]">{formatTime(day.openedAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-[#62576b]">{formatTime(day.closedAt)}</td>
                    <td className="px-4 py-3 text-[#62576b]">{day.openedBy || '—'}</td>
                    <td className="px-4 py-3 text-[#62576b]">{day.closedBy || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatCurrency(day.startingCash)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                      {day.finalExpectedCash === null ? <span className="text-xs text-[#9a938b]">In progress</span> : formatCurrency(day.finalExpectedCash)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                      {day.finalCountedCash === null ? <span className="text-xs text-[#9a938b]">—</span> : formatCurrency(day.finalCountedCash)}
                    </td>
                    <td className="px-4 py-3">{day.status === 'OPEN' ? <span className="text-xs text-[#9a938b]">In progress</span> : <DiffBadge value={day.difference} />}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-[#6f3cc3]">{formatCurrency(day.netSales)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{day.bills}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
