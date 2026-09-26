'use client';

/**
 * Click any staff / service / product / customer row in Salon Analytics to see the bills behind
 * it for the same period; click a bill to open its full details. The page provides the period
 * query through AnalyticsQueryContext.
 */

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ChevronRight, ReceiptText, X } from 'lucide-react';
import { money } from '@/components/erp';
import { erpFetch } from '@/components/erp/use-report';
import { BillDetailDrawer } from '@/components/bills/bill-detail';
import { fmtDateTime } from '@/lib/dates/display';

export const AnalyticsQueryContext = createContext('period=today');

const METHOD = { cash: 'Cash', online: 'Online', credit: 'Credit', split: 'Split' };
const VALUE_LABEL = { staff: 'Their services', service: 'Service value', product: 'Product value', customer: 'Bill total' };

/** Hook: returns [drawer element, open(kind, id, title, subtitle)]. */
export function useBillDrill() {
  const query = useContext(AnalyticsQueryContext);
  const [target, setTarget] = useState(null);
  const drawer = target ? <BillDrillDrawer query={query} target={target} onClose={() => setTarget(null)} /> : null;
  return [drawer, (kind, id, title, subtitle) => setTarget({ kind, id, title, subtitle })];
}

function BillDrillDrawer({ query, target, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [openBill, setOpenBill] = useState(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    let alive = true;
    setData(null); setError('');
    erpFetch(`/api/admin/analytics/bills?${query}&kind=${target.kind}&id=${encodeURIComponent(target.id)}`)
      .then((body) => { if (alive) setData(body); })
      .catch((err) => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [query, target.kind, target.id]);

  useEffect(() => {
    if (openBill) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openBill]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label={`${target.title} bills`} onClick={onClose}>
      <aside className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-3 border-b border-stone-200 px-5 py-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-stone-500"><ReceiptText className="h-4 w-4" aria-hidden="true" />Bills in this period</p>
            <h2 className="mt-1 truncate text-xl font-bold text-stone-950">{target.title}</h2>
            {target.subtitle ? <p className="text-sm text-stone-500">{target.subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100"><X className="h-5 w-5" /></button>
        </header>
        {data ? (
          <div className="grid grid-cols-3 gap-2 border-b border-stone-100 bg-stone-50/70 px-5 py-3 text-center">
            <div><p className="text-[11px] font-bold uppercase tracking-wide text-stone-500">Bills</p><p className="text-lg font-extrabold tabular-nums text-stone-900">{data.totals.bills}</p></div>
            <div><p className="text-[11px] font-bold uppercase tracking-wide text-stone-500">{VALUE_LABEL[target.kind]}</p><p className="text-lg font-extrabold tabular-nums text-emerald-700">{money(data.totals.lineValue)}</p></div>
            <div><p className="text-[11px] font-bold uppercase tracking-wide text-stone-500">Bill totals</p><p className="text-lg font-extrabold tabular-nums text-stone-900">{money(data.totals.billTotal)}</p></div>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {error ? <p className="m-5 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
          {!data && !error ? <p className="py-12 text-center text-sm text-stone-400">Loading bills…</p> : null}
          {data && !data.bills.length ? <p className="py-12 text-center text-sm text-stone-400">No bills in this period.</p> : null}
          {data?.bills.length ? (
            <ul className="divide-y divide-stone-100">
              {data.bills.map((bill) => (
                <li key={bill.id}>
                  <button type="button" onClick={() => setOpenBill(bill.id)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-amber-50/60 focus:bg-amber-50/70 focus:outline-none" title="Open bill details">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-baseline gap-2"><span className="font-bold text-indigo-700">{bill.number}</span><span className="text-xs text-stone-500">{fmtDateTime(bill.at)}</span></p>
                      <p className="truncate text-sm text-stone-800">{bill.customer} · <span className="text-stone-500">{bill.items}</span></p>
                      {bill.staff && target.kind !== 'staff' ? <p className="truncate text-xs text-stone-500">By {bill.staff}</p> : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-extrabold tabular-nums text-stone-900">{money(bill.lineValue)}</p>
                      <p className="text-[11px] text-stone-500">{target.kind !== 'customer' && bill.total !== bill.lineValue ? `of ${money(bill.total)} · ` : ''}{METHOD[bill.paymentMethod] || bill.paymentMethod}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-stone-300" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {data?.truncated ? <p className="px-5 py-3 text-xs text-amber-800">Showing the latest 1,000 bills — narrow the period to see older ones.</p> : null}
        </div>
      </aside>
      {openBill ? <div onClick={(event) => event.stopPropagation()}><BillDetailDrawer billId={openBill} onClose={() => setOpenBill(null)} /></div> : null}
    </div>
  );
}
