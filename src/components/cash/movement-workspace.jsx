'use client';

/**
 * Cash In / Cash Out (kind="cash") and Cash Exchange (kind="exchange").
 *
 * Neither is a sale or an expense. Cash In adds to business cash and Expected Cash in Drawer,
 * Cash Out removes it; an exchange moves money between cash and online and only its charge is
 * income. Entries are never edited or deleted — a mistake is reversed with a reason, and the
 * reversal is posted in the session open now so a closed day never changes.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Banknote, QrCode, RotateCcw, Search, Store } from 'lucide-react';
import { AlertBanner, ErpButton, PeriodFilter, StatusBadge, money } from '@/components/erp';
import { erpFetch, usePeriod } from '@/components/erp/use-report';
import { fmtDate, fmtDateTime } from '@/lib/dates/display';
import { DetailCard, DetailRow, SidePanel } from '@/components/shared/side-panel';
import { Pager } from '@/components/shared/pager';

const FIELD = 'mt-1 block h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-stone-500 focus:ring-2 focus:ring-stone-900/10';
const LABEL = 'block text-xs font-bold uppercase tracking-[0.04em] text-stone-500';
const num = (value) => Math.round(Number(value || 0) * 100) / 100;

const TYPE_LABEL = { CASH_IN: 'Cash In', CASH_OUT: 'Cash Out', EXCHANGE: 'Exchange' };

function statusBadge(row) {
  if (row.status === 'REVERSED') return <StatusBadge status="REVERSED" label="Reversed" tone="neutral" />;
  if (row.status === 'REVERSAL') return <StatusBadge status="REVERSAL" label="Correction" tone="cash" />;
  return <StatusBadge status="ACTIVE" label="Recorded" tone="inflow" />;
}

function Signed({ value, tone }) {
  if (!value) return <span className="text-stone-300">—</span>;
  const cls = value < 0 ? 'text-stone-500 line-through decoration-stone-300' : tone;
  return <span className={`font-semibold tabular-nums ${cls}`}>{money(value)}</span>;
}

/* ------------------------------------------------------------ detail panel */

