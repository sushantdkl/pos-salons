'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, ReceiptText, Search, Wallet } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';

const categoryLabels = {
  TEA_SNACKS: 'Tea and snacks',
  WATER_JAR: 'Water jar',
  CLEANING: 'Cleaning supplies',
  TRANSPORT: 'Small transport',
  MAINTENANCE: 'Small maintenance',
  PETTY_PURCHASE: 'Petty cash purchase',
  OTHER_EXPENSE: 'Other daily expense',
  DAILY_SAVING: 'Daily saving / cash transfer',
};

const emptyForm = {
  title: '',
  category: 'TEA_SNACKS',
  amount: '',
  paymentMethod: 'CASH',
  notes: '',
  referenceNumber: '',
};

function todayValue() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export default function CashierDailyExpensesPage() {
  const [data, setData] = useState({ categories: Object.keys(categoryLabels), expenses: [], summary: {} });
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    const response = await fetch(`/api/cashier/daily-expenses?${params.toString()}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` },
    });
    const payload = await response.json();
    if (response.ok) setData(payload);
    else setError(payload.error || 'Could not load daily expenses');
  };

  useEffect(() => {
    load();
  }, []);

  const visibleExpenses = useMemo(() => data.expenses || [], [data]);

  const saveExpense = async (event) => {
    event.preventDefault();
    if (saving) return;
    setError('');
    setMessage('');
    if (!form.title.trim()) {
      setError('Expense title is required');
      return;
    }
    if (Number(form.amount || 0) <= 0) {
      setError('Amount must be greater than zero');
      return;
    }
    setSaving(true);
    const response = await fetch('/api/cashier/daily-expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('pos_token')}` },
      body: JSON.stringify({ ...form, expenseDate: todayValue() }),
    });
    const payload = await response.json();
    setSaving(false);
    if (!response.ok) {
      setError(payload.error || 'Could not save daily expense');
      return;
    }
    setMessage(payload.message || 'Saved');
    setForm(emptyForm);
    load();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-950 sm:text-3xl">Daily Expenses</h1>
          <p className="mt-1 text-sm text-gray-600">Record today&apos;s petty expenses and daily cash transfers.</p>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <ReceiptText className="mb-3 h-6 w-6 text-gray-700" />
            <p className="text-sm text-gray-500">Today&apos;s petty expenses</p>
            <p className="mt-1 text-2xl font-semibold text-gray-950">{formatCurrency(data.summary?.todayExpenses || 0)}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <Wallet className="mb-3 h-6 w-6 text-gray-700" />
            <p className="text-sm text-gray-500">Daily saving / cash transfer</p>
            <p className="mt-1 text-2xl font-semibold text-gray-950">{formatCurrency(data.summary?.todaySavings || 0)}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <Plus className="mb-3 h-6 w-6 text-gray-700" />
            <p className="text-sm text-gray-500">Records today</p>
            <p className="mt-1 text-2xl font-semibold text-gray-950">{data.summary?.todayRecords || 0}</p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
          <form onSubmit={saveExpense} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 font-semibold text-gray-950">Add Record</h2>
            {error ? <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
            {message ? <p className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">{message}</p> : null}
            <div className="space-y-3">
              <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Title" className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950" />
              <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950">
                {(data.categories || Object.keys(categoryLabels)).map((category) => <option key={category} value={category}>{categoryLabels[category] || category}</option>)}
              </select>
              <input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="Amount" className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950" />
              <select value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950">
                <option value="CASH">Cash</option>
                <option value="ONLINE">Online</option>
                <option value="BANK">Bank</option>
              </select>
              <input value={form.referenceNumber} onChange={(event) => setForm({ ...form, referenceNumber: event.target.value })} placeholder="Receipt/reference optional" className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950" />
              <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Notes optional" rows={3} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950" />
              <button disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gray-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Save Record
              </button>
            </div>
          </form>

          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-gray-100 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold text-gray-950">Recent Records</h2>
                <p className="text-sm text-gray-500">Only records entered by you are shown.</p>
              </div>
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" className="rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm" />
                </div>
                <button type="button" onClick={load} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold">Apply</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[720px] w-full">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr><th className="px-4 py-3">Title</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Date</th><th className="px-4 py-3 text-right">Amount</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visibleExpenses.length ? visibleExpenses.map((expense) => (
                    <tr key={expense.id}>
                      <td className="px-4 py-3 font-medium text-gray-950">{expense.title}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{expense.recordType === 'CASH_TRANSFER' ? 'Cash transfer' : 'Expense'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{categoryLabels[expense.category] || expense.category}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{expense.expenseDate}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-950">{formatCurrency(expense.amount)}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500">No expenses recorded today.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
