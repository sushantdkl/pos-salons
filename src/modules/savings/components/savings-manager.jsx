'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, Landmark, Plus, RefreshCw, Search, Wallet, X } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';

const PERIOD_ORDER = ['today', '3days', '7days', 'month'];

const EMPTY_FORM = {
  id: null,
  depositType: 'BANK_DEPOSIT',
  amount: '',
  sourceAccount: 'CASH',
  institutionName: '',
  referenceNumber: '',
  depositDate: '',
  notes: '',
};

function todayInNepal() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
}

const FIELD =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-400';
const LABEL = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600';

function TotalsCard({ label, range, totals }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
        <p className="text-[11px] text-gray-400">{range}</p>
      </div>
      <p className="mt-2 text-2xl font-semibold text-gray-950">{formatCurrency(totals?.savingsTransfers)}</p>
      <dl className="mt-3 space-y-1.5 border-t border-gray-100 pt-3 text-xs">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-gray-500">From cash</dt>
          <dd className="font-semibold text-gray-800">{formatCurrency(totals?.savingsFromCash)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-gray-500">From online</dt>
          <dd className="font-semibold text-gray-800">{formatCurrency(totals?.savingsFromOnline)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-gray-500">Deposits</dt>
          <dd className="font-semibold text-gray-800">{Number(totals?.records || 0)}</dd>
        </div>
      </dl>
    </div>
  );
}

export default function SavingsManager({ title, description }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM, depositDate: todayInNepal() });
  const [filters, setFilters] = useState({ search: '', depositType: 'all', sourceAccount: 'all', from: '', to: '' });

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== 'all') params.set(key, value);
      });
      const response = await fetch(`/api/savings?${params.toString()}`, {
        cache: 'no-store',
        headers: authHeaders(),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not load savings deposits');
      setData(payload);
    } catch (err) {
      setError(err.message || 'Could not load savings deposits');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const depositTypes = data?.depositTypes || [];
  const sourceAccounts = data?.sourceAccounts || [];
  const deposits = data?.deposits || [];
  const totals = data?.totals || {};
  const canEdit = Boolean(data?.canEdit);

  const requiresInstitution = form.depositType !== 'OTHER_SAVING';

  const listedTotal = useMemo(
    () => deposits.filter((row) => row.status === 'ACTIVE').reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [deposits]
  );

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, depositDate: todayInNepal() });
    setFormOpen(true);
    setError('');
  };

  const openEdit = (deposit) => {
    setForm({
      id: deposit.id,
      depositType: deposit.depositType,
      amount: String(deposit.amount ?? ''),
      sourceAccount: deposit.sourceAccount,
      institutionName: deposit.institutionName || '',
      referenceNumber: deposit.referenceNumber || '',
      depositDate: String(deposit.depositDate || '').slice(0, 10),
      notes: deposit.notes || '',
    });
    setFormOpen(true);
    setError('');
  };

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return; // Guards against a double click creating two deposits.

    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Amount must be greater than zero');
      return;
    }
    if (requiresInstitution && !form.institutionName.trim()) {
      setError('Bank or Sahakari name is required for this deposit type');
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/savings', {
        method: form.id ? 'PUT' : 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ ...form, amount }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not save the deposit');
      setNotice(payload.message || 'Savings deposit saved');
      setFormOpen(false);
      setForm({ ...EMPTY_FORM, depositDate: todayInNepal() });
      await load();
    } catch (err) {
      setError(err.message || 'Could not save the deposit');
    } finally {
      setSaving(false);
    }
  };

  const cancelDeposit = async (deposit) => {
    const reason = window.prompt(`Cancel the ${deposit.depositTypeLabel} of ${formatCurrency(deposit.amount)}? Enter a reason:`);
    if (reason === null) return;
    setError('');
    try {
      const response = await fetch(`/api/savings?id=${deposit.id}&reason=${encodeURIComponent(reason)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not cancel the deposit');
      setNotice('Savings deposit cancelled');
      await load();
    } catch (err) {
      setError(err.message || 'Could not cancel the deposit');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-950 sm:text-3xl">{title}</h1>
            <p className="mt-1 text-sm text-gray-600">{description}</p>
            <span className="mt-2 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              Savings Transfer — Not an Expense
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={load}
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-gray-950 px-4 text-sm font-semibold text-white hover:bg-gray-800"
            >
              <Plus className="h-4 w-4" />
              Add Savings Deposit
            </button>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>
        ) : null}
        {notice ? (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</div>
        ) : null}

        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {PERIOD_ORDER.map((period) => (
            <TotalsCard
              key={period}
              label={totals[period]?.label || period}
              range={totals[period]?.displayRange || ''}
              totals={totals[period]}
            />
          ))}
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <Wallet className="h-4 w-4" />
              <p className="text-xs font-semibold uppercase tracking-wide">Net Cash Collections (This Month)</p>
            </div>
            <p className="mt-2 text-xl font-semibold text-gray-950">{formatCurrency(totals.month?.netCashInHand)}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <Landmark className="h-4 w-4" />
              <p className="text-xs font-semibold uppercase tracking-wide">Net Online Balance (This Month)</p>
            </div>
            <p className="mt-2 text-xl font-semibold text-gray-950">{formatCurrency(totals.month?.netOnlineBalance)}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <Banknote className="h-4 w-4" />
              <p className="text-xs font-semibold uppercase tracking-wide">Listed Deposits Total</p>
            </div>
            <p className="mt-2 text-xl font-semibold text-gray-950">{formatCurrency(listedTotal)}</p>
          </div>
        </div>

        {formOpen ? (
          <form onSubmit={submit} className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-gray-950">
                {form.id ? 'Edit savings deposit' : 'New savings deposit'}
              </h2>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                aria-label="Close form"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className={LABEL} htmlFor="savings-deposit-type">Deposit Type</label>
                <select
                  id="savings-deposit-type"
                  className={FIELD}
                  value={form.depositType}
                  onChange={(event) => setForm({ ...form, depositType: event.target.value })}
                >
                  {depositTypes.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={LABEL} htmlFor="savings-amount">Amount (Rs)</label>
                <input
                  id="savings-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  className={`${FIELD} text-right`}
                  value={form.amount}
                  onChange={(event) => setForm({ ...form, amount: event.target.value })}
                />
              </div>

              <div>
                <label className={LABEL} htmlFor="savings-source">Source Account</label>
                <select
                  id="savings-source"
                  className={FIELD}
                  value={form.sourceAccount}
                  onChange={(event) => setForm({ ...form, sourceAccount: event.target.value })}
                >
                  {sourceAccounts.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={LABEL} htmlFor="savings-institution">
                  Bank / Sahakari Name{requiresInstitution ? '' : ' (optional)'}
                </label>
                <input
                  id="savings-institution"
                  type="text"
                  className={FIELD}
                  required={requiresInstitution}
                  value={form.institutionName}
                  onChange={(event) => setForm({ ...form, institutionName: event.target.value })}
                />
              </div>

              <div>
                <label className={LABEL} htmlFor="savings-reference">Reference Number (optional)</label>
                <input
                  id="savings-reference"
                  type="text"
                  className={FIELD}
                  value={form.referenceNumber}
                  onChange={(event) => setForm({ ...form, referenceNumber: event.target.value })}
                />
              </div>

              <div>
                <label className={LABEL} htmlFor="savings-date">Deposit Date</label>
                <input
                  id="savings-date"
                  type="date"
                  required
                  max={todayInNepal()}
                  className={FIELD}
                  value={form.depositDate}
                  onChange={(event) => setForm({ ...form, depositDate: event.target.value })}
                />
              </div>

              <div className="sm:col-span-2 lg:col-span-3">
                <label className={LABEL} htmlFor="savings-notes">Notes (optional)</label>
                <textarea
                  id="savings-notes"
                  rows={2}
                  className={FIELD}
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                />
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex h-11 items-center rounded-lg bg-gray-950 px-5 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save Deposit'}
              </button>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="inline-flex h-11 items-center rounded-lg border border-gray-300 bg-white px-5 text-sm font-semibold text-gray-800 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        <div className="mb-4 grid gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search bank, reference, notes"
              className={`${FIELD} pl-9`}
              value={filters.search}
              onChange={(event) => setFilters({ ...filters, search: event.target.value })}
            />
          </div>
          <select
            className={FIELD}
            value={filters.depositType}
            aria-label="Filter by deposit type"
            onChange={(event) => setFilters({ ...filters, depositType: event.target.value })}
          >
            <option value="all">All deposit types</option>
            {depositTypes.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select
            className={FIELD}
            value={filters.sourceAccount}
            aria-label="Filter by source account"
            onChange={(event) => setFilters({ ...filters, sourceAccount: event.target.value })}
          >
            <option value="all">All source accounts</option>
            {sourceAccounts.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <input
            type="date"
            className={FIELD}
            aria-label="From date"
            value={filters.from}
            onChange={(event) => setFilters({ ...filters, from: event.target.value })}
          />
          <input
            type="date"
            className={FIELD}
            aria-label="To date"
            value={filters.to}
            onChange={(event) => setFilters({ ...filters, to: event.target.value })}
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80">
                  {['Date', 'Deposit Type', 'Bank / Sahakari', 'Source Account', 'Reference', 'Recorded By', 'Status', 'Amount', ''].map((heading) => (
                    <th
                      key={heading || 'actions'}
                      className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-600 ${
                        heading === 'Amount' ? 'text-right' : 'text-left'
                      }`}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-500">Loading savings deposits…</td>
                  </tr>
                ) : deposits.length ? (
                  deposits.map((deposit) => (
                    <tr key={deposit.id} className={`hover:bg-gray-50 ${deposit.status === 'CANCELLED' ? 'opacity-60' : ''}`}>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">{formatDate(deposit.depositDate)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{deposit.depositTypeLabel}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{deposit.institutionName || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{deposit.sourceAccountLabel}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{deposit.referenceNumber || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{deposit.createdByName || '-'}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ${
                          deposit.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {deposit.status === 'ACTIVE' ? 'Active' : 'Cancelled'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-gray-950">
                        {formatCurrency(deposit.amount)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                        {canEdit && deposit.status === 'ACTIVE' ? (
                          <div className="flex justify-end gap-3">
                            <button type="button" onClick={() => openEdit(deposit)} className="font-semibold text-gray-950 hover:underline">
                              Edit
                            </button>
                            <button type="button" onClick={() => cancelDeposit(deposit)} className="font-semibold text-red-600 hover:underline">
                              Cancel
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-500">
                      No savings deposits found for these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
