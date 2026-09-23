'use client';

/**
 * DAILY EXPENSES (cashier) — today's operating expenses. Savings deposits are transfers and
 * live on the Savings page. /api/cashier/daily-expenses enforces same-day entry, categories
 * and that cash cannot leave a drawer that does not hold it.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Receipt, Search } from 'lucide-react';
import {
  AlertBanner, count, ErpButton, ErpPage, FinancialTable, MetricCard, MetricGroup, money, PageHeader, ReportSection, SectionHeading,
} from '@/components/erp';
import { erpFetch } from '@/components/erp/use-report';

const CATEGORY_LABELS = {
  TEA_SNACKS: 'Tea and snacks',
  WATER_JAR: 'Water jar',
  CLEANING: 'Cleaning supplies',
  TRANSPORT: 'Small transport',
  MAINTENANCE: 'Small maintenance',
  PETTY_PURCHASE: 'Petty cash purchase',
  OTHER_EXPENSE: 'Other daily expense',
};
const EMPTY = { title: '', category: 'TEA_SNACKS', amount: '', paymentMethod: 'CASH', notes: '', referenceNumber: '' };
const FIELD = 'mt-1 block h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900 focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-200';
const LABEL = 'block text-xs font-bold uppercase tracking-[0.04em] text-stone-500';

function todayValue() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());
}

export default function CashierDailyExpensesPage() {
  const [data, setData] = useState({ categories: Object.keys(CATEGORY_LABELS), expenses: [], summary: {} });
  const [form, setForm] = useState(EMPTY);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async (term = search) => {
    try {
      const params = new URLSearchParams();
      if (term) params.set('search', term);
      setData(await erpFetch(`/api/cashier/daily-expenses?${params}`));
    } catch (loadError) {
      setError(loadError.message || 'Could not load daily expenses');
    }
  };
  useEffect(() => { load(''); }, []);

  const set = (field, value) => { setForm((current) => ({ ...current, [field]: value })); setError(''); setMessage(''); };

  const save = async (event) => {
    event.preventDefault();
    if (saving) return;
    if (!form.title.trim()) { setError('Expense title is required'); return; }
    if (Number(form.amount || 0) <= 0) { setError('Amount must be greater than zero'); return; }
    setSaving(true);
    try {
      const payload = await erpFetch('/api/cashier/daily-expenses', { method: 'POST', body: { ...form, expenseDate: todayValue() } });
      setMessage(payload.message || 'Saved');
      setForm(EMPTY);
      load();
    } catch (saveError) {
      setError(saveError.message || 'Could not save daily expense');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ErpPage>
      <PageHeader
        icon={Receipt}
        iconTone="outflow"
        title="Daily expenses"
        subtitle="Today's operating expenses. Bank and Sahakari deposits are transfers — record them on the Savings page."
        actions={<Link href="/dashboard/cashier/savings" className="inline-flex min-h-10 items-center rounded-lg border border-stone-300 bg-white px-3.5 text-sm font-semibold text-stone-700 hover:bg-stone-50">Savings</Link>}
      />
      <div className="space-y-4">
        <MetricGroup columns={3}>
          <MetricCard label="Today's expenses" value={money(data.summary?.todayExpenses)} tone="outflow" />
          <MetricCard label="Today's savings transfers" value={money(data.summary?.todaySavings)} tone="ledger" hint="Not an expense — money moved to savings." />
          <MetricCard label="Records today" value={count(data.summary?.todayRecords)} tone="neutral" />
        </MetricGroup>

        <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
          <ReportSection title="Add expense">
            <form onSubmit={save} className="space-y-3 p-4">
              {error ? <AlertBanner tone="outflow">{error}</AlertBanner> : null}
              {message ? <AlertBanner tone="inflow">{message}</AlertBanner> : null}
              <label className={LABEL}>Title *<input value={form.title} onChange={(event) => set('title', event.target.value)} className={FIELD} /></label>
              <label className={LABEL}>Category
                <select value={form.category} onChange={(event) => set('category', event.target.value)} className={FIELD}>
                  {(data.categories || Object.keys(CATEGORY_LABELS)).map((category) => <option key={category} value={category}>{CATEGORY_LABELS[category] || category}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className={LABEL}>Amount *<input type="number" min="0.01" step="0.01" inputMode="decimal" value={form.amount} onChange={(event) => set('amount', event.target.value)} className={FIELD} /></label>
                <label className={LABEL}>Paid by
                  <select value={form.paymentMethod} onChange={(event) => set('paymentMethod', event.target.value)} className={FIELD}>
                    <option value="CASH">Cash</option>
                    <option value="ONLINE">Online</option>
                    <option value="BANK">Bank</option>
                  </select>
                </label>
              </div>
              <label className={LABEL}>Receipt / reference<input value={form.referenceNumber} onChange={(event) => set('referenceNumber', event.target.value)} className={FIELD} /></label>
              <label className={LABEL}>Notes<textarea value={form.notes} onChange={(event) => set('notes', event.target.value)} rows={3} className={`${FIELD} h-auto py-2`} /></label>
              <ErpButton type="submit" variant="primary" disabled={saving} className="w-full">{saving ? 'Saving…' : 'Save expense'}</ErpButton>
            </form>
          </ReportSection>

          <div className="min-w-0">
            <SectionHeading
              title="Today's records"
              note="Only records you entered are shown."
              action={(
                <form onSubmit={(event) => { event.preventDefault(); load(); }} className="flex gap-2">
                  <label className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" aria-hidden="true" />
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" aria-label="Search expenses" className="h-9 w-44 rounded-lg border border-stone-200 bg-white pl-8 pr-2 text-[13px]" />
                  </label>
                  <ErpButton type="submit">Apply</ErpButton>
                </form>
              )}
            />
            <FinancialTable
              caption="Today's expense records"
              rows={data.expenses || []}
              empty="No expenses recorded today."
              columns={[
                { key: 'title', label: 'Title', render: (row) => <span className="font-semibold text-stone-900">{row.title}</span> },
                { key: 'type', label: 'Type', render: (row) => (row.recordType === 'CASH_TRANSFER' ? 'Cash transfer' : 'Expense') },
                { key: 'category', label: 'Category', render: (row) => CATEGORY_LABELS[row.category] || row.category },
                { key: 'date', label: 'Date', render: (row) => row.expenseDate },
                { key: 'amount', label: 'Amount', align: 'right', render: (row) => money(row.amount) },
              ]}
            />
          </div>
        </div>
      </div>
    </ErpPage>
  );
}
