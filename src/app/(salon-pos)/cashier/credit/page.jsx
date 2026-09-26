'use client';

/**
 * CUSTOMER CREDIT COLLECTION (admin + cashier). /api/credit/collections reduces the customer
 * ledger and, for cash, adds to the open drawer in one transaction. Idempotency-Key makes a
 * double click safe.
 */

import { useEffect, useRef, useState } from 'react';
import { HandCoins } from 'lucide-react';
import { AlertBanner, ErpButton, ErpPage, PageHeader, ReportSection } from '@/components/erp';
import { erpFetch } from '@/components/erp/use-report';

const EMPTY = { customer_id: '', amount: '', payment_method: 'cash', cash_tendered: '', provider: '', reference_number: '', note: '' };
const FIELD = 'mt-1 block h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900 focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-200';
const LABEL = 'block text-xs font-bold uppercase tracking-[0.04em] text-stone-500';

export default function CreditCollectionPage() {
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const key = useRef(null);

  useEffect(() => {
    erpFetch('/api/admin/customers').then((data) => setCustomers(data.customers || [])).catch(() => setError('Unable to load customers.'));
  }, []);

  const set = (field, value) => { setForm((current) => ({ ...current, [field]: value })); setError(''); setResult(null); };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    if (!key.current) key.current = crypto.randomUUID();
    try {
      const data = await erpFetch('/api/credit/collections', {
        method: 'POST',
        headers: { 'Idempotency-Key': key.current },
        body: {
          ...form,
          customer_id: Number(form.customer_id),
          amount: Number(form.amount),
          cash_tendered: form.payment_method === 'cash' ? Number(form.cash_tendered || form.amount) : undefined,
        },
      });
      key.current = null;
      setResult(data);
      setForm(EMPTY);
    } catch (submitError) {
      setError(submitError.message || 'Unable to collect credit');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ErpPage narrow>
      <PageHeader
        icon={HandCoins}
        iconTone="inflow"
        title="Credit collection"
        subtitle="Record money received against a customer's credit. It reduces their balance and, if paid in cash, goes into the open drawer."
      />
      <div className="space-y-4">
        {result ? (
          <AlertBanner tone="inflow" title={`Collected Rs ${Number(result.amount).toFixed(2)} from ${result.customer}`}>
            {result.change ? `Give change: Rs ${Number(result.change).toFixed(2)}.` : 'The customer ledger has been updated.'}
          </AlertBanner>
        ) : null}
        {error ? <AlertBanner tone="outflow">{error}</AlertBanner> : null}

        <ReportSection>
          <form onSubmit={submit} className="space-y-4 p-4 sm:p-5">
            <label className={LABEL}>Customer *
              <select required value={form.customer_id} onChange={(event) => set('customer_id', event.target.value)} className={FIELD}>
                <option value="">Select customer</option>
                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</option>)}
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={LABEL}>Amount *
                <input required min="0.01" step="0.01" type="number" inputMode="decimal" value={form.amount} onChange={(event) => set('amount', event.target.value)} className={FIELD} />
              </label>
              <label className={LABEL}>Received via
                <select value={form.payment_method} onChange={(event) => set('payment_method', event.target.value)} className={FIELD}>
                  <option value="cash">Cash</option>
                  <option value="online">Online / QR</option>
                </select>
              </label>
            </div>
            {form.payment_method === 'cash' ? (
              <label className={LABEL}>Cash tendered
                <input type="number" min="0" step="0.01" inputMode="decimal" value={form.cash_tendered} onChange={(event) => set('cash_tendered', event.target.value)} placeholder={form.amount || '0.00'} className={FIELD} />
              </label>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={LABEL}>Provider<input value={form.provider} onChange={(event) => set('provider', event.target.value)} placeholder="eSewa, bank…" className={FIELD} /></label>
                <label className={LABEL}>Reference<input value={form.reference_number} onChange={(event) => set('reference_number', event.target.value)} className={FIELD} /></label>
              </div>
            )}
            <label className={LABEL}>Note<input value={form.note} onChange={(event) => set('note', event.target.value)} className={FIELD} /></label>
            <ErpButton type="submit" variant="primary" disabled={busy}>{busy ? 'Recording…' : 'Record collection'}</ErpButton>
          </form>
        </ReportSection>
      </div>
    </ErpPage>
  );
}
