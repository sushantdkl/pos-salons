'use client';

/**
 * Commission snapshot for a COMMISSION-BASED staff member on the advance screens: what they
 * earned today, yesterday, this month, last month, all time or in any range, and how much can
 * be advanced now (earned commission not yet settled, less advances not yet recovered).
 */

import { useEffect, useState } from 'react';
import { money } from '@/components/erp';
import { erpFetch } from '@/components/erp/use-report';
import { DateInput } from '@/components/shared/calendar-date-input';
import { fmtDate, fmtMonth } from '@/lib/dates/display';

const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'month', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'allTime', label: 'Till date' },
  { key: 'custom', label: 'Custom' },
];

export function CommissionPanel({ staffId, onAllowance }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [view, setView] = useState('month');
  const [range, setRange] = useState({ start: '', end: '' });
  const [custom, setCustom] = useState(null);

  useEffect(() => {
    if (!staffId) return;
    let live = true;
    setData(null); setError(''); setCustom(null);
    erpFetch(`/api/payroll/advances?staffId=${staffId}`)
      .then((json) => { if (live) { setData(json); onAllowance?.(json.summary.allowance); } })
      .catch((loadError) => { if (live) setError(loadError.message); });
    return () => { live = false; };
    // onAllowance is a setter from the parent; re-running on its identity would refetch forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId]);

  const applyCustom = async () => {
    if (!range.start || !range.end || range.start > range.end) return;
    try {
      const json = await erpFetch(`/api/payroll/advances?staffId=${staffId}&period=custom&startDate=${range.start}&endDate=${range.end}`);
      setCustom(json.summary.selected);
    } catch (loadError) { setError(loadError.message); }
  };

  if (error) return <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>;
  if (!data) return <p className="rounded-xl bg-stone-50 p-3 text-sm text-stone-400">Loading commission…</p>;
  const s = data.summary;
  const shown = view === 'custom' ? custom : s[view];

  return (
    <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.06em] text-violet-800">Commission earned · {data.commissionPercentage}%</p>
      </div>
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Commission period">
        {PRESETS.map((preset) => (
          <button key={preset.key} type="button" role="tab" aria-selected={view === preset.key} onClick={() => setView(preset.key)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${view === preset.key ? 'border-violet-700 bg-violet-700 text-white' : 'border-violet-200 bg-white text-violet-800 hover:bg-violet-50'}`}>
            {preset.label}
          </button>
        ))}
      </div>
      {view === 'custom' ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold text-stone-500">From
            <DateInput value={range.start} max={range.end || undefined} onChange={(event) => setRange((r) => ({ ...r, start: event.target.value }))} className="mt-1 block h-9 rounded-lg border border-stone-300 bg-white px-2 text-sm" />
          </label>
          <label className="text-xs font-semibold text-stone-500">To
            <DateInput value={range.end} min={range.start || undefined} onChange={(event) => setRange((r) => ({ ...r, end: event.target.value }))} className="mt-1 block h-9 rounded-lg border border-stone-300 bg-white px-2 text-sm" />
          </label>
          <button type="button" onClick={applyCustom} disabled={!range.start || !range.end || range.start > range.end} className="h-9 rounded-lg bg-stone-900 px-3 text-xs font-bold text-white disabled:opacity-40">Show</button>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-white p-2.5 ring-1 ring-violet-100">
          <p className="text-[11px] font-semibold text-stone-500">Commission</p>
          <p className="text-lg font-extrabold tabular-nums text-violet-800">{shown ? money(shown.commission) : '—'}</p>
        </div>
        <div className="rounded-lg bg-white p-2.5 ring-1 ring-violet-100">
          <p className="text-[11px] font-semibold text-stone-500">Services done</p>
          <p className="text-lg font-extrabold tabular-nums text-stone-900">{shown ? shown.services : '—'}</p>
        </div>
      </div>
      <dl className="space-y-1 rounded-lg bg-white p-2.5 text-sm ring-1 ring-violet-100">
        <div className="flex justify-between gap-2"><dt className="text-stone-600">Unpaid commission <span className="text-xs text-stone-400">since {fmtDate(s.unsettledFrom)}</span></dt><dd className="font-semibold tabular-nums">{money(s.unsettledCommission)}</dd></div>
        {s.pendingSettlement > 0 ? <div className="flex justify-between gap-2"><dt className="text-stone-600">Still owed on earlier settlements</dt><dd className="font-semibold tabular-nums">{money(s.pendingSettlement)}</dd></div> : null}
        <div className="flex justify-between gap-2"><dt className="text-stone-600">Advances not yet recovered</dt><dd className="font-semibold tabular-nums text-amber-700">− {money(s.outstandingAdvance)}</dd></div>
        <div className="flex justify-between gap-2 border-t border-dashed border-violet-200 pt-1"><dt className="font-bold text-stone-900">Can advance now{s.ceilingPercent < 100 ? ` (${s.ceilingPercent}%)` : ''}</dt><dd className="font-extrabold tabular-nums text-emerald-700">{money(s.allowance)}</dd></div>
      </dl>
      <p className="text-[11px] text-stone-500">
        {s.lastSettledMonth ? `Last settled month: ${fmtMonth(s.lastSettledMonth)}. ` : 'No settlement recorded yet, so only this month counts. '}
        The advance is deducted at the next monthly settlement; anything more than that month&apos;s commission carries forward.
      </p>
    </div>
  );
}
