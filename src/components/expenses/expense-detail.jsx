'use client';

/**
 * Expense details — one panel used wherever an expense appears (Expenses page, Expenses report,
 * Business Day details). Loads /api/admin/expenses?id=…; shows how it was paid, when, by whom,
 * which business day / session it belongs to, and the advance or salary payment it came from.
 *
 *   <ExpenseDetailPanel id={42} onClose={…} onEdit={(expense) => …} onDelete={(expense) => …} />
 * onEdit / onDelete are optional; without them the panel is read-only.
 */

import { useEffect, useState } from 'react';
import { Lock, Pencil, Receipt, Trash2 } from 'lucide-react';
import { StatusBadge, money } from '@/components/erp';
import { erpFetch } from '@/components/erp/use-report';
import { fmtDate, fmtDateTime, fmtMonth } from '@/lib/dates/display';
import { DetailCard, DetailRow, SidePanel } from '@/components/shared/side-panel';

const METHOD = { cash: 'Cash', online: 'Online', bank_transfer: 'Bank transfer', mixed: 'Cash + online' };
const SOURCE = {
  manual: 'Entered on the Expenses page',
  advance: 'Salary / commission advance',
  salary: 'Salary settlement',
  commission: 'Commission settlement',
  supplier: 'Supplier payment',
};
const ADVANCE_STATUS = { OUTSTANDING: 'Not yet deducted', PARTIALLY_APPLIED: 'Partly deducted', APPLIED: 'Fully deducted', CANCELLED: 'Cancelled' };

export function ExpenseDetailPanel({ id, onClose, onEdit, onDelete }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setData(null); setError('');
    erpFetch(`/api/admin/expenses?id=${id}`)
      .then((json) => { if (live) setData(json); })
      .catch((loadError) => { if (live) setError(loadError.message); });
    return () => { live = false; };
  }, [id]);

  const e = data?.expense;
  const editable = e && !e.locked && !e.deleted;
  return (
    <SidePanel
      eyebrow="Expense details"
      icon={Receipt}
      title={e ? money(e.amount) : '…'}
      subtitle={e ? `${e.title} · ${fmtDate(e.expenseDate)}` : ''}
      badge={e ? (e.deleted ? <StatusBadge status="CANCELLED" label="Deleted" tone="outflow" /> : <StatusBadge status="PAID" label={e.categoryLabel} tone="neutral" />) : null}
      onClose={onClose}
      footer={e && (onEdit || onDelete) ? (
        editable ? (
          <div className="flex justify-end gap-2">
            {onDelete ? <button type="button" onClick={() => onDelete(e)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-rose-200 px-3.5 text-sm font-semibold text-rose-700 hover:bg-rose-50"><Trash2 className="h-4 w-4" />Delete</button> : null}
            {onEdit ? <button type="button" onClick={() => onEdit(e)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-stone-900 px-4 text-sm font-semibold text-white hover:bg-stone-800"><Pencil className="h-4 w-4" />Edit expense</button> : null}
          </div>
        ) : e.locked ? (
          <p className="flex items-center gap-2 text-xs text-stone-500"><Lock className="h-3.5 w-3.5" />{SOURCE[e.source]} — change it from {e.source === 'supplier' ? 'Suppliers' : 'Salary & advances'} so its records stay in step.</p>
        ) : null
      ) : null}
    >
      {error ? <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
      {!e && !error ? <p className="py-10 text-center text-sm text-stone-400">Loading…</p> : null}
      {e ? (
        <div className="space-y-4">
          <DetailCard title="Payment">
            <DetailRow label="Amount" value={money(e.amount)} strong />
            <DetailRow label="Paid with" value={METHOD[e.paymentMethod] || e.paymentMethod} />
            <DetailRow label="From the cash drawer" value={money(e.cashAmount)} tone={e.cashAmount > 0 ? 'text-amber-700' : ''} />
            <DetailRow label="From online / bank" value={money(e.onlineAmount)} tone={e.onlineAmount > 0 ? 'text-sky-700' : ''} />
          </DetailCard>
          <DetailCard title="What & who">
            <DetailRow label="Expense" value={e.title} />
            <DetailRow label="Category" value={e.categoryLabel} />
            <DetailRow label="Paid to" value={e.paidTo || '—'} />
            <DetailRow label="Paid by" value={e.paidBy || '—'} />
            <DetailRow label="Date paid" value={fmtDate(e.expenseDate)} />
            {e.referenceNumber ? <DetailRow label="Bill / reference" value={e.referenceNumber} /> : null}
            {e.attachmentUrl ? <DetailRow label="Receipt" value={<a href={e.attachmentUrl} target="_blank" rel="noreferrer" className="text-indigo-700 hover:underline">Open</a>} /> : null}
          </DetailCard>
          {data.advance ? (
            <DetailCard title={data.advance.basis === 'commission' ? 'Commission advance' : 'Salary advance'}>
              <DetailRow label="Staff" value={data.advance.staffName} />
              <DetailRow label="Advance" value={money(data.advance.amount)} />
              <DetailRow label="Deducted so far" value={money(data.advance.applied)} />
              <DetailRow label="Status" value={ADVANCE_STATUS[data.advance.status] || data.advance.status} />
              {data.advance.overrideReason ? <DetailRow label="Over allowance — reason" value={data.advance.overrideReason} /> : null}
            </DetailCard>
          ) : null}
          {data.salary ? (
            <DetailCard title="Salary settlement">
              <DetailRow label="Staff" value={data.salary.staffName} />
              <DetailRow label="Month" value={fmtMonth(data.salary.salaryMonth)} />
              <DetailRow label="Gross payable" value={money(data.salary.totalPayable)} />
              {data.salary.advanceApplied > 0 ? <DetailRow label="Advance deducted" value={`− ${money(data.salary.advanceApplied)}`} tone="text-amber-700" /> : null}
              <DetailRow label="Paid" value={money(data.salary.amountPaid)} />
              <DetailRow label="Still owed" value={money(data.salary.remainingBalance)} />
            </DetailCard>
          ) : null}
          <DetailCard title="Record">
            <DetailRow label="Source" value={SOURCE[e.source] || e.source} />
            <DetailRow label="Business day" value={e.businessDate ? fmtDate(e.businessDate) : '—'} />
            <DetailRow label="Store session" value={e.sessionNumber ? `Session ${e.sessionNumber}` : '—'} />
            <DetailRow label="Entered by" value={e.createdByName || '—'} />
            <DetailRow label="Entered at" value={e.createdAt ? fmtDateTime(e.createdAt) : '—'} />
            {e.updatedByName && e.updatedAt && e.updatedAt !== e.createdAt ? <DetailRow label="Last changed" value={`${fmtDateTime(e.updatedAt)} · ${e.updatedByName}`} /> : null}
          </DetailCard>
          {e.notes && e.notes !== e.title ? <DetailCard title="Notes"><p className="py-1 text-sm text-stone-800">{e.notes}</p></DetailCard> : null}
        </div>
      ) : null}
    </SidePanel>
  );
}
