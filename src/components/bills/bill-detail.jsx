'use client';

/**
 * Bill details — one drawer used everywhere a bill appears (dashboard, reports, transactions,
 * customers, appointments, loyalty, reviews). Loads /api/admin/billing/[id]; shows the lines,
 * how it was paid, discounts incl. loyalty, void / refund with who and why, and can reprint.
 *
 *   <BillLink billId={id} number="SALON-0000123" />   — a clickable bill number
 */

import { fmtDate, fmtDateTime } from '@/lib/dates/display';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowRightLeft, Ban, CheckCircle2, Gift, History, Printer, ReceiptText, Star, X } from 'lucide-react';
import { money, StatusBadge } from '@/components/erp';
import { erpFetch } from '@/components/erp/use-report';
import { buildCustomerReceiptHtml } from '@/lib/documents/customer-receipt';
import { CancelBillPanel, ChangePaymentPanel, describeSplit } from '@/components/bills/bill-corrections';

const METHOD = { cash: 'Cash', online: 'Online / QR', credit: 'Customer credit' };
const PROVIDER = { ESEWA_PHONEPAY: 'eSewa / PhonePay', BANK: 'Bank QR' };

function when(value) {
  if (!value) return '—';
  return fmtDateTime(value);
}

function Row({ label, value, strong = false, tone = '' }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <dt className="text-stone-500">{label}</dt>
      <dd className={`text-right tabular-nums ${strong ? 'text-base font-bold text-stone-950' : 'font-medium text-stone-800'} ${tone}`}>{value}</dd>
    </div>
  );
}

