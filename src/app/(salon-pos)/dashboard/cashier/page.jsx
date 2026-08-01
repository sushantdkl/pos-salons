'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  Banknote,
  Bell,
  CalendarDays,
  CheckCircle2,
  Hourglass,
  PiggyBank,
  Plus,
  ReceiptText,
  RefreshCw,
  Scissors,
  Search,
  Smartphone,
  Ticket,
  Users,
} from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import FinancialOverview from '@/modules/reports/components/financial-overview';

const CARD = 'rounded-2xl border border-[#ece7e1] bg-white shadow-[0_1px_2px_rgba(40,30,20,0.04)]';
const PANEL_HEADER = 'border-b border-[#f0ece6] px-4 py-4 sm:px-5';
const BUTTON_BASE = 'inline-flex h-[38px] items-center justify-center gap-2 rounded-[10px] px-3.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#b7a4fa] disabled:cursor-not-allowed disabled:opacity-60';

const PERIOD_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: '3days', label: 'Last 3 Days' },
  { value: '7days', label: 'Last 7 Days' },
  { value: 'month', label: 'This Month' },
];

const metricStyles = {
  purple: 'bg-[#f3eafd] text-[#7c3aed]',
  teal: 'bg-[#e8f7f2] text-[#0f9f7a]',
  blue: 'bg-[#eaf5ff] text-[#1f8ad6]',
  green: 'bg-[#eaf8ef] text-[#15803d]',
  amber: 'bg-[#fff3df] text-[#c56a09]',
  rose: 'bg-[#fff0f4] text-[#e11d48]',
  coral: 'bg-[#fff0ea] text-[#e75b31]',
};

function getTodayIso() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function isValidRange(start, end) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(start || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(end || ''))) return false;
  return start <= end;
}

