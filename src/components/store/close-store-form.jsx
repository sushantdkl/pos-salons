'use client';

/**
 * CLOSE STORE — the one close flow, used inline on Opening & Closing and inside the store
 * bar's Close modal. Expected Cash and its calculation come from the server
 * (computeExpectedCash); this form only counts notes. The server re-sums the notes and
 * re-computes Expected Cash when it persists the close, so the browser's arithmetic is
 * display-only.
 */

import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, Eraser, Lock } from 'lucide-react';
import { emptyDenominations } from '@/lib/business-day/denominations';
import { erpFetch } from '@/components/erp/use-report';
import { money, StatusBadge } from '@/components/erp';
import { DenominationCounter, denominationTotal } from './denomination-counter';

function CalcLine({ label, value, sign, muted = false, strong = false }) {
  const zero = !Number(value);
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${strong ? 'mt-1 border-t border-white/20 pt-2.5' : ''}`}>
      <span className={`text-[13px] ${strong ? 'font-bold text-white' : muted || zero ? 'text-stone-500' : 'text-stone-300'}`}>{label}</span>
      <span className={`shrink-0 text-[13.5px] tabular-nums ${strong ? 'text-base font-extrabold text-white' : zero ? 'text-stone-500' : sign === '−' ? 'font-semibold text-rose-300' : sign === '+' ? 'font-semibold text-emerald-300' : 'font-semibold text-white'}`}>
        {sign ? `${sign} ` : ''}{money(value)}
      </span>
    </div>
  );
}

export function ExpectedCashCalculation({ expected, isAdmin, defaultOpen = true }) {
  if (!expected) return null;
  return (
    <details open={defaultOpen} className="group mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.06em] text-stone-300 [&::-webkit-details-marker]:hidden">
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
        Cash calculation
      </summary>
      <div className="mt-1">
        <CalcLine label="Starting cash" value={expected.startingCash} />
        <CalcLine label="Cash sales" value={expected.cashCollections} sign="+" />
        <CalcLine label="Credit collected in cash" value={expected.creditCollectionsCash} sign="+" />
        <CalcLine label="Other cash in" value={expected.otherCashIn} sign="+" />
        {isAdmin && expected.operatingExpensesCash !== undefined ? (
          <>
            <CalcLine label="Cash expenses" value={expected.operatingExpensesCash} sign="−" />
            <CalcLine label="Salary / advances paid in cash" value={expected.salaryCash} sign="−" />
          </>
        ) : (
          <CalcLine label="Cash expenses & salary" value={expected.cashExpenses} sign="−" />
        )}
        <CalcLine label="Cash to savings / transfers" value={expected.cashSavingsOut} sign="−" />
        <CalcLine label="Cash refunds (voids)" value={expected.cashRefunds} sign="−" />
        <CalcLine label="Other cash out" value={expected.otherCashOut} sign="−" />
        <CalcLine label="Expected cash" value={expected.expectedCash} strong />
      </div>
    </details>
  );
}

export default function CloseStoreForm({ summary, blockers = [], role, sessionLabel, onClosed, onCancel }) {
  const isAdmin = role === 'admin';
  const expected = summary?.expected;
  const [counts, setCounts] = useState(emptyDenominations);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [closingNote, setClosingNote] = useState('');
  const [force, setForce] = useState(false);
  const [forceReason, setForceReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [serverBlockers, setServerBlockers] = useState([]);

  const allBlockers = serverBlockers.length ? serverBlockers : blockers;
  const counted = useMemo(() => denominationTotal(counts), [counts]);
  const anyCounted = Object.values(counts).some((value) => Number(value) > 0);
  const hasCount = anyCounted || confirmEmpty;
  const difference = expected ? Math.round((counted - Number(expected.expectedCash || 0)) * 100) / 100 : 0;
  const state = difference === 0 ? 'MATCHED' : difference < 0 ? 'SHORT' : 'OVER';

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const payload = await erpFetch('/api/store', {
        method: 'POST',
        body: { action: 'close', denominations: counts, countedCash: counted, closingNote, force, forceReason },
      });
      onClosed?.(payload);
    } catch (closeError) {
      if (closeError.code === 'CLOSE_BLOCKED') {
        setServerBlockers(closeError.data?.blockers || []);
        setError('Resolve the pending items below, or force close.');
      } else {
        setError(closeError.message || 'Could not close the store.');
      }
    } finally {
      setBusy(false);
    }
  };

  if (!expected) return null;

  return (
    <div className="space-y-3">
      <section aria-label="Cash reconciliation" className="rounded-2xl bg-stone-900 p-3 text-white sm:p-4">
        <p className="mb-3 flex items-center gap-2 text-[13px] font-bold text-stone-200">
          <Lock className="h-4 w-4 text-amber-400" aria-hidden="true" />
          {sessionLabel || 'Store session'} · Cash reconciliation
        </p>
        <div className="grid gap-3 lg:grid-cols-5">
          <div className="rounded-xl border border-white/10 bg-stone-950/40 p-4 lg:col-span-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-amber-300">Expected cash</p>
            <p className="mt-1 text-3xl font-extrabold tabular-nums">{money(expected.expectedCash)}</p>
            <p className="mt-1 text-xs text-stone-400">Physical drawer only. Online / QR ({money(expected.qrCollections)}) is not drawer cash.</p>
            <ExpectedCashCalculation expected={expected} isAdmin={isAdmin} />
          </div>

          <div className="rounded-xl bg-white p-4 text-stone-900 lg:col-span-3">
            <div className="flex items-end justify-between gap-3 border-b-2 border-stone-900 pb-2">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-stone-500">Counted cash</p>
                <p className="text-3xl font-extrabold tabular-nums">{money(counted)}</p>
              </div>
              <button
                type="button"
                onClick={() => { setCounts(emptyDenominations()); setConfirmEmpty(false); }}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-stone-500 hover:bg-stone-100"
              >
                <Eraser className="h-3.5 w-3.5" aria-hidden="true" /> Clear
              </button>
            </div>
            <p className="my-2 text-xs text-stone-500">Enter how many notes you have of each value. The total is calculated for you.</p>
            <DenominationCounter counts={counts} onChange={(next) => { setCounts(next); setConfirmEmpty(false); }} disabled={busy} />
            {!anyCounted ? (
              <label className="mt-2 flex items-center gap-2 text-xs text-stone-600">
                <input type="checkbox" checked={confirmEmpty} onChange={(event) => setConfirmEmpty(event.target.checked)} />
                The drawer is empty (count Rs 0)
              </label>
            ) : null}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-white/10">
          {[
            ['Expected', money(expected.expectedCash)],
            ['Counted', hasCount ? money(counted) : '—'],
            ['Difference', hasCount ? `${difference > 0 ? '+' : ''}${money(difference)}` : '—'],
          ].map(([label, value]) => (
            <div key={label} className="bg-stone-900 px-3 py-2.5">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-stone-400">{label}</p>
              <p className={`mt-0.5 truncate text-base font-extrabold tabular-nums sm:text-lg ${label === 'Difference' && hasCount ? (state === 'MATCHED' ? 'text-emerald-300' : state === 'SHORT' ? 'text-rose-300' : 'text-amber-300') : 'text-white'}`}>
                {value}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs text-stone-300">
          {hasCount ? <StatusBadge status={state} /> : <span>Count the drawer to see MATCHED / SHORT / OVER.</span>}
        </div>
      </section>

      {allBlockers.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
          <p className="flex items-center gap-2 text-sm font-bold text-rose-800">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Pending items block a normal close
          </p>
          {allBlockers.map((blocker) => <p key={blocker.code} className="text-sm text-rose-800">• {blocker.message}</p>)}
          {isAdmin ? (
            <>
              <label className="flex items-center gap-2 text-sm text-rose-800">
                <input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} />
                Force close anyway (admin only)
              </label>
              {force ? (
                <input
                  className="h-10 w-full rounded-lg border border-rose-300 bg-white px-3 text-sm"
                  placeholder="Reason for force close (required)"
                  value={forceReason}
                  onChange={(event) => setForceReason(event.target.value)}
                />
              ) : null}
            </>
          ) : (
            <p className="text-sm text-rose-800">Ask an admin to force close if these items cannot be resolved.</p>
          )}
        </div>
      ) : null}

      <label className="block">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.06em] text-stone-500">Closing note (optional)</span>
        <input
          className="h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm"
          value={closingNote}
          onChange={(event) => setClosingNote(event.target.value)}
          placeholder={state === 'MATCHED' ? '' : 'Explain the difference, if known'}
        />
      </label>

      {error ? <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p> : null}

      <div className="flex flex-wrap justify-end gap-2">
        {onCancel ? (
          <button type="button" onClick={onCancel} disabled={busy} className="min-h-11 rounded-lg border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700 hover:bg-stone-50">
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          onClick={submit}
          disabled={busy || !hasCount || (force && !forceReason.trim())}
          className="min-h-11 rounded-lg bg-rose-600 px-5 text-sm font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Closing…' : allBlockers.length && force ? 'Force close store' : `Close store with ${hasCount ? money(counted) : 'count'}`}
        </button>
      </div>
    </div>
  );
}
