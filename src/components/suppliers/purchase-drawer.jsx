'use client';

/** Purchase detail drawer: lines, totals, how it was paid, and void (stock must still be on hand). */

import { useState } from 'react';
import { X } from 'lucide-react';
import { AlertBanner, ErpButton, FinancialTable, LoadingState, money, StatusBadge } from '@/components/erp';
import { erpFetch, useReport } from '@/components/erp/use-report';

export default function PurchaseDrawer({ id, onClose, onVoided }) {
  const { data, error, loading } = useReport(`/api/purchases/${id}`);
  const [reason, setReason] = useState('');
  const [voidError, setVoidError] = useState('');
  const [busy, setBusy] = useState(false);
  const purchase = data?.purchase;
  const doVoid = async () => {
    setBusy(true);
    setVoidError('');
    try {
      await erpFetch(`/api/purchases/${id}`, { method: 'POST', body: { action: 'void', reason } });
      onVoided();
    } catch (err) { setVoidError(err.message); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Purchase detail">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:max-w-2xl sm:rounded-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-stone-200 bg-white px-5 py-3">
          <h2 className="text-base font-bold">{purchase ? `${purchase.number} · ${purchase.supplierName}` : 'Purchase'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 px-5 py-4">
          {error ? <AlertBanner tone="outflow">{error}</AlertBanner> : null}
          {loading && !purchase ? <LoadingState /> : null}
          {purchase ? (
            <>
              <p className="text-sm text-stone-600">
                {purchase.date}
                {purchase.supplierInvoice ? ` · Invoice ${purchase.supplierInvoice}` : ''}
                {purchase.createdBy ? ` · by ${purchase.createdBy}` : ''}
                {' '}{purchase.status === 'VOID' ? <StatusBadge status="CANCELLED" label="Void" /> : <StatusBadge status="COMPLETED" label="Received" />}
              </p>
              {purchase.voidReason ? <AlertBanner tone="cash">Voided: {purchase.voidReason}</AlertBanner> : null}
              <FinancialTable
                caption="Purchase lines"
                rows={purchase.items}
                rowKey={(row, index) => `${row.productId}-${index}`}
                columns={[
                  { key: 'name', label: 'Product', render: (row) => row.name },
                  { key: 'qty', label: 'Qty', align: 'right', render: (row) => row.quantity },
                  { key: 'cost', label: 'Unit cost', align: 'right', render: (row) => money(row.unitCost) },
                  { key: 'total', label: 'Line total', align: 'right', render: (row) => money(row.lineTotal) },
                ]}
              />
              <dl className="ml-auto grid max-w-xs grid-cols-2 gap-y-1 text-sm">
                <dt className="text-stone-500">Subtotal</dt><dd className="text-right tabular-nums">{money(purchase.subtotal)}</dd>
                <dt className="text-stone-500">Discount</dt><dd className="text-right tabular-nums">− {money(purchase.discount)}</dd>
                <dt className="text-stone-500">Tax</dt><dd className="text-right tabular-nums">{money(purchase.tax)}</dd>
                <dt className="font-bold">Total</dt><dd className="text-right font-bold tabular-nums">{money(purchase.total)}</dd>
                <dt className="text-stone-500">Paid against it</dt><dd className="text-right tabular-nums">{money(purchase.paidAgainst)}</dd>
              </dl>
              {purchase.status === 'RECEIVED' ? (
                <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
                  <p className="text-xs text-rose-700">Voiding takes the received stock back out and removes it from what you owe. Payments made against it must be voided first.</p>
                  <input className="h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm" placeholder="Reason (required)" value={reason} onChange={(event) => setReason(event.target.value)} aria-label="Void reason" />
                  {voidError ? <AlertBanner tone="outflow">{voidError}</AlertBanner> : null}
                  <ErpButton variant="danger" disabled={busy || !reason.trim()} onClick={doVoid}>Void purchase</ErpButton>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