export function MovementDetailPanel({ id, onClose, onChanged, canReverse = true }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [reversing, setReversing] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setData(await erpFetch(`/api/cash/movements?id=${id}`)); } catch (loadError) { setError(loadError.message); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const m = data?.movement;
  const partner = data?.partner;
  const reverse = async () => {
    setBusy(true); setError('');
    try {
      await erpFetch('/api/cash/movements', { method: 'PATCH', body: { id, reason } });
      setReversing(false); setReason('');
      await load();
      onChanged?.();
    } catch (reverseError) { setError(reverseError.message); } finally { setBusy(false); }
  };

  return (
    <SidePanel
      eyebrow={m ? `${TYPE_LABEL[m.type]} details` : 'Details'}
      icon={m?.type === 'EXCHANGE' ? ArrowLeftRight : m?.type === 'CASH_OUT' ? ArrowUpRight : ArrowDownLeft}
      title={m ? `${m.status === 'REVERSAL' ? '−' : ''}${money(m.amount)}` : '…'}
      subtitle={m ? `${m.reasonLabel} · ${fmtDateTime(m.createdAt)}${m.createdBy ? ` · by ${m.createdBy}` : ''}` : ''}
      badge={m ? statusBadge(m) : null}
      onClose={onClose}
      footer={m && canReverse && m.status === 'ACTIVE' ? (
        reversing ? (
          <div className="space-y-2">
            <label className={LABEL}>Why reverse this entry? *
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} className={`${FIELD} h-auto py-2`} placeholder="e.g. Entered twice by mistake" />
            </label>
            <div className="flex justify-end gap-2">
              <ErpButton onClick={() => setReversing(false)} disabled={busy}>Keep it</ErpButton>
              <ErpButton variant="danger" icon={RotateCcw} onClick={reverse} disabled={busy || !reason.trim()}>{busy ? 'Reversing…' : 'Reverse entry'}</ErpButton>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-stone-500">Entries are never deleted. A reversal is posted in today&apos;s open session.</p>
            <ErpButton icon={RotateCcw} onClick={() => setReversing(true)}>Reverse</ErpButton>
          </div>
        )
      ) : null}
    >
      {error ? <p className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
      {!m && !error ? <p className="py-10 text-center text-sm text-stone-400">Loading…</p> : null}
      {m ? (
        <div className="space-y-4">
          {m.status === 'REVERSED' && partner ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Reversed {fmtDateTime(partner.createdAt)}{partner.createdBy ? ` by ${partner.createdBy}` : ''}. Reason: {partner.note}
            </p>
          ) : null}
          {m.status === 'REVERSAL' && partner ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Correction of entry #{partner.id} ({partner.reasonLabel}, {money(partner.amount)} on {fmtDate(partner.date)}).
            </p>
          ) : null}
          <DetailCard title="Money moved">
            <DetailRow label="Cash in" value={money(m.cashIn)} tone={m.cashIn > 0 ? 'text-emerald-700' : ''} />
            <DetailRow label="Cash out" value={money(m.cashOut)} tone={m.cashOut > 0 ? 'text-rose-700' : ''} />
            {m.type === 'EXCHANGE' ? (
              <>
                <DetailRow label="Online in" value={money(m.onlineIn)} tone={m.onlineIn > 0 ? 'text-sky-700' : ''} />
                <DetailRow label="Online out" value={money(m.onlineOut)} tone={m.onlineOut > 0 ? 'text-rose-700' : ''} />
                <DetailRow label="Charge kept (fee income)" value={money(m.feeIncome)} strong />
              </>
            ) : null}
          </DetailCard>
          <DetailCard title="Record">
            <DetailRow label="Entry" value={`#${m.id}`} />
            <DetailRow label="Type" value={TYPE_LABEL[m.type]} />
            <DetailRow label="Reason" value={m.reasonLabel} />
            <DetailRow label="Business day" value={m.businessDate ? fmtDate(m.businessDate) : fmtDate(m.date)} />
            <DetailRow label="Store session" value={m.sessionNumber ? `Session ${m.sessionNumber}` : '—'} />
            <DetailRow label="Recorded by" value={m.createdBy || '—'} />
            <DetailRow label="Recorded at" value={fmtDateTime(m.createdAt)} />
            {m.referenceNumber ? <DetailRow label="Reference" value={m.referenceNumber} /> : null}
          </DetailCard>
          {m.note ? (
            <DetailCard title="Note"><p className="py-1 text-sm text-stone-800">{m.note}</p></DetailCard>
          ) : null}
          <p className="text-xs text-stone-500">
            {m.type === 'EXCHANGE'
              ? 'An exchange is not a sale. Cash and online balances move; only the charge counts as income.'
              : 'Cash In / Out is not a sale or an expense. It only changes business cash and Expected Cash in Drawer.'}
          </p>
        </div>
      ) : null}
    </SidePanel>
  );
}

/* ------------------------------------------------------------------- forms */

