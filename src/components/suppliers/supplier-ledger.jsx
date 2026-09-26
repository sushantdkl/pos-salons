'use client';

/**
 * Supplier profile: contact card and stats, then Timeline / Purchases / Items supplied /
 * Payable ledger / Payments. Credit purchases show as open invoices until payments cover them.
 * Every amount, allocation and balance comes from the server (lib/suppliers/profile.js).
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  Boxes, Building2, CreditCard, HandCoins, History, Mail, MapPin, PackagePlus, Pencil, Phone, ReceiptText, Truck, User, X,
} from 'lucide-react';
import { AlertBanner, ErpButton, ErrorState, LoadingState, money, PrintHeader } from '@/components/erp';
import { erpFetch } from '@/components/erp/use-report';
import {
  CreditTimeline, formatDate, PayStatus, ProfileStat, ProfileTable, ProfileTabs, TabActions,
} from '@/components/profiles';
import SupplierForm from './supplier-form';
import PurchaseDrawer from './purchase-drawer';

const FIELD = 'mt-1 block h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900 focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-200';
const LABEL = 'block text-xs font-bold uppercase tracking-[0.04em] text-stone-500';

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());
}

const methodLabel = (method) => (method === 'cash' ? 'Cash' : 'Online / bank');

function PayDialog({ supplier, onClose, onPaid }) {
  const [form, setForm] = useState({ amount: supplier.balance > 0 ? String(supplier.balance) : '', method: 'cash', reference: '', notes: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const pay = async () => {
    setBusy(true);
    setError('');
    try {
      await erpFetch('/api/suppliers/payments', {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: { supplierId: supplier.id, amount: Number(form.amount), method: form.method, reference: form.reference, notes: form.notes, paymentDate: today() },
      });
      onPaid();
    } catch (payError) { setError(payError.message); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Pay supplier">
      <div className="w-full overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3">
          <div>
            <h2 className="text-base font-bold">Pay {supplier.name}</h2>
            <p className="text-xs text-stone-500">Owed now {money(supplier.balance)} · settles the oldest credit invoices first</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <label className={LABEL}>Amount *<input className={FIELD} type="number" min="0.01" step="0.01" inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>
          <label className={LABEL}>Paid from
            <select className={FIELD} value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })}>
              <option value="cash">Cash drawer (store must be open)</option>
              <option value="online">Online / bank</option>
            </select>
          </label>
          <label className={LABEL}>Reference<input className={FIELD} value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} placeholder="Cheque / transfer no." /></label>
          <label className={LABEL}>Note<input className={FIELD} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
          <p className="text-xs text-stone-500">Recorded as a Product Purchase expense today — it reduces {form.method === 'cash' ? 'Expected Cash in the drawer' : 'the online balance'}.</p>
          {error ? <AlertBanner tone="outflow">{error}</AlertBanner> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-stone-200 px-5 py-3">
          <ErpButton onClick={onClose} disabled={busy}>Cancel</ErpButton>
          <ErpButton variant="primary" onClick={pay} disabled={busy || !(Number(form.amount) > 0)}>{busy ? 'Paying…' : `Pay ${money(form.amount)}`}</ErpButton>
        </div>
      </div>
    </div>
  );
}

export default function SupplierLedgerView({ supplierId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('timeline');
  const [paying, setPaying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [purchaseId, setPurchaseId] = useState(null);
  const [voidFor, setVoidFor] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    try { setData(await erpFetch(`/api/suppliers/${supplierId}`)); setError(''); } catch (loadError) { setError(loadError.message); }
  }, [supplierId]);
  useEffect(() => { load(); }, [load]);

  const voidPayment = async () => {
    setActionError('');
    try {
      await erpFetch('/api/suppliers/payments', { method: 'POST', body: { action: 'void', paymentId: voidFor.id, reason: voidReason } });
      setVoidFor(null);
      setVoidReason('');
      load();
    } catch (voidError) { setActionError(voidError.message); }
  };

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <LoadingState />;
  const { supplier, summary, purchases, payments, items, timeline, openInvoices } = data;
  const ledgerRows = [
    { kind: 'opening', id: 'opening', date: supplier.createdAt, number: '', description: 'Opening balance', owedIncrease: data.openingBalance, owedDecrease: 0, balance: data.openingBalance, status: 'ACTIVE' },
    ...data.entries,
  ];

  const tabs = [
    { key: 'timeline', label: `Timeline (${timeline.length})`, icon: History },
    { key: 'purchases', label: `Purchases (${purchases.length})`, icon: Truck },
    { key: 'items', label: `Items supplied (${items.length})`, icon: Boxes },
    { key: 'ledger', label: 'Payable ledger', icon: ReceiptText },
    { key: 'payments', label: `Payments (${payments.length})`, icon: CreditCard },
  ];

  const exports = {
    timeline: {
      label: 'Credit timeline',
      headers: ['Date', 'Activity', 'Details', 'Amount', 'Balance after', 'Status'],
      rows: timeline.map((event) => [formatDate(event.at), event.title, event.description || '', event.amount || '', event.balance ?? '', event.status || '']),
    },
    purchases: {
      label: 'Purchases',
      headers: ['Date', 'Purchase', 'Supplier invoice', 'Payment', 'Received by', 'Status', 'Total', 'Paid', 'Open'],
      rows: purchases.map((row) => [row.date, row.number, row.supplierInvoice || '', row.terms, row.receivedBy || '', row.paymentStatus, row.total, row.paid, row.open]),
    },
    items: {
      label: 'Items supplied',
      headers: ['Product', 'Deliveries', 'Quantity received', 'Total value', 'Last unit cost', 'Last received'],
      rows: items.map((row) => [row.name, row.deliveries, row.quantity, row.totalValue, row.lastUnitCost, row.lastReceived]),
    },
    ledger: {
      label: 'Payable ledger',
      headers: ['Date', 'No.', 'Activity', 'Purchased (+)', 'Paid (−)', 'Running payable', 'Status'],
      rows: ledgerRows.map((row) => [row.kind === 'opening' ? '' : row.date, row.number, row.description, row.kind === 'payment' ? '' : (row.kind === 'purchase' ? row.amount : row.owedIncrease), row.kind === 'payment' ? row.amount : '', row.balance, row.status]),
    },
    payments: {
      label: 'Payments',
      headers: ['Date', 'Payment', 'Method', 'Reference', 'Covered', 'Amount', 'Status'],
      rows: payments.map((row) => [row.date, row.number, methodLabel(row.method), row.reference || '', row.allocations.map((a) => `${a.label} ${a.amount}`).join('; '), row.amount, row.status]),
    },
  };
  const active = exports[tab];

  return (
    <div className="space-y-4">
      <PrintHeader title={`Supplier — ${supplier.name} · ${active.label}`} period={`As of ${today()}`} />
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-lime-700">Supplier #{supplier.id}{supplier.isActive ? '' : ' · Inactive'}</p>
            <h2 className="mt-1 text-2xl font-bold text-stone-950">{supplier.name}</h2>
            <p className="mt-1 text-sm text-stone-500">Registered {formatDate(supplier.createdAt)}{supplier.panVat ? ` · PAN/VAT ${supplier.panVat}` : ''}</p>
            <div className="mt-4 space-y-1.5 text-sm text-stone-700">
              {supplier.contactPerson ? <p className="flex items-center gap-2"><User className="h-4 w-4 text-stone-400" aria-hidden="true" />{supplier.contactPerson}</p> : null}
              {supplier.phone ? <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-stone-400" aria-hidden="true" /><a href={`tel:${supplier.phone}`} className="hover:underline">{supplier.phone}</a></p> : null}
              {supplier.email ? <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-stone-400" aria-hidden="true" />{supplier.email}</p> : null}
              {supplier.address ? <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-stone-400" aria-hidden="true" />{supplier.address}</p> : null}
              {!supplier.contactPerson && !supplier.phone && !supplier.email && !supplier.address ? <p className="flex items-center gap-2 text-stone-400"><Building2 className="h-4 w-4" aria-hidden="true" />No contact details recorded</p> : null}
            </div>
            {supplier.notes ? <p className="mt-4 rounded-xl bg-stone-50 p-3 text-sm text-stone-600">{supplier.notes}</p> : null}
          </div>
          <div className="grid w-full grid-cols-2 gap-3 sm:w-auto sm:min-w-105 sm:grid-cols-3">
            <ProfileStat label="Total spend" value={money(summary.totalSpend)} />
            <ProfileStat label="Outstanding" value={money(summary.outstanding)} tone={summary.outstanding > 0 ? 'red' : 'green'} />
            <ProfileStat label="Total paid" value={money(summary.totalPaid)} />
            <ProfileStat label="Purchases" value={summary.purchases} />
            <ProfileStat label="Open invoices" value={summary.openInvoices} tone={summary.openInvoices ? 'red' : undefined} />
            <ProfileStat label="Items supplied" value={summary.itemsSupplied} />
          </div>
        </div>
        <div className="print-hide mt-5 flex flex-wrap gap-2 border-t border-stone-100 pt-4">
          <ErpButton icon={HandCoins} variant="primary" onClick={() => setPaying(true)} disabled={data.closingBalance <= 0}>Pay supplier</ErpButton>
          <Link href={`/admin/purchases/new?supplierId=${supplier.id}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"><PackagePlus className="h-4 w-4" /> Record purchase</Link>
          <ErpButton icon={Pencil} onClick={() => setEditing(true)}>Edit supplier</ErpButton>
        </div>
        {openInvoices.length ? (
          <div className="mt-4">
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {openInvoices.length} invoice{openInvoices.length === 1 ? '' : 's'} open on credit · {money(summary.outstanding)} payable
              <span className="mt-1 block text-xs text-amber-800">{openInvoices.map((invoice) => `${invoice.label} ${money(invoice.open)}`).join(' · ')}</span>
            </p>
          </div>
        ) : null}
      </section>

      <ProfileTabs tabs={tabs} value={tab} onChange={setTab} />

      {actionError ? <AlertBanner tone="outflow">{actionError}</AlertBanner> : null}
      {voidFor ? (
        <div className="print-hide space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
          <p className="text-sm font-bold text-rose-800">Void payment {voidFor.number} ({money(voidFor.amount)})</p>
          <p className="text-xs text-rose-700">Only today&apos;s payments can be voided, and a cash payment only while its drawer session is open. The amount goes back onto what you owe.</p>
          <input className={FIELD} placeholder="Reason (required)" aria-label="Void reason" value={voidReason} onChange={(event) => setVoidReason(event.target.value)} />
          <div className="flex gap-2">
            <ErpButton onClick={() => { setVoidFor(null); setActionError(''); }}>Back</ErpButton>
            <ErpButton variant="danger" disabled={!voidReason.trim()} onClick={voidPayment}>Void payment</ErpButton>
          </div>
        </div>
      ) : null}

      <section className="min-w-0 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <TabActions entity={supplier.name} tab={active.label} headers={active.headers} rows={active.rows} />
        {tab === 'timeline' ? <CreditTimeline events={timeline} onOpenRecord={setPurchaseId} balanceLabel="Payable after" empty="No supplier activity recorded yet." /> : null}
        {tab === 'purchases' ? (
          <ProfileTable
            empty="No purchases from this supplier."
            onRowClick={(index) => setPurchaseId(purchases[index].id)}
            align={{ 6: 'right', 7: 'right', 8: 'right' }}
            headers={['Date', 'Purchase', 'Invoice', 'Payment', 'Received by', 'Status', 'Total', 'Paid', 'Open']}
            rows={purchases.map((row) => [
              formatDate(row.date), <span key="n" className="font-semibold text-indigo-700">{row.number}</span>, row.supplierInvoice || '—', row.terms,
              row.receivedBy || '—', <PayStatus key="s" value={row.paymentStatus} />,
              <span key="t" className={row.status === 'VOID' ? 'text-stone-400 line-through' : 'font-semibold'}>{money(row.total)}</span>,
              money(row.paid), <span key="o" className={row.open > 0 ? 'font-semibold text-rose-700' : ''}>{money(row.open)}</span>,
            ])}
          />
        ) : null}
        {tab === 'items' ? (
          <ProfileTable
            empty="No products received from this supplier yet."
            align={{ 1: 'right', 2: 'right', 3: 'right', 4: 'right' }}
            headers={['Product', 'Deliveries', 'Quantity received', 'Total value', 'Last unit cost', 'Last received']}
            rows={items.map((row) => [row.name, row.deliveries, row.quantity.toLocaleString('en-IN'), money(row.totalValue), money(row.lastUnitCost), formatDate(row.lastReceived)])}
          />
        ) : null}
        {tab === 'ledger' ? (
          <ProfileTable
            empty="No payable-ledger entries."
            align={{ 3: 'right', 4: 'right', 5: 'right' }}
            headers={['Date', 'No.', 'Activity', 'Purchased (+)', 'Paid (−)', 'Running payable']}
            rows={ledgerRows.map((row) => [
              formatDate(row.date),
              row.number || '—',
              <span key="d" className={row.status === 'VOID' ? 'text-stone-400 line-through' : ''}>{row.description}{row.status === 'VOID' ? ' (void)' : ''}</span>,
              row.kind === 'payment' ? '—' : money(row.kind === 'purchase' ? row.amount : row.owedIncrease),
              row.kind === 'payment' ? money(row.amount) : '—',
              <span key="b" className="font-semibold text-stone-900">{money(row.balance)}</span>,
            ])}
          />
        ) : null}
        {tab === 'payments' ? (
          <ProfileTable
            empty="No supplier payments yet."
            align={{ 5: 'right' }}
            headers={['Date', 'Payment', 'Method', 'Reference', 'Covered', 'Amount', 'Status', '']}
            rows={payments.map((row) => [
              formatDate(row.date), row.number, methodLabel(row.method), row.reference || '—',
              row.allocations.length ? row.allocations.map((a) => `${a.label} (${money(a.amount)})`).join(', ') : '—',
              <span key="a" className={row.status === 'VOID' ? 'text-stone-400 line-through' : 'font-semibold'}>{money(row.amount)}</span>,
              row.status === 'VOID' ? <PayStatus key="s" value="VOID" /> : <span key="s" className="text-xs text-emerald-700">Active</span>,
              row.status === 'ACTIVE' ? <button key="v" type="button" className="print-hide text-xs font-bold text-rose-700 hover:underline" onClick={() => { setVoidFor(row); setActionError(''); }}>Void</button> : '',
            ])}
          />
        ) : null}
      </section>

      {paying ? <PayDialog supplier={{ ...supplier, balance: data.closingBalance }} onClose={() => setPaying(false)} onPaid={() => { setPaying(false); load(); }} /> : null}
      {editing ? <SupplierForm initial={supplier} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} /> : null}
      {purchaseId ? <PurchaseDrawer id={purchaseId} onClose={() => setPurchaseId(null)} onVoided={() => { setPurchaseId(null); load(); }} /> : null}
    </div>
  );
}
