'use client';

/**
 * Small pop-ups used inside the ledger statement: receive / pay money, one open bill or
 * invoice, and the two print layouts. Payments post to the existing server routes, which
 * enforce the balance, drawer and permission rules.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Loader2, X } from 'lucide-react';
import { money } from '@/components/erp';
import { erpFetch } from '@/components/erp/use-report';
import { buildStatementHtml } from '@/lib/documents/statement';

const FIELD = 'mt-1 block h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm text-stone-900 focus:border-stone-500 focus:outline-none';
const LABEL = 'block text-[13px] font-semibold text-stone-700';

function Shell({ title, subtitle, onClose, children, width = 'max-w-md' }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-900/40 p-4" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className={`w-full ${width} rounded-2xl bg-white shadow-2xl`} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-stone-100 px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-[17px] font-extrabold text-stone-900">{title}</h3>
            {subtitle ? <p className="text-xs text-stone-500">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/**
 * Receive a customer payment (optionally forgiving part of what is left) or pay a supplier.
 * preset: { amount, note, purchaseId } from an open bill / invoice.
 */
export function PaymentPopup({ kind, party, owed, preset = {}, onClose, onDone }) {
  const isCustomer = kind === 'customer';
  const [amount, setAmount] = useState(String(preset.amount ?? owed ?? ''));
  const [method, setMethod] = useState('cash');
  const [provider, setProvider] = useState('ESEWA_PHONEPAY');
  const [note, setNote] = useState(preset.note || '');
  const [forgive, setForgive] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const keys = useRef({ pay: crypto.randomUUID(), forgive: crypto.randomUUID() });

  const value = Number(amount || 0);
  const forgiveValue = Number(forgive || 0);
  const left = Math.max(0, Math.round((Number(owed || 0) - value) * 100) / 100);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!(value > 0) && !(isCustomer && forgiveValue > 0)) { setError('Enter the amount received.'); return; }
    if (value > Number(owed || 0) + 0.001) { setError(`That is more than the ${money(owed)} outstanding.`); return; }
    if (isCustomer && forgiveValue > 0 && forgiveValue > left + 0.001) { setError(`You can forgive at most the ${money(left)} left after this payment.`); return; }
    if (isCustomer && forgiveValue > 0 && reason.trim().length < 3) { setError('Give a reason for forgiving the amount.'); return; }
    setBusy(true);
    try {
      if (value > 0) {
        if (isCustomer) {
          await erpFetch('/api/credit/collections', {
            method: 'POST',
            headers: { 'Idempotency-Key': keys.current.pay },
            body: { customer_id: Number(party.id), amount: value, payment_method: method, cash_tendered: method === 'cash' ? value : undefined, provider: method === 'online' ? provider : '', note: note || 'Credit collection' },
          });
        } else {
          await erpFetch('/api/suppliers/payments', {
            method: 'POST',
            headers: { 'Idempotency-Key': keys.current.pay },
            body: { supplierId: Number(party.id), amount: value, method, notes: note || undefined, purchaseId: preset.purchaseId || undefined },
          });
        }
      }
      if (isCustomer && forgiveValue > 0) {
        await erpFetch('/api/credit/writeoff', {
          method: 'POST',
          headers: { 'Idempotency-Key': keys.current.forgive },
          body: { customer_id: Number(party.id), amount: forgiveValue, reason },
        });
      }
      onDone?.();
    } catch (submitError) {
      setError(submitError.message || 'Unable to record the payment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title={`${isCustomer ? 'Receive payment' : 'Pay'} — ${party.name}`} subtitle={`Outstanding ${money(owed)}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3.5">
        <label className={LABEL}>{isCustomer ? 'Amount received' : 'Amount'}
          <input type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className={FIELD} autoFocus />
        </label>
        <label className={LABEL}>Method
          <select value={method} onChange={(event) => setMethod(event.target.value)} className={FIELD}>
            <option value="cash">Cash</option>
            <option value="online">Online / QR / bank</option>
          </select>
        </label>
        {isCustomer && method === 'online' ? (
          <label className={LABEL}>Received via
            <select value={provider} onChange={(event) => setProvider(event.target.value)} className={FIELD}>
              <option value="ESEWA_PHONEPAY">eSewa / PhonePay</option>
              <option value="BANK">Bank QR / transfer</option>
            </select>
          </label>
        ) : null}
        <label className={LABEL}>{isCustomer ? 'Payment note' : 'Note'}
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="optional" className={FIELD} />
        </label>
        {isCustomer ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
            <p className="text-xs text-amber-800">Optional: forgive part of the remaining balance while recording this payment{left > 0 ? ` (up to ${money(left)})` : ''}.</p>
            <label className={`${LABEL} mt-2`}>Amount to forgive
              <input type="number" inputMode="decimal" min="0" step="0.01" value={forgive} onChange={(event) => setForgive(event.target.value)} placeholder="0" className={FIELD} />
            </label>
            {forgiveValue > 0 ? (
              <label className={`${LABEL} mt-2`}>Reason
                <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. regular customer, rounding" className={FIELD} />
              </label>
            ) : null}
          </div>
        ) : null}
        {preset.hint ? <p className="text-[11.5px] text-stone-500">{preset.hint}</p> : null}
        {error ? <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p> : null}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button type="submit" disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-stone-900 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Post payment</button>
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl bg-stone-100 text-sm font-semibold text-stone-700 hover:bg-stone-200">Cancel</button>
        </div>
      </form>
    </Shell>
  );
}

