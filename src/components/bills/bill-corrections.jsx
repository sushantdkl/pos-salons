'use client';

/**
 * Corrections on a settled bill, shown inside the bill drawer:
 *   • Change payment method — fixes a rush-hour slip (Cash pressed for an eSewa payment …).
 *     Only the collected part moves between cash and online; customer credit never changes.
 *     Bills from the open session only (a closed session's drawer is already counted).
 *   • Cancel bill — voids it with a refund record, returns stock and reverses loyalty.
 * Both need a written reason, which is kept on the bill's audit trail.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRightLeft, Ban, Loader2 } from 'lucide-react';
import { money } from '@/components/erp';
import { erpFetch } from '@/components/erp/use-report';

const MIN_REASON = 5;
const PAYMENT_REASONS = ['Wrong method selected in rush', 'Customer paid by eSewa / PhonePay', 'Customer paid cash instead', 'Customer split the payment'];
const VOID_REASONS = ['Wrong service billed', 'Duplicate bill', 'Customer cancelled the service', 'Wrong customer selected'];
const OPTIONS = [
  { key: 'cash', label: 'Cash' },
  { key: 'esewa', label: 'eSewa / PhonePay' },
  { key: 'bank', label: 'Bank QR' },
  { key: 'split', label: 'Cash + online' },
];

export const PAYMENT_LABEL = { cash: 'Cash', online: 'Online / QR', credit: 'Customer credit' };
export const PROVIDER_LABEL = { ESEWA_PHONEPAY: 'eSewa / PhonePay', BANK: 'Bank QR' };
export const describeSplit = (rows = []) => rows.map((row) => `${row.method === 'online' ? PROVIDER_LABEL[row.provider] || 'Online' : PAYMENT_LABEL[row.method] || row.method} ${money(row.amount)}`).join(' + ');

const newKey = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

function ReasonField({ value, onChange, presets, label }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-stone-800">
        {label} <span className="text-rose-600">*</span>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Required — this is kept on the bill's history"
          className="mt-1.5 block w-full resize-none rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-stone-500 focus:ring-2 focus:ring-stone-900/10"
        />
      </label>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <button key={preset} type="button" onClick={() => onChange(preset)} className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-medium text-stone-600 hover:border-stone-300 hover:bg-white">{preset}</button>
        ))}
      </div>
      {value.trim() && value.trim().length < MIN_REASON ? <p className="mt-1 text-xs text-rose-600">Write at least {MIN_REASON} characters.</p> : null}
    </div>
  );
}

export function ChangePaymentPanel({ billId, actions, payments, onDone, onCancel }) {
  const collected = actions.collected;
  const current = payments.filter((row) => row.method !== 'credit');
  const [option, setOption] = useState(() => (current.length === 1 && current[0].method === 'cash' ? 'esewa' : 'cash'));
  const [cash, setCash] = useState('');
  const [provider, setProvider] = useState('ESEWA_PHONEPAY');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [key] = useState(newKey);
  const ref = useRef(null);
  useEffect(() => { ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, []);

  const allocations = useMemo(() => {
    if (option === 'cash') return [{ method: 'cash', amount: collected }];
    if (option === 'esewa') return [{ method: 'online', amount: collected, provider: 'ESEWA_PHONEPAY' }];
    if (option === 'bank') return [{ method: 'online', amount: collected, provider: 'BANK' }];
    const cashPart = Math.round(Math.min(Math.max(Number(cash) || 0, 0), collected) * 100) / 100;
    const online = Math.round((collected - cashPart) * 100) / 100;
    return [{ method: 'cash', amount: cashPart }, { method: 'online', amount: online, provider }].filter((row) => row.amount > 0);
  }, [option, cash, provider, collected]);

  const splitInvalid = option === 'split' && (!(Number(cash) > 0) || Number(cash) >= collected);
  const blocked = !actions.inOpenSession;
  const disabled = busy || blocked || splitInvalid || reason.trim().length < MIN_REASON;

  const submit = async () => {
    setBusy(true); setError('');
    try {
      await erpFetch(`/api/admin/billing/${billId}/payment-method`, { method: 'POST', body: { reason: reason.trim(), allocations }, headers: { 'Idempotency-Key': key } });
      onDone('Payment method updated. Cash and online totals are corrected everywhere.');
    } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <section ref={ref} className="scroll-mb-4 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-indigo-950"><ArrowRightLeft className="h-4 w-4" aria-hidden="true" />Change payment method</p>
      <p className="mt-1 text-xs text-indigo-900/80">Now: <b>{describeSplit(current)}</b>{actions.credit > 0 ? ` · ${money(actions.credit)} on customer credit stays unchanged` : ''}</p>
      {blocked ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
          {actions.storeOpen ? 'This bill belongs to a session that is already closed — its cash was counted, so the method can no longer change.' : 'Open the store first. Payment methods can be changed only for bills from the open session.'}
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {OPTIONS.map((item) => (
              <button key={item.key} type="button" onClick={() => setOption(item.key)} aria-pressed={option === item.key}
                className={`min-h-11 rounded-xl border px-3 text-sm font-semibold transition ${option === item.key ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm' : 'border-stone-200 bg-white text-stone-700 hover:border-indigo-300'}`}>
                {item.label}
              </button>
            ))}
          </div>
          {option === 'split' ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="block min-w-0 text-xs font-semibold text-stone-700">
                <span className="block">Cash part</span>
                <input type="number" inputMode="decimal" min="0" step="0.01" value={cash} onChange={(event) => setCash(event.target.value)} className="mt-1 block h-10 w-full min-w-0 rounded-lg border border-stone-300 bg-white px-3 text-sm" />
              </label>
              <label className="block min-w-0 text-xs font-semibold text-stone-700">
                <span className="block">Online via</span>
                <select value={provider} onChange={(event) => setProvider(event.target.value)} className="mt-1 block h-10 w-full min-w-0 rounded-lg border border-stone-300 bg-white px-2 text-sm">
                  <option value="ESEWA_PHONEPAY">eSewa / PhonePay</option>
                  <option value="BANK">Bank QR</option>
                </select>
              </label>
              <p className="col-span-2 text-xs text-stone-600">{splitInvalid ? `Enter a cash part between Rs 0 and ${money(collected)}.` : `Online part: ${money(collected - (Number(cash) || 0))}`}</p>
            </div>
          ) : null}
          <p className="rounded-lg bg-white px-3 py-2 text-xs text-stone-700">New: <b>{describeSplit(allocations)}</b> · total {money(collected)}</p>
          <ReasonField label="Reason for the change" value={reason} onChange={setReason} presets={PAYMENT_REASONS} />
        </div>
      )}
      {error ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="min-h-10 rounded-lg border border-stone-300 bg-white px-3.5 text-sm font-semibold text-stone-700 hover:bg-stone-50">Back</button>
        {!blocked ? (
          <button type="button" onClick={submit} disabled={disabled} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-indigo-700 px-4 text-sm font-semibold text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save new method
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function CancelBillPanel({ billId, bill, payments, actions, onDone, onCancel }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [key] = useState(newKey);
  const ref = useRef(null);
  useEffect(() => { ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, []);
  const cash = payments.filter((row) => row.method === 'cash').reduce((sum, row) => sum + row.amount, 0);
  const online = payments.filter((row) => row.method === 'online').reduce((sum, row) => sum + row.amount, 0);

  const submit = async () => {
    setBusy(true); setError('');
    try {
      await erpFetch(`/api/admin/billing/${billId}/corrections`, { method: 'POST', body: { reason: reason.trim() }, headers: { 'Idempotency-Key': key } });
      onDone('Bill cancelled. The refund, stock and loyalty reversal are recorded.');
    } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <section ref={ref} className="scroll-mb-4 rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-rose-900"><Ban className="h-4 w-4" aria-hidden="true" />Cancel bill {bill.number}</p>
      <ul className="mt-2 space-y-0.5 text-xs text-rose-900/90">
        <li>• {money(bill.total)} leaves today&apos;s sales as a void.</li>
        {cash > 0 ? <li>• Give back <b>{money(cash)}</b> cash from the drawer.</li> : null}
        {online > 0 ? <li>• Return <b>{money(online)}</b> online to the customer.</li> : null}
        {actions.credit > 0 ? <li>• {money(actions.credit)} is removed from the customer&apos;s credit.</li> : null}
        <li>• Products go back to stock; loyalty visits and rewards are reversed.</li>
      </ul>
      {!actions.storeOpen ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">Open the store first — the refund is recorded in the open session.</p> : (
        <div className="mt-3"><ReasonField label="Reason for cancelling" value={reason} onChange={setReason} presets={VOID_REASONS} /></div>
      )}
      <p className="mt-3 flex items-start gap-1.5 text-xs text-rose-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />This cannot be undone. Bill a new one if needed.</p>
      {error ? <p className="mt-3 rounded-lg bg-white px-3 py-2 text-sm text-rose-800">{error}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="min-h-10 rounded-lg border border-stone-300 bg-white px-3.5 text-sm font-semibold text-stone-700 hover:bg-stone-50">Keep bill</button>
        {actions.storeOpen ? (
          <button type="button" onClick={submit} disabled={busy || reason.trim().length < MIN_REASON} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Cancel bill
          </button>
        ) : null}
      </div>
    </section>
  );
}