function ReasonChips({ options, value, onChange }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-2">
      {options.map((option) => (
        <button key={option.value} type="button" onClick={() => onChange(option.value)} aria-pressed={value === option.value}
          className={`min-h-10 rounded-full border px-4 text-sm font-semibold transition ${value === option.value ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 bg-white text-stone-700 hover:border-stone-400'}`}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function CashForm({ type, options, drawer, onDone, onCancel }) {
  const [form, setForm] = useState({ reason: options[0]?.value || '', amount: '', note: '', referenceNumber: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const key = useRef(null);
  const isIn = type === 'CASH_IN';
  const amount = num(form.amount);
  const after = drawer?.open ? num(drawer.expectedCash + (isIn ? amount : -amount)) : null;

  const submit = async () => {
    setBusy(true); setError('');
    if (!key.current) key.current = crypto.randomUUID();
    try {
      await erpFetch('/api/cash/movements', { method: 'POST', headers: { 'Idempotency-Key': key.current }, body: { type, ...form, amount } });
      key.current = null;
      onDone(`${isIn ? 'Cash In' : 'Cash Out'} of ${money(amount)} recorded.`);
    } catch (submitError) { setError(submitError.message); } finally { setBusy(false); }
  };

  return (
    <SidePanel
      eyebrow={isIn ? 'Cash In' : 'Cash Out'}
      icon={isIn ? ArrowDownLeft : ArrowUpRight}
      title={isIn ? 'Add cash to the drawer' : 'Take cash out of the drawer'}
      subtitle="Not a sale and not an expense — it only changes business cash."
      onClose={onCancel}
      footer={(
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-stone-500">
            {after !== null ? <>Drawer after: <strong className={after < 0 ? 'text-rose-700' : 'text-stone-900'}>{money(after)}</strong></> : 'Store is closed'}
          </div>
          <div className="flex gap-2">
            <ErpButton onClick={onCancel} disabled={busy}>Cancel</ErpButton>
            <button type="button" onClick={submit} disabled={busy || amount <= 0 || !form.reason || !form.note.trim() || !drawer?.open}
              className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-bold text-white disabled:opacity-50 ${isIn ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-rose-600 hover:bg-rose-700'}`}>
              {busy ? 'Saving…' : isIn ? 'Record Cash In' : 'Record Cash Out'}
            </button>
          </div>
        </div>
      )}
    >
      <div className="space-y-5">
        {error ? <AlertBanner tone="outflow">{error}</AlertBanner> : null}
        <div>
          <span className={LABEL}>{isIn ? 'Where is the cash coming from?' : 'Where is the cash going?'} *</span>
          <ReasonChips options={options} value={form.reason} onChange={(reason) => setForm((f) => ({ ...f, reason }))} />
        </div>
        <label className={LABEL}>Amount *
          <div className="relative mt-1">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-stone-400">Rs</span>
            <input autoFocus type="number" min="0.01" step="0.01" inputMode="decimal" value={form.amount} onChange={(event) => setForm((f) => ({ ...f, amount: event.target.value }))}
              className="block h-14 w-full rounded-xl border border-stone-300 bg-white pl-12 pr-4 text-2xl font-extrabold tabular-nums text-stone-950 outline-none focus:border-stone-500 focus:ring-2 focus:ring-stone-900/10" placeholder="0.00" />
          </div>
        </label>
        {!isIn && drawer?.open ? <p className="-mt-3 text-xs text-stone-500">Drawer holds {money(drawer.expectedCash)} right now.</p> : null}
        <label className={LABEL}>Note — who and why *
          <textarea value={form.note} onChange={(event) => setForm((f) => ({ ...f, note: event.target.value }))} rows={3} className={`${FIELD} h-auto py-2`} placeholder={isIn ? 'e.g. Owner brought change for the day' : 'e.g. Owner took cash for personal use'} />
        </label>
        <label className={LABEL}>Reference (optional)
          <input value={form.referenceNumber} onChange={(event) => setForm((f) => ({ ...f, referenceNumber: event.target.value }))} className={FIELD} placeholder="Bank slip / voucher no." />
        </label>
      </div>
    </SidePanel>
  );
}

function ExchangeForm({ drawer, onDone }) {
  const [form, setForm] = useState({ direction: 'ONLINE_TO_CASH', amount: '', charge: '', note: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const key = useRef(null);
  const amount = num(form.amount);
  const charge = num(form.charge);
  const payout = num(amount - charge);
  const toCash = form.direction === 'ONLINE_TO_CASH';
  const valid = amount > 0 && charge >= 0 && charge < amount && drawer?.open;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true); setError('');
    if (!key.current) key.current = crypto.randomUUID();
    try {
      await erpFetch('/api/cash/movements', { method: 'POST', headers: { 'Idempotency-Key': key.current }, body: { type: 'EXCHANGE', ...form, amount, charge } });
      key.current = null;
      setForm((f) => ({ ...f, amount: '', charge: '', note: '' }));
      onDone(`Exchange recorded: received ${money(amount)} ${toCash ? 'online' : 'cash'}, paid out ${money(payout)} ${toCash ? 'cash' : 'online'}.`);
    } catch (submitError) { setError(submitError.message); } finally { setBusy(false); }
  };

  const Side = ({ icon: Icon, label, value, tone }) => (
    <div className={`flex-1 rounded-xl border p-3 ${tone}`}>
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide opacity-80"><Icon className="h-3.5 w-3.5" />{label}</p>
      <p className="mt-1 text-xl font-extrabold tabular-nums">{money(value)}</p>
    </div>
  );

  return (
    <form onSubmit={submit} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
      {error ? <div className="mb-4"><AlertBanner tone="outflow">{error}</AlertBanner></div> : null}
      <span className={LABEL}>What is the customer doing?</span>
      <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
        {[
          { value: 'ONLINE_TO_CASH', title: 'Pays online, takes cash', note: 'Online goes up · cash goes down', icon: QrCode },
          { value: 'CASH_TO_ONLINE', title: 'Gives cash, takes online', note: 'Cash goes up · online goes down', icon: Banknote },
        ].map((option) => {
          const active = form.direction === option.value;
          return (
            <button key={option.value} type="button" onClick={() => setForm((f) => ({ ...f, direction: option.value }))} aria-pressed={active}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${active ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-800 hover:border-stone-300'}`}>
              <option.icon className={`h-5 w-5 shrink-0 ${active ? 'text-[#E9C77B]' : 'text-stone-500'}`} />
              <span><span className="block text-sm font-bold">{option.title}</span><span className={`block text-xs ${active ? 'text-stone-300' : 'text-stone-500'}`}>{option.note}</span></span>
            </button>
          );
        })}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className={LABEL}>Amount received *
          <input type="number" min="0.01" step="0.01" inputMode="decimal" value={form.amount} onChange={(event) => setForm((f) => ({ ...f, amount: event.target.value }))} className={FIELD} placeholder="0.00" />
        </label>
        <label className={LABEL}>Charge (optional)
          <input type="number" min="0" step="0.01" inputMode="decimal" value={form.charge} onChange={(event) => setForm((f) => ({ ...f, charge: event.target.value }))} className={FIELD} placeholder="0" />
        </label>
        <label className={LABEL}>Note
          <input value={form.note} onChange={(event) => setForm((f) => ({ ...f, note: event.target.value }))} className={FIELD} placeholder="optional" />
        </label>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <Side icon={toCash ? QrCode : Banknote} label={toCash ? 'You receive online' : 'You receive cash'} value={amount} tone="border-emerald-200 bg-emerald-50 text-emerald-900" />
        <div className="hidden items-center text-stone-400 sm:flex"><ArrowLeftRight className="h-5 w-5" /></div>
        <Side icon={toCash ? Banknote : QrCode} label={toCash ? 'You pay out cash' : 'You send online'} value={Math.max(0, payout)} tone="border-rose-200 bg-rose-50 text-rose-900" />
        <Side icon={Store} label="Charge kept" value={charge} tone="border-amber-200 bg-amber-50 text-amber-900" />
      </div>
      {toCash && drawer?.open && payout > drawer.expectedCash ? <p className="mt-2 text-sm font-semibold text-rose-700">The drawer only holds {money(drawer.expectedCash)}.</p> : null}
      {charge >= amount && amount > 0 ? <p className="mt-2 text-sm font-semibold text-rose-700">The charge must be less than the amount.</p> : null}
      <div className="mt-4 flex justify-end">
        <button type="submit" disabled={busy || !valid} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#171E2D] px-5 text-sm font-bold text-white shadow-[0_6px_16px_rgba(23,30,45,0.18)] hover:bg-[#242d42] disabled:opacity-50">
          <ArrowLeftRight className="h-4 w-4" />{busy ? 'Recording…' : 'Record exchange'}
        </button>
      </div>
    </form>
  );
}

/* --------------------------------------------------------------- workspace */

export default function MovementWorkspace({ kind = 'cash' }) {
  const isExchange = kind === 'exchange';
  const { period, filterProps, ready, query } = usePeriod('7days');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [formType, setFormType] = useState(null);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    if (!ready) return;
    const params = new URLSearchParams(query);
    params.set('kind', kind);
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    if (search.trim()) params.set('search', search.trim());
    if (direction) params.set('direction', direction);
    try { setData(await erpFetch(`/api/cash/movements?${params}`)); setError(''); } catch (loadError) { setError(loadError.message); }
  }, [kind, page, pageSize, search, direction, query, ready]);

  useEffect(() => { const timer = setTimeout(load, search ? 250 : 0); return () => clearTimeout(timer); }, [load, search]);
  useEffect(() => { setPage(1); }, [period, query, search, direction, pageSize]);

  const done = (text) => { setFormType(null); setMessage(text); load(); };
  const drawer = data?.drawer;
  const totals = data?.totals || {};
  const rows = data?.rows || [];

  const columns = useMemo(() => (isExchange ? [
    { key: 'when', label: 'When / details' },
    { key: 'status', label: 'Status' },
    { key: 'cashIn', label: 'Cash in', right: true },
    { key: 'cashOut', label: 'Cash out', right: true },
    { key: 'onlineIn', label: 'Online in', right: true },
    { key: 'onlineOut', label: 'Online out', right: true },
    { key: 'fee', label: 'Charge', right: true },
  ] : [
    { key: 'when', label: 'When' },
    { key: 'type', label: 'Type / reason' },
    { key: 'note', label: 'Note' },
    { key: 'by', label: 'By' },
    { key: 'status', label: 'Status' },
    { key: 'amount', label: 'Amount', right: true },
  ]), [isExchange]);

  const cell = (row, key) => {
    switch (key) {
      case 'when': return (
        <div>
          <p className="font-semibold text-stone-900">{fmtDateTime(row.createdAt)}</p>
          {isExchange ? <p className="text-xs text-stone-500">{row.reasonLabel}{row.note && row.note !== row.reasonLabel ? ` · ${row.note}` : ''}{row.createdBy ? ` · ${row.createdBy}` : ''}</p> : null}
        </div>
      );
      case 'type': return (
        <div className="flex items-center gap-2">
          <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${row.type === 'CASH_IN' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
            {row.type === 'CASH_IN' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
          </span>
          <span><span className="block font-semibold text-stone-900">{TYPE_LABEL[row.type]}</span><span className="block text-xs text-stone-500">{row.reasonLabel}</span></span>
        </div>
      );
      case 'note': return <span className="block max-w-[260px] truncate text-stone-600">{row.note}</span>;
      case 'by': return row.createdBy || '—';
      case 'status': return statusBadge(row);
      case 'amount': {
        const value = row.type === 'CASH_IN' ? row.cashIn : -row.cashOut;
        return <span className={`font-bold tabular-nums ${value >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{value >= 0 ? '+' : '−'}{money(Math.abs(value))}</span>;
      }
      case 'cashIn': return <Signed value={row.cashIn} tone="text-emerald-700" />;
      case 'cashOut': return <Signed value={row.cashOut} tone="text-rose-700" />;
      case 'onlineIn': return <Signed value={row.onlineIn} tone="text-sky-700" />;
      case 'onlineOut': return <Signed value={row.onlineOut} tone="text-rose-700" />;
      case 'fee': return <Signed value={row.feeIncome} tone="text-amber-700" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-5">
      {message ? <AlertBanner tone="inflow" title="Saved" action={<button type="button" className="text-sm font-semibold underline" onClick={() => setMessage('')}>Dismiss</button>}>{message}</AlertBanner> : null}
      {error ? <AlertBanner tone="outflow">{error}</AlertBanner> : null}

      {/* Drawer strip */}
      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl bg-[#171E2D] px-5 py-4 text-white">
          {drawer?.open ? (
            <>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-stone-400">Expected cash in drawer</p>
                <p className="mt-0.5 text-2xl font-extrabold tabular-nums text-[#E9C77B]">{money(drawer.expectedCash)}</p>
              </div>
              <div className="text-sm text-stone-300">
                <p>{fmtDate(drawer.businessDate)} · Session {drawer.sessionNumber}</p>
                <p className="text-xs text-stone-400">Entries here update it instantly.</p>
              </div>
            </>
          ) : drawer ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-stone-200">The store is closed. Open it before recording {isExchange ? 'an exchange' : 'cash in / out'}.</p>
              <Link href="/store/opening-closing" className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/20">Open store</Link>
            </div>
          ) : <p className="text-sm text-stone-400">Loading drawer…</p>}
        </div>
        {!isExchange ? (
          <div className="flex gap-2 lg:flex-col">
            <button type="button" disabled={!drawer?.open} onClick={() => setFormType('CASH_IN')} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50"><ArrowDownLeft className="h-4 w-4" />Cash In</button>
            <button type="button" disabled={!drawer?.open} onClick={() => setFormType('CASH_OUT')} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50"><ArrowUpRight className="h-4 w-4" />Cash Out</button>
          </div>
        ) : null}
      </section>

      {isExchange ? <ExchangeForm drawer={drawer} onDone={done} /> : null}

      {/* History */}
      <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="space-y-3 border-b border-stone-100 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-stone-950">{isExchange ? 'Exchange history' : 'Cash In / Out history'}</h2>
              <p className="text-xs text-stone-500">{isExchange ? 'Cash and online legs are shown separately. Corrections stay visible and are linked to the entry they reversed.' : 'These change business cash and the drawer, but are not sales or expenses. Tap a row for details.'}</p>
            </div>
          </div>
          <PeriodFilter {...filterProps} />
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search note, reason, reference or staff" className="h-10 w-full rounded-xl border border-stone-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-stone-500" />
            </label>
            <select value={direction} onChange={(event) => setDirection(event.target.value)} className="h-10 rounded-xl border border-stone-300 bg-white px-3 text-sm">
              {isExchange ? (
                <>
                  <option value="">Both directions</option>
                  <option value="ONLINE_TO_CASH">Online → cash</option>
                  <option value="CASH_TO_ONLINE">Cash → online</option>
                </>
              ) : (
                <>
                  <option value="">Cash in &amp; out</option>
                  <option value="CASH_IN">Cash In only</option>
                  <option value="CASH_OUT">Cash Out only</option>
                </>
              )}
            </select>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span className="text-stone-500">Cash in <strong className="tabular-nums text-emerald-700">{money(totals.cashIn)}</strong></span>
            <span className="text-stone-500">Cash out <strong className="tabular-nums text-rose-700">{money(totals.cashOut)}</strong></span>
            {isExchange ? (
              <>
                <span className="text-stone-500">Online in <strong className="tabular-nums text-sky-700">{money(totals.onlineIn)}</strong></span>
                <span className="text-stone-500">Online out <strong className="tabular-nums text-rose-700">{money(totals.onlineOut)}</strong></span>
                <span className="text-stone-500">Charges <strong className="tabular-nums text-amber-700">{money(totals.feeIncome)}</strong></span>
              </>
            ) : <span className="text-stone-500">Net <strong className="tabular-nums text-stone-900">{money(num(totals.cashIn - totals.cashOut))}</strong></span>}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50">
                {columns.map((column) => <th key={column.key} scope="col" className={`whitespace-nowrap px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.05em] text-stone-500 ${column.right ? 'text-right' : 'text-left'}`}>{column.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {!data ? <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-stone-400">Loading…</td></tr> : null}
              {data && rows.length === 0 ? <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-stone-400">{isExchange ? 'No exchanges in this period.' : 'No cash in / out in this period.'}</td></tr> : null}
              {rows.map((row) => (
                <tr key={row.id} onClick={() => setOpenId(row.id)} className={`cursor-pointer hover:bg-stone-50 ${row.status === 'REVERSAL' ? 'bg-amber-50/40' : ''}`}>
                  {columns.map((column) => <td key={column.key} className={`px-4 py-3 align-middle ${column.right ? 'text-right' : ''}`}>{cell(row, column.key)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data ? <Pager page={data.pagination.page} pages={data.pagination.pages} total={data.pagination.total} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} label="entries" /> : null}
      </section>

      {formType ? (
        <CashForm type={formType} options={formType === 'CASH_IN' ? data?.options?.cashIn || [] : data?.options?.cashOut || []} drawer={drawer} onDone={done} onCancel={() => setFormType(null)} />
      ) : null}
      {openId ? <MovementDetailPanel id={openId} onClose={() => setOpenId(null)} onChanged={load} /> : null}
    </div>
  );
}
