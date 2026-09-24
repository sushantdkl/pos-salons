'use client';

/** Create / edit a supplier (admin). Server rules: unique name, opening balance fixed once used. */

import { useState } from 'react';
import { X } from 'lucide-react';
import { AlertBanner, ErpButton } from '@/components/erp';
import { erpFetch } from '@/components/erp/use-report';

const FIELD = 'mt-1 block h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900 focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-200';
const LABEL = 'block text-xs font-bold uppercase tracking-[0.04em] text-stone-500';
const EMPTY = { name: '', contactPerson: '', phone: '', email: '', address: '', panVat: '', openingBalance: '', notes: '' };

export default function SupplierForm({ initial, onClose, onSaved }) {
  const editing = Boolean(initial?.id);
  const [form, setForm] = useState(() => ({ ...EMPTY, ...(initial || {}), openingBalance: initial?.openingBalance ?? '' }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key, value) => { setForm((current) => ({ ...current, [key]: value })); setError(''); };
  const save = async () => {
    setBusy(true);
    try {
      const body = { ...form, openingBalance: Number(form.openingBalance || 0) };
      const payload = editing
        ? await erpFetch(`/api/suppliers/${initial.id}`, { method: 'PATCH', body })
        : await erpFetch('/api/suppliers', { method: 'POST', body });
      onSaved(payload.supplier);
    } catch (saveError) { setError(saveError.message); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={editing ? 'Edit supplier' : 'New supplier'}>
      <div className="flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-w-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3">
          <h2 className="text-base font-bold">{editing ? `Edit ${initial.name}` : 'New supplier'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid flex-1 gap-3 overflow-y-auto px-5 py-4 sm:grid-cols-2">
          <label className={`${LABEL} sm:col-span-2`}>Supplier name *<input className={FIELD} value={form.name} onChange={(event) => set('name', event.target.value)} /></label>
          <label className={LABEL}>Contact person<input className={FIELD} value={form.contactPerson || ''} onChange={(event) => set('contactPerson', event.target.value)} /></label>
          <label className={LABEL}>Phone<input className={FIELD} inputMode="tel" value={form.phone || ''} onChange={(event) => set('phone', event.target.value)} /></label>
          <label className={LABEL}>Email<input className={FIELD} type="email" value={form.email || ''} onChange={(event) => set('email', event.target.value)} /></label>
          <label className={LABEL}>PAN / VAT<input className={FIELD} value={form.panVat || ''} onChange={(event) => set('panVat', event.target.value)} /></label>
          <label className={`${LABEL} sm:col-span-2`}>Address<input className={FIELD} value={form.address || ''} onChange={(event) => set('address', event.target.value)} /></label>
          <label className={LABEL}>Opening balance owed
            <input className={FIELD} type="number" min="0" step="0.01" inputMode="decimal" value={form.openingBalance} onChange={(event) => set('openingBalance', event.target.value)} />
            <span className="mt-1 block text-[11px] font-normal normal-case text-stone-400">What you already owed before using this system. Fixed once there are purchases or payments.</span>
          </label>
          <label className={LABEL}>Notes<input className={FIELD} value={form.notes || ''} onChange={(event) => set('notes', event.target.value)} /></label>
          {error ? <div className="sm:col-span-2"><AlertBanner tone="outflow">{error}</AlertBanner></div> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-stone-200 px-5 py-3">
          <ErpButton onClick={onClose} disabled={busy}>Cancel</ErpButton>
          <ErpButton variant="primary" onClick={save} disabled={busy || !form.name.trim()}>{busy ? 'Saving…' : 'Save supplier'}</ErpButton>
        </div>
      </div>
    </div>
  );
}