export function BillDetailDrawer({ billId, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState(''); // '' | 'payment' | 'void'
  const [notice, setNotice] = useState('');
  const [version, setVersion] = useState(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    let alive = true;
    setError('');
    erpFetch(`/api/admin/billing/${billId}`).then((json) => { if (alive) setData(json); }).catch((err) => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [billId, version]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const corrected = (message) => {
    setMode('');
    setNotice(message);
    setVersion((value) => value + 1);
    onChanged?.();
    // Other open screens (dashboards, reports) listen for this and refresh their figures.
    window.dispatchEvent(new CustomEvent('salon:bill-changed', { detail: { billId } }));
  };

  const reprint = () => {
    if (!data) return;
    const b = data.bill;
    const win = window.open('', '', 'width=360,height=720');
    if (!win) return;
    const billData = {
      bill: {
        bill_number: b.number, customer_name: b.customerName, customer_phone: b.customerPhone, subtotal: b.subtotal,
        discount_amount: b.discount + b.loyaltyDiscount, loyalty_discount: b.loyaltyDiscount, tax: b.tax, service_charge: b.serviceCharge,
        grand_total: b.total, payment_method: b.paymentMethod, amount_paid: b.amountTendered, credit_amount: b.creditAmount,
        cash_amount: data.payments.filter((p) => p.method === 'cash').reduce((s, p) => s + p.amount, 0),
        qr_amount: data.payments.filter((p) => p.method === 'online').reduce((s, p) => s + p.amount, 0),
        qr_type: data.payments.find((p) => p.method === 'online')?.provider || null,
        transaction_time: b.transactionTime, cashier_name: b.cashier, token_number: b.tokenNumber, notes: b.notes, document_snapshot: b.documentSnapshot,
      },
      items: data.items.map((item) => ({ item_type: item.type, name: item.name, quantity: item.quantity, unit_price: item.unitPrice, subtotal: item.subtotal, staff_name_snapshot: item.staff })),
    };
    win.document.write(buildCustomerReceiptHtml(billData, { site_origin: window.location.origin }));
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 250);
  };

  const b = data?.bill;
  const voided = b?.status === 'cancelled';
  const voidEntry = data?.corrections.find((row) => row.type === 'void');
  const methodChanges = data?.corrections.filter((row) => row.type === 'payment_method_change') || [];
  const actions = data?.actions || {};
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label="Bill details" onClick={onClose}>
      <aside className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-3 border-b border-stone-200 px-5 py-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-stone-500"><ReceiptText className="h-4 w-4" aria-hidden="true" />Bill details</p>
            <h2 className="mt-1 truncate text-xl font-bold text-stone-950">{b?.number || '…'}</h2>
            {b ? <p className="text-sm text-stone-500">{when(b.transactionTime)}{b.cashier ? ` · by ${b.cashier}` : ''}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            {b ? <StatusBadge status={voided ? 'CANCELLED' : 'PAID'} label={voided ? 'Voided' : b.paymentStatus === 'paid' ? 'Paid' : b.paymentStatus === 'credit' ? 'On credit' : 'Part credit'} tone={voided ? 'outflow' : b.paymentStatus === 'paid' ? 'inflow' : 'cash'} /> : null}
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100"><X className="h-5 w-5" /></button>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {error ? <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
          {!data && !error ? <p className="py-10 text-center text-sm text-stone-400">Loading…</p> : null}
          {b ? (
            <>
              {notice ? <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />{notice}</p> : null}
              {voided && voidEntry ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                  <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" aria-hidden="true" />Cancelled {when(voidEntry.at)}{voidEntry.by ? ` by ${voidEntry.by}` : ''}</p>
                  <p className="mt-1">Reason: {voidEntry.reason}</p>
                  {data.refunds.length ? <p className="mt-1 text-rose-800">Refunded {data.refunds.map((r) => `${money(r.amount)} ${METHOD[r.method] || r.method}`).join(' + ')}</p> : null}
                </div>
              ) : null}
              {b.backdated ? <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Historical entry by {b.backdatedBy || 'admin'}: {b.backdatedReason}</p> : null}

              <section className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-stone-50 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-stone-500">Customer</p>
                  {b.customerId ? <Link href={`/admin/customers/${b.customerId}`} className="font-semibold text-indigo-700 hover:underline">{b.customerName}</Link> : <p className="font-semibold text-stone-800">{b.customerName || 'Walk-in'}</p>}
                  {b.customerPhone ? <p className="text-xs text-stone-500">{b.customerPhone}</p> : null}
                </div>
                <div className="rounded-xl bg-stone-50 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-stone-500">Visit</p>
                  <p className="font-semibold text-stone-800">{b.tokenNumber ? `Token ${b.tokenNumber}` : 'No token'}</p>
                  {b.appointmentNumber ? <p className="text-xs text-stone-500">Appointment {b.appointmentNumber}</p> : <p className="text-xs text-stone-500">Business day {fmtDate(b.businessDate || b.date)}</p>}
                </div>
              </section>

              <section>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-500">Items</p>
                <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
                  {data.items.map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="font-semibold text-stone-900">{item.name}{item.quantity > 1 ? <span className="font-normal text-stone-500"> × {item.quantity}</span> : null}</p>
                        <p className="text-xs text-stone-500">{item.type === 'product' ? 'Product' : 'Service'}{item.staff ? ` · ${item.staff}` : ''}{item.commission !== undefined && item.commission > 0 ? ` · commission ${money(item.commission)}` : ''}</p>
                        {item.loyaltyReward ? <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-pink-700"><Gift className="h-3 w-3" aria-hidden="true" />Loyalty reward</p> : null}
                      </div>
                      <p className="shrink-0 font-semibold tabular-nums text-stone-900">{money(item.subtotal)}</p>
                    </li>
                  ))}
                </ul>
              </section>

              <dl className="rounded-xl border border-stone-200 px-3 py-1">
                <Row label="Subtotal" value={money(b.subtotal)} />
                {b.discount > 0 ? <Row label={`Discount${b.discountType === 'percentage' ? ' (%)' : ''}`} value={`− ${money(b.discount)}`} tone="text-emerald-700" /> : null}
                {b.loyaltyDiscount > 0 ? <Row label="Loyalty reward" value={`− ${money(b.loyaltyDiscount)}`} tone="text-pink-700" /> : null}
                {b.tax > 0 ? <Row label="Tax" value={money(b.tax)} /> : null}
                {b.serviceCharge > 0 ? <Row label="Service charge" value={money(b.serviceCharge)} /> : null}
                <div className="border-t border-dashed border-stone-200"><Row label="Total" value={money(b.total)} strong /></div>
              </dl>

              <section>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-500">Payment</p>
                {data.payments.length ? (
                  <ul className="space-y-1.5">
                    {data.payments.map((payment, index) => (
                      <li key={index} className="flex justify-between rounded-lg bg-stone-50 px-3 py-2 text-sm">
                        <span className="font-medium text-stone-800">{METHOD[payment.method] || payment.method}{payment.provider ? ` · ${PROVIDER[payment.provider] || payment.provider}` : ''}{payment.reference ? ` · ${payment.reference}` : ''}</span>
                        <span className="font-semibold tabular-nums">{money(payment.amount)}{payment.method === 'cash' && payment.change > 0 ? <span className="ml-2 text-xs font-normal text-stone-500">(tendered {money(payment.tendered)}, change {money(payment.change)})</span> : null}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-stone-500">Nothing collected — fully covered by {b.loyaltyDiscount > 0 ? 'a loyalty reward' : 'discount'}.</p>}
              </section>

              {methodChanges.length ? (
                <section>
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-500"><History className="h-3.5 w-3.5" aria-hidden="true" />Payment method changes</p>
                  <ul className="space-y-1.5">
                    {methodChanges.map((row, index) => (
                      <li key={index} className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs text-indigo-950">
                        <p className="font-semibold">{describeSplit(row.before || [])} → {describeSplit(row.after || [])}</p>
                        <p className="mt-0.5 text-indigo-900/80">“{row.reason}” · {row.by || 'staff'} · {when(row.at)}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {mode === 'payment' ? <ChangePaymentPanel billId={billId} actions={actions} payments={data.payments} onDone={corrected} onCancel={() => setMode('')} /> : null}
              {mode === 'void' ? <CancelBillPanel billId={billId} bill={b} payments={data.payments} actions={actions} onDone={corrected} onCancel={() => setMode('')} /> : null}

              {data.loyalty.length || data.claimCode ? (
                <section className="rounded-xl border border-pink-200 bg-pink-50/60 p-3 text-sm">
                  <p className="flex items-center gap-2 font-semibold text-pink-900"><Gift className="h-4 w-4" aria-hidden="true" />Loyalty</p>
                  <ul className="mt-1 space-y-0.5 text-pink-900">
                    {data.loyalty.map((entry, index) => <li key={index}>{entry.program}: {entry.type === 'EARN' ? '+1 paid visit' : entry.type === 'REDEEM' ? 'reward used' : entry.type === 'REVERSAL' ? `${entry.reversed === 'REDEEM' ? 'reward returned' : 'visit reversed'} (void)` : `${entry.visits > 0 ? '+' : ''}${entry.visits}`}</li>)}
                    {data.claimCode ? <li>Walk-in reward code {data.claimCode.code} — {data.claimCode.claimed ? 'claimed' : 'not claimed yet'}</li> : null}
                  </ul>
                </section>
              ) : null}

              {data.review ? (
                <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm">
                  <p className="flex items-center gap-2 font-semibold text-amber-900"><Star className="h-4 w-4" aria-hidden="true" />Customer review · {'★'.repeat(data.review.rating || 0)}</p>
                  {data.review.text ? <p className="mt-1 text-stone-700">“{data.review.text}”</p> : null}
                  <p className="mt-1 text-xs text-stone-500">{data.review.status.toLowerCase()}</p>
                </section>
              ) : null}

              {b.notes ? <p className="text-sm text-stone-600">Note: {b.notes}</p> : null}
            </>
          ) : null}
        </div>
        {b ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-stone-200 px-5 py-3">
            {!voided && actions.canChangePayment && mode !== 'payment' ? <button type="button" onClick={() => { setMode('payment'); setNotice(''); }} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 text-sm font-semibold text-indigo-800 hover:bg-indigo-100"><ArrowRightLeft className="h-4 w-4" />Change payment</button> : null}
            {!voided && actions.canVoid && mode !== 'void' ? <button type="button" onClick={() => { setMode('void'); setNotice(''); }} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-rose-200 bg-white px-3.5 text-sm font-semibold text-rose-700 hover:bg-rose-50"><Ban className="h-4 w-4" />Cancel bill</button> : null}
            <span className="hidden flex-1 sm:block" />
            <button type="button" onClick={reprint} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"><Printer className="h-4 w-4" />Reprint receipt</button>
            <button type="button" onClick={onClose} className="hidden min-h-10 items-center rounded-lg bg-stone-900 px-4 text-sm font-semibold text-white hover:bg-stone-800 sm:inline-flex">Close</button>
          </footer>
        ) : null}
      </aside>
    </div>
  );
}

/** A bill number that opens the bill details when clicked. */
export function BillLink({ billId, number, className = '' }) {
  const [open, setOpen] = useState(false);
  if (!billId) return <span className={className}>{number || '—'}</span>;
  return (
    <>
      <button type="button" onClick={(event) => { event.stopPropagation(); setOpen(true); }} className={`font-semibold text-indigo-700 underline-offset-2 hover:underline ${className}`} title="Open bill details">
        {number || `Bill #${billId}`}
      </button>
      {open ? <BillDetailDrawer billId={billId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
