'use client';

/**
 * Ledger statement pop-up for the Customer Ledger and Supplier Ledger lists: what is still owed,
 * the open bills / invoices, and the full statement with a running balance. Reads the existing
 * profile APIs (every figure is server-side); nothing is summed here.
 */

import { getCalendarSystem } from '@/lib/dates/display';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, ExternalLink, Loader2, Printer, Wallet, X } from 'lucide-react';
import { OpenItemPopup, PaymentPopup, printStatement } from '@/components/ledgers/ledger-actions';
import { money } from '@/components/erp';
import { erpFetch } from '@/components/erp/use-report';
import { BillDetailDrawer } from '@/components/bills/bill-detail';
import { formatCalendarDate } from '@/lib/dates/calendar';

const TYPE_LABEL = {
  credit_sale: 'Credit sale', credit_payment: 'Credit collection', collection: 'Credit collection', payment: 'Payment',
  reversal: 'Reversal', void: 'Void', adjustment: 'Adjustment', opening: 'Opening balance', purchase: 'Purchase',
};
const label = (value) => TYPE_LABEL[String(value || '').toLowerCase()] || String(value || '').replaceAll('_', ' ');

function Kpi({ title, value, sub, danger }) {
  return (
    <div className={`min-w-0 rounded-xl border p-4 ${danger ? 'border-rose-200 bg-rose-50/70' : 'border-stone-200 bg-white'}`}>
      <p className={`text-[11px] font-bold uppercase tracking-[0.06em] ${danger ? 'text-rose-700' : 'text-stone-500'}`}>{title}</p>
      <p className={`mt-1 truncate text-[26px] font-extrabold tabular-nums ${danger ? 'text-rose-700' : 'text-stone-900'}`}>{value}</p>
      <p className={`mt-0.5 text-[11.5px] ${danger ? 'text-rose-600' : 'text-stone-500'}`}>{sub}</p>
    </div>
  );
}

