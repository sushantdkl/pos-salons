'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';

export function formatTransactionDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function DetailRow({ label, value, strong = false, muted = false }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-100 py-2.5 last:border-0">
      <dt className="text-sm text-gray-600">{label}</dt>
      <dd
        className={`text-right text-sm ${
          strong ? 'font-bold text-gray-950' : muted ? 'font-medium text-gray-500' : 'font-semibold text-gray-800'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Read-only bill detail. Every money line comes from the server-normalised transaction —
 * the subtotal is shown as the pre-discount figure and never as the amount collected.
 */
export default function TransactionDetail({ transaction, onClose }) {
  useEffect(() => {
    if (!transaction) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [transaction, onClose]);

  if (!transaction) return null;

  const items = transaction.items || [];
  const services = items.filter((item) => item.type === 'service');
  const products = items.filter((item) => item.type === 'product');
  const cashAmount = Number(transaction.cashAmount || 0);
  const qrAmount = Number(transaction.qrAmount || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Transaction ${transaction.billNumber}`}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
      >
        <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-gray-200 bg-white px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-950">{transaction.billNumber}</h2>
            <p className="mt-0.5 text-sm text-gray-500">{formatTransactionDateTime(transaction.transactionDate)}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close details">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Customer</h3>
            <dl>
              <DetailRow label="Name" value={transaction.customerName || 'Walk-in Customer'} />
              <DetailRow label="Phone" value={transaction.customerPhone || 'Not recorded'} />
              <DetailRow label="Token" value={transaction.tokenNumber || 'Direct bill (no token)'} />
              <DetailRow label="Created by" value={transaction.createdByName || 'Not recorded'} />
            </dl>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Services &amp; Products</h3>
            {items.length ? (
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {[...services, ...products].map((item, index) => (
                      <tr key={`${item.name}-${index}`}>
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-gray-900">{item.name}</p>
                          <p className="text-xs text-gray-500">
                            {item.type === 'service'
                              ? item.staffName || 'Unassigned staff'
                              : `Qty ${item.quantity}`}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-gray-900">
                          {formatCurrency(item.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">No line items recorded for this bill.</p>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Bill Total</h3>
            <dl>
              <DetailRow label="Subtotal (before discount)" value={formatCurrency(transaction.subtotal)} />
              <DetailRow
                label={`Discount${transaction.discountType === 'percentage' ? ' (percentage)' : ''}`}
                value={`- ${formatCurrency(transaction.discountAmount)}`}
              />
              {Number(transaction.tax || 0) > 0 ? <DetailRow label="Tax" value={formatCurrency(transaction.tax)} /> : null}
              {Number(transaction.serviceCharge || 0) > 0 ? (
                <DetailRow label="Service charge" value={formatCurrency(transaction.serviceCharge)} />
              ) : null}
              <DetailRow label="Final total" value={formatCurrency(transaction.grandTotal)} strong />
            </dl>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Payment</h3>
            <dl>
              <DetailRow label="Payment method" value={transaction.paymentLabel || transaction.paymentMethod || 'Not recorded'} />
              <DetailRow label="Cash collected" value={formatCurrency(cashAmount)} />
              <DetailRow label="QR collected" value={formatCurrency(qrAmount)} />
              <DetailRow label="QR type" value={transaction.qrTypeLabel || 'Not recorded'} />
              <DetailRow label="Total collected" value={formatCurrency(cashAmount + qrAmount)} strong />
              {Number(transaction.amountPaid || 0) > Number(transaction.grandTotal || 0) ? (
                <DetailRow
                  label="Cash tendered / change"
                  value={`${formatCurrency(transaction.amountPaid)} / ${formatCurrency(Number(transaction.amountPaid) - Number(transaction.grandTotal))}`}
                  muted
                />
              ) : null}
              <DetailRow label="Print status" value={transaction.isPrinted ? 'Printed' : 'Digital'} />
              <DetailRow label="Transaction status" value={transaction.status || transaction.paymentStatus || 'paid'} />
            </dl>
          </section>

          {transaction.notes ? (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</h3>
              <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{transaction.notes}</p>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