/** One open bill (customer) or invoice (supplier): what it was, what is still due, pay it. */
export function OpenItemPopup({ kind, item, dateText, onClose, onPay, onOpenBill }) {
  const isCustomer = kind === 'customer';
  const [items, setItems] = useState(null);
  useEffect(() => {
    if (!isCustomer || !item.billId) return;
    erpFetch(`/api/admin/billing/${item.billId}`).then((body) => setItems(body.items || [])).catch(() => setItems([]));
  }, [isCustomer, item.billId]);
  return (
    <Shell title={item.label} subtitle={dateText} onClose={onClose} width="max-w-sm">
      {isCustomer ? (
        <ul className="mb-3 divide-y divide-stone-100 rounded-xl border border-stone-200">
          {items === null ? <li className="px-3 py-3 text-sm text-stone-400">Loading items…</li> : items.map((line) => (
            <li key={line.id} className="flex justify-between gap-3 px-3 py-2.5 text-sm">
              <span className="text-stone-800">{line.quantity}× {line.name}</span>
              <span className="tabular-nums text-stone-700">{money(line.subtotal)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <dl className="space-y-1.5 rounded-xl bg-stone-50 px-3 py-3 text-sm">
        <div className="flex justify-between"><dt className="text-stone-500">{isCustomer ? 'Bill total' : 'Invoice total'}</dt><dd className="font-semibold tabular-nums text-stone-900">{money(item.total)}</dd></div>
        <div className="flex justify-between"><dt className="text-stone-500">Outstanding</dt><dd className="font-bold tabular-nums text-rose-700">{money(item.due)}</dd></div>
      </dl>
      <p className="mt-2 text-[11.5px] leading-relaxed text-stone-500">
        {isCustomer
          ? 'Customer payments settle the oldest unpaid bill first, so a payment here is applied starting with this or an older bill.'
          : 'Supplier payments settle the oldest open invoice first, so paying here pays the supplier, applied starting with this or an older invoice.'}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onPay} className="inline-flex min-h-10 items-center rounded-xl bg-stone-900 px-4 text-sm font-semibold text-white hover:bg-stone-800">{isCustomer ? 'Pay this bill' : 'Pay supplier'}</button>
        {isCustomer && item.billId ? (
          <button type="button" onClick={onOpenBill} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700 hover:bg-stone-50"><ExternalLink className="h-4 w-4" />Open bill details</button>
        ) : null}
        {!isCustomer ? (
          <Link href="/admin/purchases" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700 hover:bg-stone-50"><ExternalLink className="h-4 w-4" />Open in Purchases</Link>
        ) : null}
      </div>
    </Shell>
  );
}

/**
 * Print a statement (mode 'all' = every entry with a running balance, 'due' = only what is
 * still owed) using the layout from Printer & Documents (A4 or 80 / 58 mm, titles, column
 * labels, footer). The window opens first so the browser does not block it as a pop-up.
 */
export async function printStatement(view, mode, fmtDate, kind = 'customer') {
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) return;
  win.document.write('<p style="font-family:system-ui,sans-serif;padding:32px;color:#57534e">Preparing statement…</p>');
  let settings = {};
  try { settings = (await erpFetch('/api/admin/settings?mode=documents')).settings || {}; } catch { /* print with defaults */ }
  const now = new Date();
  const time = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit' });
  const printedAt = `${fmtDate(now.toISOString())} ${time}`;
  win.document.open();
  win.document.write(buildStatementHtml({ view, kind, mode, settings, fmtDate, printedAt }));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}