export function LedgerStatement({ kind, id, onClose, onChanged, calendarSystem = getCalendarSystem() }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [openBill, setOpenBill] = useState(null);
  const [pay, setPay] = useState(null); // { amount, note, purchaseId, hint }
  const [item, setItem] = useState(null);
  const [printMenu, setPrintMenu] = useState(false);
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState('');
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const isCustomer = kind === 'customer';

  useEffect(() => {
    let alive = true;
    setData(null);
    erpFetch(isCustomer ? `/api/customers/${id}/profile` : `/api/suppliers/${id}`)
      .then((body) => { if (alive) setData(body); })
      .catch((loadError) => { if (alive) setError(loadError.message || 'Unable to load the statement.'); });
    return () => { alive = false; };
  }, [id, isCustomer, version]);

  // Escape closes the statement (the bill drawer handles its own Escape first).
  useEffect(() => {
    if (openBill || pay || item) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') closeRef.current?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openBill, pay, item]);

  const fmtDate = (value) => (value ? formatCalendarDate(value, calendarSystem) : '—');

  // Normalise both ledgers to one shape.
  let view = null;
  if (data) {
    if (isCustomer) {
      const billDates = new Map((data.bills || []).map((bill) => [String(bill.id), bill.createdAt]));
      view = {
        name: data.customer.name,
        phone: data.customer.phone || '',
        subtitle: `Customer credit account${data.customer.phone ? ` · ${data.customer.phone}` : ''}`,
        owed: data.summary.creditOutstanding,
        openCount: data.summary.openBills,
        profileHref: `/admin/customers/${id}`,
        payHref: '/cashier/credit',
        payLabel: 'Receive payment',
        openTitle: 'Bills still awaiting payment',
        openNote: 'Select a bill to see its items and payments.',
        open: (data.openInvoices || []).map((row) => ({
          key: row.billId, label: row.label, date: billDates.get(String(row.billId)), total: row.total, due: row.open, billId: row.billId,
          status: row.open < row.total ? 'PARTIALLY PAID' : 'UNPAID',
        })),
        statement: [...(data.ledger || [])].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || Number(a.id) - Number(b.id)).map((row) => ({
          key: row.id, date: row.createdAt, detail: [label(row.type), row.billNumber, row.note || row.title].filter(Boolean).join(' · '), added: row.debit, removed: row.credit, balance: row.balance, billId: row.billId,
        })),
      };
    } else {
      const s = data.supplier;
      view = {
        name: s.name,
        phone: s.phone || '',
        subtitle: `Supplier account${s.phone ? ` · ${s.phone}` : ''}${s.contactPerson ? ` · ${s.contactPerson}` : ''}`,
        owed: data.summary.outstanding,
        openCount: data.summary.openInvoices,
        profileHref: `/admin/suppliers/${id}`,
        payHref: `/admin/suppliers/${id}`,
        payLabel: 'Pay supplier',
        openTitle: 'Invoices still to be paid',
        openNote: 'Oldest first — payments settle the oldest invoice first.',
        open: (data.openInvoices || []).map((row, index) => {
          const purchase = (data.purchases || []).find((p) => String(p.id) === String(row.purchaseId));
          return { key: row.purchaseId || `opening-${index}`, purchaseId: row.purchaseId || null, label: row.label, date: purchase?.date || s.createdAt, total: row.total, due: row.open, status: row.open < row.total ? 'PARTIALLY PAID' : 'UNPAID' };
        }),
        statement: [
          ...(Number(data.openingBalance) ? [{ key: 'opening', date: s.createdAt, detail: 'Opening balance — owed when the supplier was added', added: data.openingBalance, removed: 0, balance: data.openingBalance }] : []),
          ...(data.entries || []).map((row) => ({
            key: `${row.kind}-${row.id}`, date: row.date || row.createdAt, detail: [row.number, row.description].filter(Boolean).join(' · '), added: row.owedIncrease, removed: row.owedDecrease, balance: row.balance, muted: row.status && !['RECEIVED', 'ACTIVE'].includes(row.status),
          })),
        ],
      };
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-900/40 p-3 sm:p-8" role="dialog" aria-modal="true" aria-label={view ? `${view.name} statement` : 'Statement'} onClick={onClose}>
      <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-extrabold text-stone-900">{view?.name || 'Loading…'}</h2>
            <p className="text-xs text-stone-500">{view?.subtitle || ''}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700"><X className="h-5 w-5" /></button>
        </div>

        <div className="max-h-[calc(100vh-10rem)] overflow-y-auto px-5 py-5 sm:px-6">
          {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p> : null}
          {!view && !error ? <p className="flex items-center justify-center gap-2 py-16 text-sm text-stone-500"><Loader2 className="h-4 w-4 animate-spin" />Loading statement…</p> : null}
          {view ? (
            <div>
              <h1 className="hidden text-lg font-bold print:block">{view.name} — statement</h1>
              <div className="grid gap-3 sm:grid-cols-3">
                <Kpi danger={view.owed > 0} title="Total still owed" value={money(view.owed)} sub={isCustomer ? 'Amount this customer needs to pay' : 'Amount the salon owes this supplier'} />
                <Kpi title={isCustomer ? 'Open bills' : 'Open invoices'} value={view.openCount} sub={isCustomer ? 'Bills that still have a balance' : 'Purchases not fully paid'} />
                <Kpi title="Ledger entries" value={view.statement.length} sub={isCustomer ? 'Charges, payments and adjustments' : 'Opening, purchases and payments'} />
              </div>

              <div className="no-print mt-4 flex flex-wrap gap-2 border-b border-stone-100 pb-4">
                <Link href={view.profileHref} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700 hover:bg-stone-50"><ExternalLink className="h-4 w-4" />View profile</Link>
                {view.owed > 0 ? <button type="button" onClick={() => setPay({})} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-stone-900 px-3 text-sm font-semibold text-white hover:bg-stone-800"><Wallet className="h-4 w-4" />{view.payLabel}</button> : null}
                <div className="relative">
                  <button type="button" onClick={() => setPrintMenu((open) => !open)} aria-expanded={printMenu} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700 hover:bg-stone-50"><Printer className="h-4 w-4" />Print statement<ChevronDown className="h-3.5 w-3.5" /></button>
                  {printMenu ? (
                    <div className="absolute left-0 top-full z-10 mt-1 w-60 overflow-hidden rounded-xl border border-stone-200 bg-white py-1 shadow-lg" role="menu">
                      <button type="button" role="menuitem" onClick={() => { setPrintMenu(false); printStatement(view, 'all', fmtDate, kind); }} className="block w-full px-4 py-2.5 text-left text-sm text-stone-700 hover:bg-stone-50">All transactions (paid &amp; due)</button>
                      <button type="button" role="menuitem" onClick={() => { setPrintMenu(false); printStatement(view, 'due', fmtDate, kind); }} className="block w-full px-4 py-2.5 text-left text-sm text-stone-700 hover:bg-stone-50">Only what&apos;s due</button>
                    </div>
                  ) : null}
                </div>
              </div>
              {notice ? <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">{notice}</p> : null}

              <div className="mt-5">
                <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h3 className="text-[15px] font-bold text-stone-900">{view.openTitle}</h3>
                    <p className="text-xs text-stone-500">{view.openNote}</p>
                  </div>
                  <p className="text-[11px] text-stone-400">Total → amount due</p>
                </div>
                {view.open.length ? (
                  <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200">
                    {view.open.map((row) => {
                      const inner = (
                        <>
                          <div className="min-w-0">
                            <p className="font-semibold text-stone-900">{row.label}</p>
                            <p className="text-xs text-stone-400">{row.date ? fmtDate(row.date) : ''}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-3 text-sm">
                            <span className={`rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${row.status === 'UNPAID' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{row.status}</span>
                            <span className="tabular-nums text-stone-500">{money(row.total)}</span>
                            <span className="font-bold tabular-nums text-rose-700">{money(row.due)} due</span>
                            <ChevronRight className="h-4 w-4 text-stone-300" />
                          </div>
                        </>
                      );
                      return (
                        <li key={row.key}>
                          <button type="button" onClick={() => setItem(row)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-stone-50">{inner}</button>
                        </li>
                      );
                    })}
                  </ul>
                ) : <p className="rounded-xl border border-dashed border-stone-200 px-4 py-6 text-center text-sm text-stone-400">Nothing is waiting to be paid.</p>}
              </div>

              <div className="mt-6">
                <h3 className="text-[15px] font-bold text-stone-900">{isCustomer ? 'Credit statement' : 'Supplier statement'}</h3>
                <p className="mb-2 text-xs text-stone-500">
                  <strong className="text-stone-700">Added</strong> increases what is owed. <strong className="text-stone-700">Removed</strong> is a payment, void or discount that reduces it.
                </p>
                <div className="overflow-x-auto rounded-xl border border-stone-200">
                  <table className="w-full min-w-[640px] text-[13px]">
                    <thead>
                      <tr className="border-b border-stone-200 bg-stone-50 text-[11px] font-bold uppercase tracking-[0.05em] text-stone-500">
                        <th className="px-4 py-2.5 text-left">Date</th>
                        <th className="px-4 py-2.5 text-left">Details</th>
                        <th className="px-4 py-2.5 text-right">Added (debit)</th>
                        <th className="px-4 py-2.5 text-right">Removed (credit)</th>
                        <th className="px-4 py-2.5 text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {view.statement.length ? view.statement.map((row) => (
                        <tr key={row.key} onClick={row.billId ? () => setOpenBill(row.billId) : undefined} className={`${row.billId ? 'cursor-pointer hover:bg-stone-50' : ''} ${row.muted ? 'text-stone-400 line-through' : 'text-stone-800'}`}>
                          <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{fmtDate(row.date)}</td>
                          <td className="px-4 py-2.5">{row.detail}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-rose-700">{Number(row.added) ? money(row.added) : ''}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-emerald-700">{Number(row.removed) ? money(row.removed) : ''}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums text-stone-900">{row.balance === null || row.balance === undefined ? '—' : money(row.balance)}</td>
                        </tr>
                      )) : <tr><td colSpan={5} className="px-4 py-8 text-center text-stone-400">No entries yet.</td></tr>}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-stone-800 bg-stone-50 font-bold text-stone-900">
                        <td className="px-4 py-2.5" colSpan={4}>Balance now</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-rose-700">{money(view.owed)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {openBill ? <div onClick={(event) => event.stopPropagation()}><BillDetailDrawer billId={openBill} onClose={() => setOpenBill(null)} /></div> : null}
      {item && view ? (
        <div onClick={(event) => event.stopPropagation()}>
          <OpenItemPopup
            kind={kind}
            item={item}
            dateText={item.date ? fmtDate(item.date) : ''}
            onClose={() => setItem(null)}
            onOpenBill={() => { setOpenBill(item.billId); setItem(null); }}
            onPay={() => { setPay({ amount: item.due, note: `Payment for ${item.label}`, purchaseId: item.purchaseId }); setItem(null); }}
          />
        </div>
      ) : null}
      {pay && view ? (
        <div onClick={(event) => event.stopPropagation()}>
          <PaymentPopup
            kind={kind}
            party={{ id, name: view.name }}
            owed={view.owed}
            preset={pay}
            onClose={() => setPay(null)}
            onDone={() => { setPay(null); setNotice(isCustomer ? 'Payment recorded. The statement below is updated.' : 'Supplier payment recorded. The statement below is updated.'); setVersion((v) => v + 1); onChanged?.(); }}
          />
        </div>
      ) : null}
    </div>
  );
}