function numberValue(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCount(value, suffix = '') {
  const count = numberValue(value);
  return `${count}${suffix ? ` ${suffix}` : ''}`;
}

function formatTime(value) {
  if (!value) return 'Not recorded';
  return new Date(value).toLocaleTimeString('en-NP', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function categoryLabel(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function initials(name) {
  return String(name || 'Staff')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function ActionButton({ children, icon: Icon, variant = 'secondary', ...props }) {
  const classes = variant === 'primary'
    ? `${BUTTON_BASE} border border-[#6b46e5] bg-[#6b46e5] text-white shadow-[0_6px_14px_-8px_rgba(107,70,229,0.9)] hover:border-[#5a38d0] hover:bg-[#5a38d0]`
    : `${BUTTON_BASE} border border-[#e4ded6] bg-white text-[#3a342d] hover:border-[#d6cfc5] hover:bg-[#f7f5f2]`;

  return (
    <button type="button" className={classes} {...props}>
      {Icon ? <Icon className="h-4 w-4" /> : null}
      <span>{children}</span>
    </button>
  );
}

function DashboardHeader({ cashierName, dateLabel, periodLabel, rangeLabel, refreshing, onRefresh, onNavigate }) {
  return (
    <header className="border-b border-[#e9e3db] pb-5">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold leading-tight tracking-[-0.02em] text-[#17140f] sm:text-[28px]">
            Cashier Dashboard
          </h1>
          <p className="mt-1 text-sm leading-6 text-[#7a736b]">
            Bills, queue and collections for your counter shift.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium">
            <span className="inline-flex items-center gap-2 rounded-lg border border-[#e9e3db] bg-white px-3 py-1.5 text-[#5c554d]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#1f8a5b]" />
              Live
              <CalendarDays className="h-3.5 w-3.5 text-[#6b46e5]" />
              {dateLabel}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#e9e3db] bg-white px-3 py-1.5 text-[#5c554d]">
              <Users className="h-3.5 w-3.5 text-[#6b46e5]" />
              Cashier: {cashierName || 'Loading...'}
            </span>
            <span className="text-[#8a837b]">
              {periodLabel || 'Today'}{rangeLabel ? ` · ${rangeLabel}` : ''}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 xl:max-w-[650px] xl:justify-end">
          <ActionButton variant="primary" icon={Plus} onClick={() => onNavigate('/admin/billing')}>New Bill</ActionButton>
          <ActionButton icon={Ticket} onClick={() => onNavigate('/dashboard/cashier/tokens')}>Generate Token</ActionButton>
          <ActionButton icon={ReceiptText} onClick={() => onNavigate('/dashboard/cashier/daily-expenses')}>Add Daily Expense</ActionButton>
          <ActionButton icon={PiggyBank} onClick={() => onNavigate('/dashboard/cashier/savings')}>Add Saving</ActionButton>
          <ActionButton icon={Search} onClick={() => onNavigate('/admin/customers')}>Find Customer</ActionButton>
          <ActionButton icon={RefreshCw} onClick={onRefresh} disabled={refreshing}>
            {refreshing ? 'Refreshing' : 'Refresh'}
          </ActionButton>
        </div>
      </div>
    </header>
  );
}

const PERIOD_TABS = [...PERIOD_OPTIONS, { value: 'custom', label: 'Custom Range' }];

function PeriodSelector({ value, onChange, displayRange, onViewTransactions, onViewReports, customRange, onCustomChange, onApplyCustom, today }) {
  return (
    <div className="flex flex-col gap-3 py-1">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div
          role="tablist"
          aria-label="Report period"
          className="grid grid-cols-2 gap-1 rounded-xl bg-[#efebe5] p-1 sm:inline-grid sm:grid-cols-5"
        >
          {PERIOD_TABS.map((option) => {
            const active = value === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onChange(option.value)}
                className={`h-9 rounded-[9px] px-3 text-[12.5px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#b7a4fa] ${
                  active
                    ? 'bg-white text-[#17140f] shadow-[0_1px_2px_rgba(30,20,10,0.10)]'
                    : 'text-[#6a635b] hover:text-[#1a1714]'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#9a938b]">Selected range</span>
          <span className="text-sm font-extrabold text-[#2a251f]">{displayRange || 'Nepal calendar dates'}</span>
        </div>

        <div className="flex flex-wrap gap-2 lg:ml-auto">
          <ActionButton onClick={onViewTransactions}>View All Transactions</ActionButton>
          <ActionButton onClick={onViewReports}>Full Reports</ActionButton>
        </div>
      </div>

      {value === 'custom' ? (
        <form
          onSubmit={(event) => { event.preventDefault(); onApplyCustom(); }}
          className="flex flex-col gap-2 rounded-xl border border-[#ece7e1] bg-white p-3 sm:flex-row sm:items-end"
        >
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8a837b]">
            From
            <input
              type="date"
              required
              max={customRange.end || today}
              value={customRange.start}
              onChange={(event) => onCustomChange({ ...customRange, start: event.target.value })}
              className="h-9 rounded-lg border border-[#e4ded6] bg-white px-3 text-sm font-medium text-[#3a342d] focus:border-[#b7a4fa] focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8a837b]">
            To
            <input
              type="date"
              required
              min={customRange.start || undefined}
              max={today}
              value={customRange.end}
              onChange={(event) => onCustomChange({ ...customRange, end: event.target.value })}
              className="h-9 rounded-lg border border-[#e4ded6] bg-white px-3 text-sm font-medium text-[#3a342d] focus:border-[#b7a4fa] focus:outline-none"
            />
          </label>
          <ActionButton variant="primary" onClick={onApplyCustom}>Apply Range</ActionButton>
        </form>
      ) : null}
    </div>
  );
}

function Panel({ title, description, children, className = '' }) {
  return (
    <section className={`${CARD} overflow-hidden ${className}`}>
      <div className={PANEL_HEADER}>
        <h2 className="text-[15px] font-bold text-[#17140f]">{title}</h2>
        {description ? <p className="mt-1 text-xs leading-5 text-[#8a837b]">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ icon: Icon = CheckCircle2, title, description }) {
  return (
    <div className="flex min-h-[150px] flex-col items-center justify-center px-6 py-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f4effb] text-[#7c3aed]">
        <Icon className="h-7 w-7" />
      </div>
      <p className="mt-3 text-sm font-semibold text-[#241b31]">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-xs leading-5 text-[#7c7284]">{description}</p> : null}
    </div>
  );
}


function MiniStat({ label, value, icon: Icon, tone = 'purple' }) {
  return (
    <div className="rounded-xl border border-[#f0ece6] bg-[#fbfaf8] px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-lg ${metricStyles[tone] || metricStyles.purple}`}>
          {Icon ? <Icon className="h-5 w-5" /> : null}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11.5px] font-medium text-[#706578]">{label}</p>
          <p className="mt-0.5 text-lg font-extrabold leading-none text-[#21182f]">{formatCount(value)}</p>
        </div>
      </div>
    </div>
  );
}

function TokenSummary({ rows }) {
  const groups = [
    { title: 'Queue', labels: ['Waiting now'] },
    { title: 'Generation', labels: ['Tokens generated', 'Digital tokens', 'Printed tokens'] },
    { title: 'Conversions', labels: ['Tokens converted to bills', 'Cancelled / no-show'] },
    { title: 'Billing', labels: ['Digital bills', 'Printed bills', 'Direct bills'] },
  ];

  return (
    <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4 sm:p-5">
      {groups.map((group) => (
        <div key={group.title} className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#9a938b]">{group.title}</p>
          {group.labels.map((label) => {
            const row = rows.find((item) => item.label === label);
            return row ? <MiniStat key={row.label} {...row} /> : null;
          })}
        </div>
      ))}
    </div>
  );
}

function PaymentBadge({ value }) {
  const label = String(value || '').toLowerCase();
  const style = label === 'cash'
    ? 'bg-[#eaf8ef] text-[#14703a]'
    : label === 'online'
      ? 'bg-[#f1eafd] text-[#6f3cc3]'
      : 'bg-[#eaf5ff] text-[#1f70b7]';
  return <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ${style}`}>{value || 'Not recorded'}</span>;
}

function TransactionsTable({ bills }) {
  if (!bills.length) {
    return (
      <EmptyState
        icon={ReceiptText}
        title="No transactions found for this period."
        description="Completed transactions will appear here as soon as billing starts."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1040px] text-left text-[13px]">
        <thead>
          <tr className="border-b border-[#eee8df] bg-[#fbfaf8] text-[11px] font-bold uppercase tracking-[0.04em] text-[#6c6175]">
            <th className="px-4 py-3">Time</th>
            <th className="px-4 py-3">Invoice</th>
            <th className="px-4 py-3">Customer</th>
            <th className="px-4 py-3">Services and Staff</th>
            <th className="px-4 py-3">Payment</th>
            <th className="px-4 py-3 text-right">Cash</th>
            <th className="px-4 py-3 text-right">QR</th>
            <th className="px-4 py-3">QR Type</th>
            <th className="px-4 py-3 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f0ebe4]">
          {bills.map((bill) => {
            const serviceItems = (bill.items || []).filter((item) => item.type === 'service');
            return (
              <tr key={bill.id} className="align-top transition hover:bg-[#fbf8ff]">
                <td className="whitespace-nowrap px-4 py-4 font-medium text-[#62576b]">{formatTime(bill.transaction_date)}</td>
                <td className="whitespace-nowrap px-4 py-4 font-semibold text-[#21182f]">{bill.bill_number}</td>
                <td className="px-4 py-4 text-[#413849]">{bill.customer_name || 'Walk-in Customer'}</td>
                <td className="px-4 py-4">
                  {serviceItems.length ? (
                    <div className="space-y-1.5">
                      {serviceItems.map((item, index) => (
                        <div key={`${bill.id}-${index}-${item.name}-${item.staffName || 'unassigned'}`} className="leading-5">
                          <span className="font-medium text-[#21182f]">{item.name}</span>
                          <span className="text-[#9a90a2]"> - </span>
                          <span className="text-[#62576b]">{item.staffName || 'Unassigned'}</span>
                        </div>
                      ))}
                    </div>
                  ) : <span className="text-[#7a7082]">Product sale only</span>}
                </td>
                <td className="px-4 py-4"><PaymentBadge value={bill.paymentLabel} /></td>
                <td className="whitespace-nowrap px-4 py-4 text-right font-medium text-[#413849]">{formatCurrency(bill.cash_amount)}</td>
                <td className="whitespace-nowrap px-4 py-4 text-right font-medium text-[#413849]">{formatCurrency(bill.qr_amount)}</td>
                <td className="px-4 py-4 text-[#62576b]">{bill.qrTypeLabel}</td>
                <td className="whitespace-nowrap px-4 py-4 text-right font-bold text-[#6f3cc3]">{formatCurrency(bill.grand_total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StaffActivityList({ staffActivity }) {
  if (!staffActivity.length) {
    return (
      <EmptyState
        icon={Users}
        title="No service activity is available for this period."
        description="Assigned services completed during this period will appear here."
      />
    );
  }

  return (
    // Operational only: staff revenue is management data and lives on the admin Performance page.
    <div className="divide-y divide-[#f0ebe4]">
      {staffActivity.map((staff) => (
        <div key={staff.staffId} className="grid gap-3 px-4 py-3.5 sm:grid-cols-[1.6fr_0.7fr_0.7fr] sm:items-center sm:px-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[#f1eafd] text-sm font-bold text-[#6f3cc3]">
              {initials(staff.staffName)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-[#21182f]">{staff.staffName}</p>
              <span className="mt-1 inline-flex rounded-full bg-[#f7f3fb] px-2 py-0.5 text-[11px] font-semibold capitalize text-[#6f3cc3]">
                {staff.role}
              </span>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase text-[#8a8091]">Services</p>
            <p className="mt-0.5 font-semibold text-[#21182f]">{formatCount(staff.servicesCompleted)}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-[11px] font-semibold uppercase text-[#8a8091]">Customers</p>
            <p className="mt-0.5 font-semibold text-[#21182f]">{formatCount(staff.customersServed)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ExpenseSummary({ operatingExpenses, summary }) {
  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.04em] text-[#5f5570]">Operating Expenses</p>
        <p className="text-sm font-bold text-[#21182f]">{formatCurrency(summary.operatingExpenses)}</p>
      </div>
      {operatingExpenses.length ? (
        <div className="space-y-2">
          {operatingExpenses.map((expense) => (
            <div key={`${expense.category}-${expense.recordType}`} className="flex items-center justify-between gap-3 rounded-xl bg-[#fbfaf8] px-3 py-2.5 text-sm">
              <span className="font-medium text-[#62576b]">{categoryLabel(expense.category)}</span>
              <span className="font-semibold text-[#21182f]">{formatCurrency(expense.amount)}</span>
            </div>
          ))}
        </div>
      ) : <p className="rounded-xl bg-[#fbfaf8] p-3 text-sm text-[#7c7284]">No expenses were recorded for this period.</p>}
    </div>
  );
}

const SAVINGS_FIELD = 'w-full rounded-xl border border-[#ddd5ca] bg-white px-3 py-2.5 text-sm text-[#21182f] focus:border-[#bfaed8] focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/20';

/**
 * Front-desk savings panel. The cashier can record a same-day Bank / Sahakari deposit
 * without leaving the dashboard. Every figure comes from the server summary — the form
 * only posts, it never computes a balance locally.
 */
function SavingsPanel({ financial, breakdown, onNavigate, onRecorded }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    depositType: 'BANK_DEPOSIT',
    amount: '',
    sourceAccount: 'CASH',
    institutionName: '',
    referenceNumber: '',
    notes: '',
  });

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return; // A second click must not create a second deposit.
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/savings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
        },
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not record the deposit');
      setMessage('Savings deposit recorded.');
      setForm({ depositType: 'BANK_DEPOSIT', amount: '', sourceAccount: 'CASH', institutionName: '', referenceNumber: '', notes: '' });
      setOpen(false);
      onRecorded?.();
    } catch (err) {
      setError(err.message || 'Could not record the deposit');
    } finally {
      setSaving(false);
    }
  };

  const requiresInstitution = form.depositType !== 'OTHER_SAVING';

  return (
    <Panel
      title="Savings & Deposits"
      description="Bank and Sahakari deposits move money between the salon's own accounts. They reduce cash in hand but are never an expense."
    >
      <div className="space-y-4 p-4 sm:p-5">
        <div className="rounded-2xl bg-[#eaf8ef] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-bold uppercase tracking-[0.04em] text-[#17643b]">Savings Transfer — Not an Expense</span>
            <span className="text-lg font-bold text-[#14532d]">{formatCurrency(financial?.savingsTransfers)}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3 border-t border-[#c8e9d5] pt-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#3f6b51]">From cash</span>
              <span className="font-bold text-[#14532d]">{formatCurrency(financial?.savingsFromCash)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#3f6b51]">From online</span>
              <span className="font-bold text-[#14532d]">{formatCurrency(financial?.savingsFromOnline)}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            ['Bank', financial?.bankDeposits],
            ['Sahakari', financial?.sahakariDeposits],
            ['Other', financial?.otherSavings],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-[#eee8df] bg-[#fbfaf8] p-2.5 text-center">
              <p className="text-[11px] font-medium text-[#706578]">{label}</p>
              <p className="mt-0.5 text-sm font-bold text-[#21182f]">{formatCurrency(value)}</p>
            </div>
          ))}
        </div>

        {breakdown.length ? (
          <div className="space-y-2">
            {breakdown.map((row) => (
              <div key={`${row.depositType}-${row.sourceAccount}`} className="flex items-center justify-between gap-3 rounded-xl bg-[#fbfaf8] px-3 py-2.5 text-sm">
                <span className="font-medium text-[#62576b]">
                  {categoryLabel(row.depositType)} · {categoryLabel(row.sourceAccount)}
                </span>
                <span className="font-semibold text-[#21182f]">{formatCurrency(row.amount)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl bg-[#fbfaf8] p-3 text-sm text-[#7c7284]">No savings deposit recorded for this period.</p>
        )}

        {error ? <p className="rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">{error}</p> : null}
        {message ? <p className="rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-700">{message}</p> : null}

        {open ? (
          <form onSubmit={submit} className="space-y-3 rounded-2xl border border-[#eee8df] bg-[#fbfaf8] p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6c6175]" htmlFor="cashier-deposit-type">
                  Deposit Type
                </label>
                <select
                  id="cashier-deposit-type"
                  className={SAVINGS_FIELD}
                  value={form.depositType}
                  onChange={(event) => setForm({ ...form, depositType: event.target.value })}
                >
                  <option value="BANK_DEPOSIT">Bank Deposit</option>
                  <option value="SAHAKARI_DEPOSIT">Sahakari Deposit</option>
                  <option value="OTHER_SAVING">Other Saving</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6c6175]" htmlFor="cashier-deposit-amount">
                  Amount (Rs)
                </label>
                <input
                  id="cashier-deposit-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  className={`${SAVINGS_FIELD} text-right`}
                  value={form.amount}
                  onChange={(event) => setForm({ ...form, amount: event.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6c6175]" htmlFor="cashier-deposit-source">
                  Source Account
                </label>
                <select
                  id="cashier-deposit-source"
                  className={SAVINGS_FIELD}
                  value={form.sourceAccount}
                  onChange={(event) => setForm({ ...form, sourceAccount: event.target.value })}
                >
                  <option value="CASH">Cash</option>
                  <option value="ESEWA_PHONEPAY">Esewa / PhonePay</option>
                  <option value="BANK_QR">Bank QR</option>
                  <option value="OTHER_ONLINE">Other Online</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6c6175]" htmlFor="cashier-deposit-institution">
                  Bank / Sahakari Name{requiresInstitution ? '' : ' (optional)'}
                </label>
                <input
                  id="cashier-deposit-institution"
                  type="text"
                  required={requiresInstitution}
                  className={SAVINGS_FIELD}
                  value={form.institutionName}
                  onChange={(event) => setForm({ ...form, institutionName: event.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6c6175]" htmlFor="cashier-deposit-reference">
                  Reference Number (optional)
                </label>
                <input
                  id="cashier-deposit-reference"
                  type="text"
                  className={SAVINGS_FIELD}
                  value={form.referenceNumber}
                  onChange={(event) => setForm({ ...form, referenceNumber: event.target.value })}
                />
              </div>
            </div>
            <p className="text-[11px] text-[#7c7284]">Recorded against today&apos;s Nepal date.</p>
            <div className="flex flex-wrap gap-2">
              <ActionButton variant="primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save Deposit'}
              </ActionButton>
              <ActionButton onClick={() => setOpen(false)}>Cancel</ActionButton>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            <ActionButton variant="primary" icon={Plus} onClick={() => setOpen(true)}>Record Deposit</ActionButton>
            <ActionButton icon={PiggyBank} onClick={() => onNavigate('/dashboard/cashier/savings')}>View All Savings</ActionButton>
          </div>
        )}
      </div>
    </Panel>
  );
}

function AlertsPanel({ alertItems }) {
  if (!alertItems.length) {
    return (
      <EmptyState
        icon={Bell}
        title="No attention items for this period"
        description="Great job. Everything looks good at the front desk."
      />
    );
  }

  return (
    <div className="divide-y divide-[#f0ebe4]">
      {alertItems.map((item) => (
        <div key={item} className="flex items-start gap-3 px-4 py-3.5 text-sm sm:px-5">
          <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-xl bg-[#fff3df] text-[#c56a09]">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <p className="leading-6 text-[#4a4054]">{item}</p>
        </div>
      ))}
    </div>
  );
}

function ReportSummary({ summary }) {
  // Money figures live in Financial Overview. This panel stays purely operational so the
  // same number is never presented twice on one screen.
  const rows = [
    ['Completed bills', formatCount(summary.totalBills)],
    ['Unique customers', formatCount(summary.customersServed)],
    ['Services sold', formatCount(summary.servicesSold)],
    ['Products sold', formatCount(summary.productsSold)],
    ['Average bill value', formatCurrency(summary.avgBillValue)],
    ['Direct bills', formatCount(summary.directBills)],
  ];

  return (
    <Panel title="Front Desk Activity" description="Selected-period operational counts.">
      <div className="grid gap-x-5 gap-y-1 p-4 sm:grid-cols-2 xl:grid-cols-3 sm:p-5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 border-b border-[#f0ebe4] py-3">
            <span className="text-sm font-medium text-[#6e6377]">{label}</span>
            <span className="text-right text-sm font-bold tabular-nums text-[#21182f]">{value}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export default function CashierDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryPeriod = searchParams.get('period');
  const normalizedQueryPeriod = queryPeriod === 'week' ? '7days' : queryPeriod;
  const validPeriods = PERIOD_TABS.map((option) => option.value);
  const todayIso = getTodayIso();
  const [period, setPeriod] = useState(validPeriods.includes(normalizedQueryPeriod) ? normalizedQueryPeriod : 'today');
  const [customRange, setCustomRange] = useState({
    start: searchParams.get('startDate') || '',
    end: searchParams.get('endDate') || '',
  });
  const [appliedRange, setAppliedRange] = useState(() => (
    normalizedQueryPeriod === 'custom' && isValidRange(searchParams.get('startDate'), searchParams.get('endDate'))
      ? { start: searchParams.get('startDate'), end: searchParams.get('endDate') }
      : { start: '', end: '' }
  ));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState('');

  const customQuery = period === 'custom' && isValidRange(appliedRange.start, appliedRange.end)
    ? `&startDate=${appliedRange.start}&endDate=${appliedRange.end}`
    : '';

  const loadDashboard = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/cashier/dashboard?period=${period}${customQuery}`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not load cashier dashboard');
      setData(payload);
      setUpdatedAt(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      setError(err.message || 'Unable to load the dashboard summary. Please refresh and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, customQuery]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const nextQueryPeriod = queryPeriod === 'week' ? '7days' : queryPeriod;
    if (validPeriods.includes(nextQueryPeriod) && nextQueryPeriod !== period) {
      setPeriod(nextQueryPeriod);
    }
  }, [queryPeriod, period, validPeriods]);

  const changePeriod = (nextPeriod) => {
    setPeriod(nextPeriod);
    if (nextPeriod !== 'custom') {
      router.replace(`/dashboard/cashier?period=${nextPeriod}`, { scroll: false });
    }
  };

  const applyCustom = () => {
    if (!isValidRange(customRange.start, customRange.end)) return;
    setAppliedRange({ start: customRange.start, end: customRange.end });
    router.replace(`/dashboard/cashier?period=custom&startDate=${customRange.start}&endDate=${customRange.end}`, { scroll: false });
  };

  const summary = data?.summary || {};
  const periodLabel = data?.period?.label || PERIOD_OPTIONS.find((option) => option.value === period)?.label || 'Today';
  const todayLabel = useMemo(() => {
    const dateValue = data?.date ? new Date(`${data.date}T00:00:00`) : new Date();
    return dateValue.toLocaleDateString('en-NP', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, [data?.date]);

  // Financial KPIs and the payment mix now live in FinancialOverview, so they are not
  // duplicated here. This page keeps only the operational counts.
  const tokenRows = [
    { label: 'Waiting now', value: summary.currentWaitingTokens, icon: Hourglass, tone: 'purple' },
    { label: 'Tokens generated', value: summary.tokensGenerated, icon: Ticket, tone: 'amber' },
    { label: 'Tokens converted to bills', value: summary.tokensConverted, icon: CheckCircle2, tone: 'green' },
    { label: 'Cancelled / no-show', value: summary.tokensCancelledNoShow, icon: AlertTriangle, tone: 'rose' },
    { label: 'Digital tokens', value: summary.digitalTokens, icon: Smartphone, tone: 'blue' },
    { label: 'Printed tokens', value: summary.printedTokens, icon: ReceiptText, tone: 'purple' },
    { label: 'Digital bills', value: summary.digitalBills, icon: Smartphone, tone: 'blue' },
    { label: 'Printed bills', value: summary.printedBills, icon: ReceiptText, tone: 'purple' },
    { label: 'Direct bills', value: summary.directBills, icon: ReceiptText, tone: 'teal' },
  ];

  const operatingExpenses = (data?.expenseBreakdown || []).filter((row) => row.recordType === 'EXPENSE');
  const savingsBreakdown = data?.savingsBreakdown || [];
  const alerts = data?.alerts || {};
  const alertItems = [
    summary.currentWaitingTokens > 0 ? `${summary.currentWaitingTokens} customers are waiting.` : '',
    alerts.billsMissingStaff > 0 ? `${alerts.billsMissingStaff} paid bills need staff assignment review.` : '',
    alerts.onlineMissingQr > 0 ? `${alerts.onlineMissingQr} online or split bills are missing QR type.` : '',
    alerts.tokenMismatch > 0 ? `${alerts.tokenMismatch} billed tokens are missing invoice links.` : '',
    ...(alerts.lowStock || []).map((product) => `${product.name} is low in stock (${product.currentStock}).`),
  ].filter(Boolean);

  const recentBills = data?.recentBills || [];
  const staffActivity = data?.staffActivity || [];
  const recentCustomers = data?.recentCustomers || [];
  const recentExpenses = data?.recentExpenses || [];

  return (
    <div className="min-h-screen bg-[#f7f5f2] px-3 py-4 text-[#21182f] sm:px-5 lg:px-7 lg:py-6">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-4 sm:gap-5">
        <DashboardHeader
          cashierName={data?.user?.name}
          dateLabel={todayLabel}
          periodLabel={periodLabel}
          rangeLabel={data?.period?.displayRange}
          refreshing={refreshing}
          onRefresh={() => loadDashboard({ quiet: true })}
          onNavigate={router.push}
        />

        <PeriodSelector
          value={period}
          onChange={changePeriod}
          displayRange={data?.period?.displayRange}
          today={todayIso}
          customRange={customRange}
          onCustomChange={setCustomRange}
          onApplyCustom={applyCustom}
          onViewTransactions={() => router.push(`/dashboard/cashier/transactions?period=${period}${customQuery}`)}
          onViewReports={() => router.push(`/dashboard/cashier/transactions?period=${period}${customQuery}`)}
        />

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        ) : null}

        {/* Same at-a-glance strip as the Admin dashboard, limited to figures a cashier may see. */}
        <section aria-label="Cashier period at a glance" className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#ece7e1] bg-[#ece7e1] lg:grid-cols-4">
          {[
            [`${periodLabel} Net Sales`, formatCurrency(summary.netSalesAfterDiscount), 'text-[#17140f]'],
            [`${periodLabel} Cash in Hand`, formatCurrency(summary.netCashInHand), 'text-[#1f7a52]'],
            [`${periodLabel} Bills`, formatCount(summary.totalBills), 'text-[#17140f]'],
            [`${periodLabel} Customers`, formatCount(summary.customersServed), 'text-[#17140f]'],
          ].map(([label, value, tone]) => (
            <div key={label} className="bg-white px-4 py-3.5 sm:px-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#8a837b]">{label}</p>
              <p className={`mt-1 text-xl font-extrabold tabular-nums ${tone}`}>{value}</p>
            </div>
          ))}
        </section>

        {/* Quick operational stats, matching the Admin dashboard grid — cashier-relevant only. */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Cash Collected', value: formatCurrency(summary.cashReceived), icon: Banknote, tone: 'bg-[#f6fbf8] text-[#1f7a52]' },
            { label: 'QR Collected', value: formatCurrency(summary.qrReceived), icon: Smartphone, tone: 'bg-[#f2eefe] text-[#5433c9]' },
            { label: 'Services Sold', value: formatCount(summary.servicesSold), icon: Scissors, tone: 'bg-[#eaf5ff] text-[#1f8ad6]' },
            { label: 'Waiting Now', value: formatCount(summary.currentWaitingTokens), icon: Hourglass, tone: 'bg-[#fff7ed] text-[#b4651a]' },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className={`${CARD} p-4 sm:p-5`}>
                <div className="flex items-center gap-3">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.tone}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#8a837b]">{item.label}</p>
                    <p className="mt-1 truncate text-xl font-extrabold tabular-nums text-[#17140f]">{item.value}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <FinancialOverview
          financial={data?.financial}
          salesSeries={data?.salesSeries}
          loading={loading}
          error={error}
          onRetry={() => loadDashboard()}
          period={period}
          transactionsHref={`/dashboard/cashier/transactions?period=${period}`}
          showSalary={false}
          updatedAt={updatedAt}
          showHeader={false}
        />

        <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
          <ReportSummary summary={summary} />

          <Panel title="Token and Queue Summary" description="Selected-period token cohort, with Waiting Now kept as the live queue.">
            <TokenSummary rows={tokenRows} />
          </Panel>
        </div>

        <Panel title={data?.period?.recentTitle || 'Recent Transactions'} description="Latest completed bills for the selected period.">
          <TransactionsTable bills={recentBills} />
          <div className="border-t border-[#eee8df] px-4 py-3 text-center">
            <button
              type="button"
              onClick={() => router.push(`/dashboard/cashier/transactions?period=${period}`)}
              className="text-sm font-semibold text-[#6f3cc3] transition hover:text-[#4f2590]"
            >
              View All Transactions
            </button>
          </div>
        </Panel>

        <div className="grid gap-5 xl:grid-cols-[1.05fr_1fr_0.95fr]">
          <Panel title="Staff Service Activity" description="Selected-period service distribution visible to the cashier.">
            <StaffActivityList staffActivity={staffActivity} />
          </Panel>

          <Panel title="Operating Expenses" description="Real business costs only. Savings transfers are tracked separately.">
            <ExpenseSummary operatingExpenses={operatingExpenses} summary={summary} />
            <div className="border-t border-[#eee8df] px-4 py-3 text-center">
              <button
                type="button"
                onClick={() => router.push('/dashboard/cashier/daily-expenses')}
                className="text-sm font-semibold text-[#6f3cc3] transition hover:text-[#4f2590]"
              >
                View expense details
              </button>
            </div>
          </Panel>

          <SavingsPanel
            financial={data?.financial}
            breakdown={savingsBreakdown}
            onNavigate={router.push}
            onRecorded={() => loadDashboard({ quiet: true })}
          />
        </div>

        <Panel title="Alerts and Attention" description="Operational items that may need follow-up.">
          <AlertsPanel alertItems={alertItems} />
        </Panel>

        <Panel title="Recent Front Desk Activity" description="Customers and expense entries recently handled.">
          <div className="grid gap-4 p-4 lg:grid-cols-2 sm:p-5">
            <div className="rounded-2xl border border-[#eee8df] bg-[#fbfaf8] p-4">
              <div className="mb-3 flex items-center gap-2">
                <Users className="h-4 w-4 text-[#7c3aed]" />
                <p className="text-sm font-semibold text-[#21182f]">Recent customers</p>
              </div>
              {recentCustomers.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {recentCustomers.slice(0, 6).map((customer) => (
                    <div key={customer.id} className="rounded-xl bg-white px-3 py-2.5 shadow-sm">
                      <p className="truncate text-sm font-semibold text-[#21182f]">{customer.name}</p>
                      <p className="mt-1 truncate text-xs font-medium text-[#7c7284]">
                        {customer.phone || 'No phone'} - {formatCount(customer.total_visits, 'visits')}
                      </p>
                    </div>
                  ))}
                </div>
              ) : <p className="rounded-xl bg-white p-3 text-sm text-[#7c7284]">No recent customers found.</p>}
            </div>

            <div className="rounded-2xl border border-[#eee8df] bg-[#fbfaf8] p-4">
              <div className="mb-3 flex items-center gap-2">
                <ReceiptText className="h-4 w-4 text-[#7c3aed]" />
                <p className="text-sm font-semibold text-[#21182f]">Recent expenses</p>
              </div>
              {recentExpenses.length ? (
                <div className="space-y-2">
                  {recentExpenses.slice(0, 5).map((expense) => (
                    <div key={expense.id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5 shadow-sm">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#21182f]">{expense.title}</p>
                        <p className="mt-1 text-xs font-medium text-[#7c7284]">{categoryLabel(expense.category)}</p>
                      </div>
                      <p className="whitespace-nowrap text-sm font-bold text-[#21182f]">{formatCurrency(expense.amount)}</p>
                    </div>
                  ))}
                </div>
              ) : <p className="rounded-xl bg-white p-3 text-sm text-[#7c7284]">No expenses recorded for this period.</p>}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
