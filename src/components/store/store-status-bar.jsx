'use client';

import { fmtDate } from '@/lib/dates/display';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, DoorClosed, DoorOpen, Loader2, Lock, RefreshCw, X,
} from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import CloseStoreForm from '@/components/store/close-store-form';

const REMOVE_DESTINATIONS = [
  { value: 'CASH_RESERVE', label: 'Cash Reserve / Safe' },
  { value: 'BANK_DEPOSIT', label: 'Bank Deposit' },
  { value: 'OWNER_WITHDRAWAL', label: 'Owner Withdrawal' },
  { value: 'OTHER', label: 'Other' },
];
const ADD_SOURCES = [
  { value: 'CASH_RESERVE', label: 'Cash Reserve / Safe' },
  { value: 'BANK_WITHDRAWAL', label: 'Bank Withdrawal' },
  { value: 'OWNER_CONTRIBUTION', label: 'Owner Contribution' },
  { value: 'OTHER', label: 'Other' },
];

const FIELD = 'w-full rounded-xl border border-[#ddd5ca] bg-white px-3 py-2.5 text-sm text-[#21182f] focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-200';
const BTN = 'inline-flex h-[38px] items-center justify-center gap-2 rounded-[10px] px-3.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-stone-900/30 disabled:cursor-not-allowed disabled:opacity-60';
const BTN_PRIMARY = `${BTN} border border-stone-900 bg-stone-900 text-white hover:bg-stone-800`;
const BTN_SECONDARY = `${BTN} border border-[#e4ded6] bg-white text-[#3a342d] hover:bg-[#f7f5f2]`;
const BTN_DANGER = `${BTN} border border-[#dc2626] bg-[#dc2626] text-white hover:bg-[#b91c1c]`;

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('pos_token')}` };
}

function formatDate(iso) {
  if (!iso) return '—';
  return fmtDate(String(iso).slice(0, 10));
}

function formatTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-US', { timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit' });
}

function Modal({ title, subtitle, onClose, children, footer, width = 'max-w-lg' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className={`flex max-h-[92vh] w-full ${width} flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl`}>
        <div className="flex items-start justify-between gap-3 border-b border-[#eee8df] px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-[#17140f]">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs text-[#8a837b]">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-[#8a837b] hover:bg-[#f5f2ee]" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="border-t border-[#eee8df] px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

/** Shared starting-cash + drawer-difference block for Open / Reopen / Next Day. */
function StartingCashFields({ previousClosingCash, startingCash, setStartingCash, transfer, setTransfer, requireReconcile = true }) {
  const diff = Math.round((Number(startingCash || 0) - Number(previousClosingCash || 0)) * 100) / 100;
  const removed = requireReconcile && diff < 0;
  const added = requireReconcile && diff > 0;
  return (
    <div className="space-y-3">
      {requireReconcile ? (
        <div className="rounded-xl bg-[#faf8f5] px-3 py-2.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-[#6b6157]">Previous Closing Cash</span>
            <span className="font-bold text-[#21182f]">{formatCurrency(previousClosingCash)}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-[#9a938b]">Reference from previous close · prefilled below, editable.</p>
        </div>
      ) : (
        <div className="rounded-xl bg-[#faf8f5] px-3 py-2.5 text-[11px] text-[#9a938b]">
          First store open — enter the opening cash float in the drawer.
        </div>
      )}
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6c6175]">Starting Cash in Drawer</span>
        <input type="number" min="0" step="0.01" className={`${FIELD} text-right font-semibold`} value={startingCash}
          onChange={(event) => setStartingCash(event.target.value)} />
        <span className="mt-1 block text-[11px] text-[#9a938b]">Physical drawer money — not sales, revenue or profit.</span>
      </label>

      {removed ? (
        <div className="space-y-2 rounded-xl border border-[#f1d9d0] bg-[#fdf4f1] p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-[#b45309]">Removed Cash</span>
            <span className="font-bold text-[#b45309]">{formatCurrency(Math.abs(diff))}</span>
          </div>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6c6175]">Destination</span>
            <select className={FIELD} value={transfer.destination || ''} onChange={(event) => setTransfer({ ...transfer, destination: event.target.value })}>
              <option value="">Select destination…</option>
              {REMOVE_DESTINATIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          {transfer.destination === 'OTHER' ? (
            <input className={FIELD} placeholder="Note (required for Other)" value={transfer.note || ''} onChange={(event) => setTransfer({ ...transfer, note: event.target.value })} />
          ) : null}
        </div>
      ) : null}

      {added ? (
        <div className="space-y-2 rounded-xl border border-[#cfe8d8] bg-[#f2fbf5] p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-[#15803d]">Additional Cash</span>
            <span className="font-bold text-[#15803d]">{formatCurrency(diff)}</span>
          </div>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6c6175]">Source</span>
            <select className={FIELD} value={transfer.source || ''} onChange={(event) => setTransfer({ ...transfer, source: event.target.value })}>
              <option value="">Select source…</option>
              {ADD_SOURCES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          {transfer.source === 'OTHER' ? (
            <input className={FIELD} placeholder="Note (required for Other)" value={transfer.note || ''} onChange={(event) => setTransfer({ ...transfer, note: event.target.value })} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value, sign, tone = 'text-[#21182f]' }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-[#6b6157]">{sign ? `${sign} ` : ''}{label}</span>
      <span className={`font-semibold tabular-nums ${tone}`}>{formatCurrency(value)}</span>
    </div>
  );
}

/**
 * Store status + the Open / Reopen / Next Day / Close lifecycle actions.
 *
 * This is the ONLY place the lifecycle is driven from; the dashboards and the Opening &
 * Closing page all mount this component rather than reimplementing any of it.
 *
 *   variant="bar"     full status chips + actions (dashboard headers)
 *   variant="actions" actions only, for a page that already renders its own status panel
 */
export default function StoreStatusBar({
  onChanged,
  showManageLink = false,
  showOpeningClosingLink = true,
  variant = 'bar',
  role = 'admin',
  onStatus,
  showClose = true,
}) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // 'open' | 'reopen' | 'next-day' | 'close'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [blockers, setBlockers] = useState([]);

  // Open / Reopen / Next-day form
  const [startingCash, setStartingCash] = useState('');
  const [openingNote, setOpeningNote] = useState('');
  const [transfer, setTransfer] = useState({});

  // Close form
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/store', { cache: 'no-store', headers: authHeaders() });
      const payload = await response.json();
      if (response.ok) {
        setStatus(payload.status);
        onStatus?.(payload.status);
      }
    } catch {
      // Header status is non-critical; leave the last known state.
    } finally {
      setLoading(false);
    }
  }, [onStatus]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const previousClosingCash = Number(status?.previousClosingCash || 0);
  const suggestedStartingCash = status?.suggestedStartingCash ?? status?.previousClosingCash ?? 0;

  const openModal = (type) => {
    setError('');
    setBlockers([]);
    setTransfer({});
    setOpeningNote('');
    if (type === 'close') {
      setSummary(null);
      loadSummary();
    } else {
      setStartingCash(String(Number(suggestedStartingCash || 0).toFixed(2)));
    }
    setModal(type);
  };

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const response = await fetch('/api/store/summary', { cache: 'no-store', headers: authHeaders() });
      const payload = await response.json();
      if (response.ok) {
        setSummary(payload.summary);
        setBlockers(payload.blockers || []);
      } else {
        setError(payload.error || 'Could not load the close summary.');
      }
    } catch {
      setError('Could not load the close summary.');
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const submitOpenLike = async (action) => {
    setBusy(true);
    setError('');
    try {
      const body = { action, startingCash: Number(startingCash || 0), openingNote, transfer };
      const response = await fetch('/api/store', { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not update the store.');
      setStatus(payload.status);
      setModal(null);
      onChanged?.();
    } catch (err) {
      setError(err.message || 'Could not update the store.');
    } finally {
      setBusy(false);
    }
  };


  const pill = useMemo(() => {
    if (loading) return { dot: 'bg-[#c9c2b8]', text: 'Checking store…', icon: Loader2, spin: true };
    if (status?.state === 'OPEN') return { dot: 'bg-[#1f8a5b]', text: 'Store Open', icon: DoorOpen };
    if (status?.state === 'CLOSED_SAME_DAY') return { dot: 'bg-[#dc2626]', text: 'Store Closed', icon: DoorClosed };
    return { dot: 'bg-[#dc2626]', text: 'Store Closed', icon: Lock };
  }, [loading, status]);

  const PillIcon = pill.icon;

  return (
    <>
      <div className="print-hide flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-[#e9e3db] bg-white px-3 py-2.5">
        {variant === 'bar' ? (
          <>
            <span className="inline-flex items-center gap-2 text-sm font-bold text-[#17140f]">
              <span className={`h-2 w-2 rounded-full ${pill.dot}`} />
              <PillIcon className={`h-4 w-4 text-stone-600 ${pill.spin ? 'animate-spin' : ''}`} />
              {pill.text}
            </span>

            {status && status.state !== 'NO_DAY' ? (
              <span className="text-xs text-[#6b6157]">
                <span className="font-semibold text-[#8a837b]">Business Day</span> {formatDate(status.businessDate)}
              </span>
            ) : null}

            {status?.state === 'OPEN' ? (
              <>
                <span className="text-xs text-[#6b6157]">
                  <span className="font-semibold text-[#8a837b]">Session</span> {status.session?.sessionNumber || 1}
                </span>
                <span className="hidden text-xs text-[#6b6157] sm:inline">
                  <span className="font-semibold text-[#8a837b]">Opened</span> {formatTime(status.session?.openedAt)}
                </span>
                <span className="hidden text-xs text-[#6b6157] md:inline">
                  <span className="font-semibold text-[#8a837b]">Starting Cash</span> {formatCurrency(status.session?.startingCash)}
                </span>
                <span className="hidden text-xs text-[#6b6157] lg:inline">
                  <span className="font-semibold text-[#8a837b]">Expected Cash in Drawer</span>{' '}
                  <span className="font-bold tabular-nums text-[#17140f]">{formatCurrency(status.session?.expectedCash)}</span>
                </span>
              </>
            ) : null}

            {status?.state === 'CLOSED_SAME_DAY' && status.previousSession ? (
              <span className="hidden text-xs text-[#6b6157] sm:inline">
                <span className="font-semibold text-[#8a837b]">Last Session</span> Session {status.previousSession.sessionNumber} · Closed {formatTime(status.previousSession.closedAt)}
              </span>
            ) : null}
            {status?.state === 'CLOSED_SAME_DAY' && status.canStartNextDay === false ? (
              <span className="w-full text-xs text-[#8a5a12] sm:w-auto">{status.nextDayBlockedReason}</span>
            ) : null}
          </>
        ) : null}

        <div className={`flex flex-wrap items-center gap-2 ${variant === 'bar' ? 'ml-auto' : ''}`}>
          <button type="button" onClick={loadStatus} className="rounded-lg p-1.5 text-[#8a837b] hover:bg-[#f5f2ee]" aria-label="Refresh store status">
            <RefreshCw className="h-4 w-4" />
          </button>
          {status?.state === 'OPEN' && showClose ? (
            <button type="button" className={BTN_DANGER} onClick={() => openModal('close')}>Close Store</button>
          ) : null}
          {status?.state === 'OPEN' && !showClose ? (
            <span className="text-xs text-[#8a837b]">Count the drawer below to close the store.</span>
          ) : null}
          {status?.state === 'CLOSED_SAME_DAY' ? (
            <>
              <button type="button" className={BTN_SECONDARY} onClick={() => openModal('reopen')}>Reopen Store</button>
              {/* A business day may never be dated in the future, so the next day can only be
                  started once the Nepal calendar has moved on. */}
              <button
                type="button"
                className={BTN_PRIMARY}
                onClick={() => openModal('next-day')}
                disabled={status.canStartNextDay === false}
                title={status.nextDayBlockedReason || undefined}
              >
                Start Next Business Day
              </button>
            </>
          ) : null}
          {status?.state === 'NO_DAY' ? (
            <button type="button" className={BTN_PRIMARY} onClick={() => openModal('open')}>Open Store</button>
          ) : null}
          {showOpeningClosingLink ? (
            <Link href="/store/opening-closing" className={BTN_SECONDARY}>Opening &amp; Closing</Link>
          ) : null}
          {showManageLink && role === 'admin' ? (
            <Link href="/dashboard/admin/business-days" className={BTN_SECONDARY}>Business Day History</Link>
          ) : null}
        </div>
      </div>

      {modal === 'open' || modal === 'reopen' || modal === 'next-day' ? (
        <Modal
          title={modal === 'open' ? 'Open Store' : modal === 'reopen' ? 'Reopen Store — Same Business Day' : 'Start Next Business Day'}
          subtitle={modal === 'next-day'
            ? `Closes ${formatDate(status?.businessDate)} and starts ${formatDate(status?.nextBusinessDate)}. Historical data stays unchanged.`
            : `Business Date ${formatDate(status?.businessDate)}`}
          onClose={() => (busy ? null : setModal(null))}
          footer={(
            <div className="flex justify-end gap-2">
              <button type="button" className={BTN_SECONDARY} onClick={() => setModal(null)} disabled={busy}>Cancel</button>
              <button type="button" className={BTN_PRIMARY} disabled={busy}
                onClick={() => submitOpenLike(modal)}>
                {busy ? 'Working…' : modal === 'open' ? 'Open Store' : modal === 'reopen' ? 'Reopen Store' : 'Start New Business Day'}
              </button>
            </div>
          )}
        >
          {modal === 'next-day' ? (
            <div className="mb-3 flex items-start gap-2 rounded-xl bg-[#fff7ed] px-3 py-2.5 text-xs text-[#8a5a12]">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
              <span>Starting {formatDate(status?.nextBusinessDate)} begins a fresh operational reporting day. Current-day metrics reset to zero; nothing is deleted.</span>
            </div>
          ) : null}
          <StartingCashFields
            previousClosingCash={previousClosingCash}
            startingCash={startingCash}
            setStartingCash={setStartingCash}
            transfer={transfer}
            setTransfer={setTransfer}
            requireReconcile={modal !== 'open' || Boolean(status?.previousBusinessDate)}
          />
          <label className="mt-3 block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6c6175]">Opening Note (optional)</span>
            <input className={FIELD} value={openingNote} onChange={(event) => setOpeningNote(event.target.value)} />
          </label>
          {error ? <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p> : null}
        </Modal>
      ) : null}

      {modal === 'close' ? (
        <Modal
          title="Close Store"
          subtitle={`Closes Session ${status?.session?.sessionNumber || 1} of Business Day ${formatDate(status?.businessDate)}. The business day stays open for a same-day reopen.`}
          width="max-w-5xl"
          onClose={() => setModal(null)}
        >
          {summaryLoading ? (
            <div className="flex items-center justify-center py-10 text-[#8a837b]"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading summary…</div>
          ) : summary ? (
            <CloseStoreForm
              summary={summary}
              blockers={blockers}
              role={role}
              sessionLabel={`Store session ${status?.session?.sessionNumber || 1}`}
              onCancel={() => setModal(null)}
              onClosed={(payload) => {
                setStatus(payload.status);
                onStatus?.(payload.status);
                setModal(null);
                onChanged?.();
              }}
            />
          ) : (
            <p className="py-6 text-center text-sm text-[#8a837b]">{error || 'No open session.'}</p>
          )}
        </Modal>
      ) : null}
    </>
  );
}
