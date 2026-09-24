'use client';

/**
 * Customer profile: contact card and stats, then Timeline / Visits & bills / Services used /
 * Credit ledger / Credit payments / Appointments. Credit bills stay open until collections
 * cover them (oldest first). Every amount, allocation and balance comes from the server
 * (lib/customers/profile.js); collecting credit goes through /api/credit/collections.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Award, CalendarClock, CreditCard, HandCoins, MessageSquareHeart, History, Mail, MapPin, Phone, ReceiptText, Scissors, Star, User, UserRound, X,
} from 'lucide-react';
import { AlertBanner, ErpButton, ErrorState, LoadingState, money, PrintHeader, StatusBadge } from '@/components/erp';
import { erpFetch } from '@/components/erp/use-report';
import {
  CreditTimeline, formatDate, formatDateTime, PayStatus, ProfileStat, ProfileTable, ProfileTabs, TabActions,
} from '@/components/profiles';

const FIELD = 'mt-1 block h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900 focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-200';
const LABEL = 'block text-xs font-bold uppercase tracking-[0.04em] text-stone-500';

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());
}

const methodLabel = (method, provider) => (method === 'cash' ? 'Cash' : `Online${provider ? ` · ${provider}` : ''}`);

function CollectDialog({ customer, balance, onClose, onDone }) {
  const [form, setForm] = useState({ amount: String(balance), payment_method: 'cash', cash_tendered: '', provider: '', reference_number: '', note: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const change = form.payment_method === 'cash' && Number(form.cash_tendered) > Number(form.amount) ? Number(form.cash_tendered) - Number(form.amount) : 0;
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await erpFetch('/api/credit/collections', {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: {
          ...form,
          customer_id: customer.id,
          amount: Number(form.amount),
          cash_tendered: form.payment_method === 'cash' ? Number(form.cash_tendered || form.amount) : undefined,
        },
      });
      onDone();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Collect credit">
      <div className="w-full overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3">
          <div>
            <h2 className="text-base font-bold">Collect credit · {customer.name}</h2>
            <p className="text-xs text-stone-500">Owes {money(balance)} · settles the oldest credit bills first</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <label className={LABEL}>Amount *<input className={FIELD} type="number" min="0.01" step="0.01" inputMode="decimal" value={form.amount} onChange={(event) => set('amount', event.target.value)} /></label>
          <label className={LABEL}>Received via
            <select className={FIELD} value={form.payment_method} onChange={(event) => set('payment_method', event.target.value)}>
              <option value="cash">Cash (into the open drawer)</option>
              <option value="online">Online / QR</option>
            </select>
          </label>
          {form.payment_method === 'cash' ? (
            <label className={LABEL}>Cash tendered<input className={FIELD} type="number" min="0" step="0.01" inputMode="decimal" value={form.cash_tendered} placeholder={form.amount || '0.00'} onChange={(event) => set('cash_tendered', event.target.value)} /></label>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={LABEL}>Provider<input className={FIELD} value={form.provider} placeholder="eSewa, bank…" onChange={(event) => set('provider', event.target.value)} /></label>
              <label className={LABEL}>Reference<input className={FIELD} value={form.reference_number} onChange={(event) => set('reference_number', event.target.value)} /></label>
            </div>
          )}
          <label className={LABEL}>Note<input className={FIELD} value={form.note} onChange={(event) => set('note', event.target.value)} /></label>
          {change > 0 ? <p className="text-sm font-semibold text-emerald-700">Give change {money(change)}</p> : null}
          {error ? <AlertBanner tone="outflow">{error}</AlertBanner> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-stone-200 px-5 py-3">
          <ErpButton onClick={onClose} disabled={busy}>Cancel</ErpButton>
          <ErpButton variant="primary" onClick={submit} disabled={busy || !(Number(form.amount) > 0)}>{busy ? 'Recording…' : `Collect ${money(form.amount)}`}</ErpButton>
        </div>
      </div>
    </div>
  );
}

function BillDrawer({ bill, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Bill detail">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:max-w-xl sm:rounded-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-stone-200 bg-white px-5 py-3">
          <div>
            <h2 className="text-base font-bold">Bill {bill.number}</h2>
            <p className="text-xs text-stone-500">{formatDateTime(bill.createdAt)}{bill.cashier ? ` · billed by ${bill.cashier}` : ''}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 px-5 py-4">
          {bill.status === 'cancelled' ? <AlertBanner tone="cash" title="Voided">{bill.voidReason || 'This bill was voided.'}</AlertBanner> : null}
          <ProfileTable
            empty="No lines"
            align={{ 2: 'right', 3: 'right' }}
            headers={['Item', 'Staff', 'Qty', 'Amount']}
            rows={bill.items.map((item) => [`${item.name}${item.type === 'product' ? ' (product)' : ''}`, item.staff || '—', item.quantity, money(item.subtotal)])}
          />
          <dl className="ml-auto grid max-w-xs grid-cols-2 gap-y-1 text-sm">
            <dt className="text-stone-500">Discount</dt><dd className="text-right tabular-nums">− {money(bill.discount)}</dd>
            <dt className="text-stone-500">Tax</dt><dd className="text-right tabular-nums">{money(bill.tax)}</dd>
            <dt className="font-bold">Total</dt><dd className="text-right font-bold tabular-nums">{money(bill.total)}</dd>
            <dt className="text-stone-500">Payment</dt><dd className="text-right capitalize">{String(bill.paymentMethod || '').toLowerCase()}</dd>
            {bill.creditAmount > 0 ? (<><dt className="text-stone-500">On credit</dt><dd className="text-right tabular-nums">{money(bill.creditAmount)}</dd><dt className="text-stone-500">Still owed</dt><dd className="text-right font-semibold tabular-nums text-rose-700">{money(bill.creditOpen)}</dd></>) : null}
          </dl>
        </div>
      </div>
    </div>
  );
}

export default function CustomerProfileView({ customerId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('timeline');
  const [collecting, setCollecting] = useState(false);
  const [billId, setBillId] = useState(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try { setData(await erpFetch(`/api/customers/${customerId}/profile`)); setError(''); } catch (loadError) { setError(loadError.message); }
  }, [customerId]);
  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <LoadingState />;
  const { customer, summary, bills, services, ledger, payments, appointments, timeline, openInvoices } = data;
  const loyalty = data.loyalty || { programs: [], transactions: [] };
  const reviews = data.reviews || { items: [], total: 0, average: null, latest: null };
  const openBill = billId ? bills.find((bill) => bill.id === billId) : null;

  const tabs = [
    { key: 'timeline', label: `Timeline (${timeline.length})`, icon: History },
    { key: 'bills', label: `Visits & bills (${bills.length})`, icon: ReceiptText },
    { key: 'services', label: `Services used (${services.length})`, icon: Scissors },
    { key: 'ledger', label: 'Credit ledger', icon: CreditCard },
    { key: 'payments', label: `Credit payments (${payments.length})`, icon: HandCoins },
    { key: 'appointments', label: `Appointments (${appointments.length})`, icon: CalendarClock },
    { key: 'loyalty', label: 'Loyalty', icon: Award },
    { key: 'reviews', label: `Reviews (${data.reviews?.total || 0})`, icon: MessageSquareHeart },
  ];

  const exports = {
    timeline: {
      label: 'Credit timeline',
      headers: ['When', 'Activity', 'Details', 'Amount', 'Credit balance', 'Status'],
      rows: timeline.map((event) => [formatDateTime(event.at), event.title, event.description || '', event.amount || '', event.balance ?? '', event.status || '']),
    },
    bills: {
      label: 'Visits & bills',
      headers: ['When', 'Bill', 'Services', 'Staff', 'Payment', 'Total', 'On credit', 'Still owed', 'Status'],
      rows: bills.map((row) => [formatDateTime(row.createdAt), row.number, row.services.join('; '), row.staff.join('; '), row.paymentMethod, row.total, row.creditAmount, row.creditOpen, row.status === 'cancelled' ? 'VOID' : row.creditStatus]),
    },
    services: {
      label: 'Services used',
      headers: ['Service / product', 'Type', 'Times', 'Quantity', 'Spent', 'Last', 'Last staff'],
      rows: services.map((row) => [row.name, row.type, row.times, row.quantity, row.spent, formatDate(row.lastDate), row.lastStaff || '']),
    },
    ledger: {
      label: 'Credit ledger',
      headers: ['When', 'Activity', 'Bill', 'Credit given (+)', 'Reduced (−)', 'Balance', 'Note'],
      rows: ledger.map((row) => [formatDateTime(row.createdAt), row.title, row.billNumber || '', row.debit || '', row.credit || '', row.balance, row.note || '']),
    },
    payments: {
      label: 'Credit payments',
      headers: ['When', 'Method', 'Reference', 'Bills covered', 'Amount', 'Balance after', 'Received by'],
      rows: payments.map((row) => [formatDateTime(row.createdAt), methodLabel(row.method, row.provider), row.reference || '', row.allocations.map((a) => `${a.label} ${a.amount}`).join('; '), row.amount, row.balanceAfter ?? '', row.receivedBy || '']),
    },
    loyalty: {
      label: 'Loyalty',
      headers: ['When', 'Program', 'Type', 'Visits', 'Bill', 'Note'],
      rows: loyalty.transactions.map((row) => [formatDateTime(row.at), row.programName, row.type, row.visits, row.billNumber || '', row.note || '']),
    },
    reviews: {
      label: 'Reviews',
      headers: ['Submitted', 'Rating', 'Review', 'Service', 'Status', 'Verified'],
      rows: reviews.items.map((row) => [formatDateTime(row.submittedAt), row.rating || '', row.text || '', row.serviceName || '', row.status, row.verified ? 'yes' : 'no']),
    },
    appointments: {
      label: 'Appointments',
      headers: ['Date', 'Time', 'Appointment', 'Services', 'Staff', 'Status'],
      rows: appointments.map((row) => [row.date, row.time, row.number, row.services, row.staff || '', row.status]),
    },
  };
  const active = exports[tab];

  return (
    <div className="space-y-4">
      <PrintHeader title={`Customer — ${customer.name} · ${active.label}`} period={`As of ${today()}`} />
      {notice ? <AlertBanner tone="inflow">{notice}</AlertBanner> : null}
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-rose-700">Customer #{customer.id}{customer.category ? ` · ${customer.category}` : ''}</p>
            <h2 className="mt-1 text-2xl font-bold text-stone-950">{customer.name}</h2>
            <p className="mt-1 text-sm text-stone-500">Customer since {formatDate(customer.createdAt)}{summary.lastVisit ? ` · last visit ${formatDate(summary.lastVisit)}` : ''}</p>
            <div className="mt-4 space-y-1.5 text-sm text-stone-700">
              {customer.phone ? <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-stone-400" aria-hidden="true" /><a href={`tel:${customer.phone}`} className="hover:underline">{customer.phone}</a></p> : null}
              {customer.email ? <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-stone-400" aria-hidden="true" />{customer.email}</p> : null}
              {customer.address ? <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-stone-400" aria-hidden="true" />{customer.address}</p> : null}
              {customer.preferredStaff ? <p className="flex items-center gap-2"><User className="h-4 w-4 text-stone-400" aria-hidden="true" />Prefers {customer.preferredStaff}</p> : null}
              {customer.favoriteServices ? <p className="flex items-center gap-2"><Star className="h-4 w-4 text-stone-400" aria-hidden="true" />{customer.favoriteServices}</p> : null}
              {!customer.phone && !customer.email && !customer.address ? <p className="flex items-center gap-2 text-stone-400"><UserRound className="h-4 w-4" aria-hidden="true" />No contact details recorded</p> : null}
            </div>
            {customer.notes ? <p className="mt-4 rounded-xl bg-stone-50 p-3 text-sm text-stone-600">{customer.notes}</p> : null}
          </div>
          <div className="grid w-full grid-cols-2 gap-3 sm:w-auto sm:min-w-105 sm:grid-cols-3">
            <ProfileStat label="Total spent" value={money(summary.totalSpent)} />
            <ProfileStat label="Credit due" value={money(summary.creditOutstanding)} tone={summary.creditOutstanding > 0 ? 'red' : 'green'} />
            <ProfileStat label="Credit collected" value={money(summary.collected)} />
            <ProfileStat label="Visits" value={summary.visits} />
            <ProfileStat label="Average bill" value={money(summary.averageBill)} />
            <ProfileStat label="Open credit bills" value={summary.openBills} tone={summary.openBills ? 'red' : undefined} />
          </div>
        </div>
        <div className="print-hide mt-5 flex flex-wrap gap-2 border-t border-stone-100 pt-4">
          <ErpButton icon={HandCoins} variant="primary" onClick={() => { setNotice(''); setCollecting(true); }} disabled={summary.creditOutstanding <= 0}>Collect credit</ErpButton>
          {customer.creditLimit > 0 ? <span className="self-center text-xs text-stone-500">Credit limit {money(customer.creditLimit)}</span> : null}
        </div>
        {openInvoices.length ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {openInvoices.length} credit bill{openInvoices.length === 1 ? '' : 's'} open · {money(summary.creditOutstanding)} due
            <span className="mt-1 block text-xs text-amber-800">{openInvoices.map((invoice) => `${invoice.label} ${money(invoice.open)}`).join(' · ')}</span>
          </p>
        ) : null}
      </section>

      <ProfileTabs tabs={tabs} value={tab} onChange={setTab} />

      <section className="min-w-0 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <TabActions entity={customer.name} tab={active.label} headers={active.headers} rows={active.rows} />
        {tab === 'timeline' ? <CreditTimeline events={timeline} onOpenRecord={setBillId} balanceLabel="Credit balance" coveredNoun="bill" empty="No activity for this customer yet." /> : null}
        {tab === 'bills' ? (
          <ProfileTable
            empty="No visits yet."
            onRowClick={(index) => setBillId(bills[index].id)}
            align={{ 5: 'right', 6: 'right' }}
            headers={['When', 'Bill', 'Services', 'Staff', 'Payment', 'Total', 'Still owed', 'Status']}
            rows={bills.map((row) => [
              formatDateTime(row.createdAt), <span key="n" className="font-semibold text-indigo-700">{row.number}</span>,
              row.services.join(', ') || (row.products.length ? row.products.join(', ') : '—'), row.staff.join(', ') || '—',
              <span key="p" className="capitalize">{String(row.paymentMethod || '').toLowerCase()}</span>,
              <span key="t" className={row.status === 'cancelled' ? 'text-stone-400 line-through' : 'font-semibold'}>{money(row.total)}</span>,
              <span key="o" className={row.creditOpen > 0 ? 'font-semibold text-rose-700' : ''}>{money(row.creditOpen)}</span>,
              row.status === 'cancelled' ? <PayStatus key="s" value="VOID" /> : (row.creditAmount > 0 ? <PayStatus key="s" value={row.creditStatus} /> : <PayStatus key="s" value="PAID" />),
            ])}
          />
        ) : null}
        {tab === 'services' ? (
          <ProfileTable
            empty="No services yet."
            align={{ 2: 'right', 3: 'right', 4: 'right' }}
            headers={['Service / product', 'Type', 'Times', 'Quantity', 'Spent', 'Last', 'Last staff']}
            rows={services.map((row) => [row.name, <span key="t" className="capitalize">{row.type}</span>, row.times, row.quantity, money(row.spent), formatDate(row.lastDate), row.lastStaff || '—'])}
          />
        ) : null}
        {tab === 'ledger' ? (
          <ProfileTable
            empty="This customer has never used credit."
            align={{ 3: 'right', 4: 'right', 5: 'right' }}
            headers={['When', 'Activity', 'Bill', 'Credit given (+)', 'Reduced (−)', 'Balance', 'Note']}
            rows={ledger.map((row) => [
              formatDateTime(row.createdAt), row.title, row.billNumber || '—',
              row.debit ? money(row.debit) : '—', row.credit ? money(row.credit) : '—',
              <span key="b" className="font-semibold text-stone-900">{money(row.balance)}</span>, row.note || '—',
            ])}
          />
        ) : null}
        {tab === 'payments' ? (
          <ProfileTable
            empty="No credit payments yet."
            align={{ 4: 'right', 5: 'right' }}
            headers={['When', 'Method', 'Reference', 'Bills covered', 'Amount', 'Balance after', 'Received by']}
            rows={payments.map((row) => [
              formatDateTime(row.createdAt), methodLabel(row.method, row.provider), row.reference || '—',
              row.allocations.length ? row.allocations.map((a) => `${a.label} (${money(a.amount)})`).join(', ') : '—',
              <span key="a" className="font-semibold text-emerald-700">{money(row.amount)}</span>, row.balanceAfter === null ? '—' : money(row.balanceAfter), row.receivedBy || '—',
            ])}
          />
        ) : null}
        {tab === 'loyalty' ? (
          <div className="space-y-4 p-4">
            {loyalty.programs.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {loyalty.programs.map((program) => (
                  <div key={program.programId} className={`rounded-xl border p-4 ${program.available > 0 ? 'border-pink-300 bg-pink-50' : 'border-stone-200 bg-white'}`}>
                    <p className="text-xs font-bold uppercase tracking-wide text-stone-500">{program.name}</p>
                    {program.available > 0 ? <p className="mt-1 font-bold text-pink-800">{program.rewardLabel.toUpperCase()} AVAILABLE{program.available > 1 ? ` ×${program.available}` : ''}</p> : null}
                    <p className="mt-1 text-2xl font-bold tabular-nums text-stone-950">{program.progress} / {program.requiredVisits}</p>
                    <div className="mt-2 flex flex-wrap gap-1">{Array.from({ length: program.requiredVisits }, (_, index) => <span key={index} className={`h-3 w-3 rounded-full ${index < program.progress ? 'bg-pink-500' : 'bg-stone-200'}`} />)}</div>
                    <p className="mt-2 text-xs text-stone-600">{program.remaining} more paid visit{program.remaining === 1 ? '' : 's'} until {program.rewardLabel} · {program.paidVisits} paid visit{program.paidVisits === 1 ? '' : 's'} · {program.redeemed} redeemed{program.adjustments ? ` · ${program.adjustments} adjustment(s)` : ''}</p>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-stone-400">No loyalty program is active.</p>}
            <ProfileTable
              empty="No loyalty activity yet."
              align={{ 3: 'right' }}
              headers={['When', 'Program', 'Type', 'Visits', 'Bill / service', 'Note']}
              rows={loyalty.transactions.map((row) => [formatDateTime(row.at), row.programName, row.type === 'REVERSAL' ? `reversal (${String(row.reversedType || '').toLowerCase()})` : row.type.replaceAll('_', ' ').toLowerCase(), row.visits > 0 ? `+${row.visits}` : row.visits, [row.billNumber, row.itemName].filter(Boolean).join(' · ') || '—', row.note || '—'])}
            />
          </div>
        ) : null}
        {tab === 'reviews' ? (
          <div className="space-y-3 p-4">
            <p className="text-sm text-stone-600">{reviews.total} review{reviews.total === 1 ? '' : 's'}{reviews.average !== null ? ` · average ${reviews.average}★` : ''}{reviews.latest ? ` · latest ${formatDate(reviews.latest.submittedAt)} (${reviews.latest.status.toLowerCase()})` : ''}</p>
            <ProfileTable
              empty="This customer has not left feedback."
              headers={['Submitted', 'Rating', 'Review', 'Service', 'Status', '']}
              rows={reviews.items.map((row) => [formatDateTime(row.submittedAt), row.rating ? '★'.repeat(row.rating) : '—', row.text || '—', row.serviceName || '—', row.status.toLowerCase(), row.verified ? 'Verified visit' : 'General'])}
            />
          </div>
        ) : null}
        {tab === 'appointments' ? (
          <ProfileTable
            empty="No appointments yet."
            headers={['Date', 'Time', 'Appointment', 'Services', 'Staff', 'Status']}
            rows={appointments.map((row) => [formatDate(row.date), row.time, row.number, row.services || '—', row.staff || '—', <StatusBadge key="s" status={row.status} />])}
          />
        ) : null}
      </section>

      {collecting ? (
        <CollectDialog
          customer={customer}
          balance={summary.creditOutstanding}
          onClose={() => setCollecting(false)}
          onDone={() => { setCollecting(false); setNotice('Credit collected. The ledger is updated.'); load(); }}
        />
      ) : null}
      {openBill ? <BillDrawer bill={openBill} onClose={() => setBillId(null)} /> : null}
    </div>
  );
}
