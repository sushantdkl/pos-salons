'use client';

/**
 * EXPENSES & PAYROLL (admin) — record salon expenses, settle salaries (with advances and
 * attendance adjustments) and review spending. Every figure comes from /api/admin/expenses;
 * this page only arranges and validates input.
 *
 * One period bar (Today … Custom Range, BS or AD per Settings) drives every tab. The expense
 * list is paged on the server (25 a page), New / Edit expense opens in a side panel whose Save
 * bar is always visible, and every row opens the shared Expense details panel.
 */

import { DateInput, MonthInput } from '@/components/shared/calendar-date-input';
import { currentMonth, fmtDate, fmtMonth } from '@/lib/dates/display';
import { nepalDateString } from '@/lib/dates/calendar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  Banknote, Coins, FileBarChart, HandCoins, Landmark, LayoutDashboard, Lock, Pencil, Plus, QrCode, Receipt,
  RotateCcw, Save, Search, Split, Tags, Trash2, TrendingDown, TrendingUp, Wallet, X,
} from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import PayrollAttendancePanel from '@/components/hrm/payroll-attendance-panel';
import { PeriodFilter } from '@/components/erp';
import { usePeriod } from '@/components/erp/use-report';
import { SidePanel } from '@/components/shared/side-panel';
import { Pager } from '@/components/shared/pager';
import { ExpenseDetailPanel } from '@/components/expenses/expense-detail';
import { CategoryManager } from '@/components/expenses/category-manager';
import { CommissionPanel } from '@/components/payroll/commission-panel';

const TABS = [
  { key: 'Overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'Expenses', label: 'Expenses', icon: Receipt },
  { key: 'Salary Payments', label: 'Salary & advances', icon: Wallet },
  { key: 'Reports', label: 'Reports', icon: FileBarChart },
];

const GROUP_ORDER = ['Running costs', 'Salon upkeep', 'Stock & staff', 'Daily petty cash', 'Anything else'];

const TITLE_SUGGESTIONS = {
  Rent: ['Monthly shop rent'], Electricity: ['Electricity bill (NEA)'], Water: ['Water bill'], Internet: ['Internet bill'],
  Maintenance: ['Chair repair', 'AC service', 'Plumbing'], Cleaning: ['Cleaning supplies', 'Laundry of towels'],
  Equipment: ['Trimmer', 'Hair dryer', 'Scissors set'], Marketing: ['Facebook ads', 'Flyers printing'],
  'Product Purchase': ['Shampoo stock', 'Hair colour stock'], TEA_SNACKS: ['Tea for staff', 'Snacks'],
  WATER_JAR: ['Drinking water jar'], TRANSPORT: ['Delivery / taxi fare'], PETTY_PURCHASE: ['Small items'],
};

const METHODS = [
  { key: 'cash', label: 'Cash', icon: Banknote },
  { key: 'online', label: 'Online', icon: QrCode },
  { key: 'bank_transfer', label: 'Bank', icon: Landmark },
  { key: 'mixed', label: 'Cash + online', icon: Split },
];
const methodLabel = (value) => METHODS.find((item) => item.key === value)?.label || String(value || '').replace('_', ' ');

const today = () => nepalDateString();
const emptyExpense = () => ({
  title: '', category: 'Other', amount: '', paymentMethod: 'cash', cashAmount: '', onlineAmount: '',
  paidBy: 'Admin', paidTo: '', expenseDate: today(), notes: '', referenceNumber: '', attachmentUrl: '',
});
// Advance: money paid to staff before the month is settled. It books an ordinary salary /
// commission expense straight away, and the later settlement deducts it — see
// src/lib/payroll/salary-advances.js for why that recognises the expense exactly once.
const emptyAdvance = () => ({
  staffId: '', amount: '', paymentMethod: 'cash', cashAmount: '', onlineAmount: '', paymentDate: today(), referenceNumber: '', note: '', overrideReason: '',
});
const emptySalary = () => ({
  staffId: '', salaryMonth: currentMonth(), baseSalary: '', commissionEarned: '', bonus: '', deduction: '', amountPaid: '',
  paymentMethod: 'cash', cashAmount: '', onlineAmount: '', paymentDate: today(), notes: '',
});
const emptyFilters = { search: '', category: 'all', paymentMethod: 'all', paymentStatus: 'all', staffId: '', salaryMonth: '' };

const num = (value) => Number(value || 0);
const round2 = (value) => Math.round(num(value) * 100) / 100;

function headers() {
  return { Authorization: `Bearer ${localStorage.getItem('pos_token')}`, 'Content-Type': 'application/json' };
}

/* --------------------------------------------------------------- form atoms */

const CONTROL = 'w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-[15px] text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-stone-500 focus:ring-2 focus:ring-stone-900/10';

function Field({ label, hint, required, error, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 flex items-baseline justify-between gap-2 text-sm font-semibold text-stone-800">
        <span>{label}{required ? <span className="text-rose-600"> *</span> : null}</span>
        {hint ? <span className="text-xs font-normal text-stone-400">{hint}</span> : null}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs font-medium text-rose-600">{error}</span> : null}
    </label>
  );
}

function Input(props) {
  const Tag = props.type === 'date' ? DateInput : 'input';
  return <Tag {...props} className={`${CONTROL} ${props.className || ''}`} />;
}

function MoneyInput({ value, onChange, placeholder = '0.00', large = false, ...props }) {
  return (
    <div className={`flex items-center rounded-xl border border-stone-300 bg-white transition focus-within:border-stone-500 focus-within:ring-2 focus-within:ring-stone-900/10 ${large ? 'px-4' : 'px-3.5'}`}>
      <span className={`font-semibold text-stone-400 ${large ? 'text-lg' : 'text-sm'}`}>Rs</span>
      <input {...props} type="number" inputMode="decimal" min="0" step="0.01" value={value} onChange={onChange} placeholder={placeholder}
        className={`w-full min-w-0 bg-transparent pl-2 outline-none placeholder:text-stone-300 ${large ? 'py-3 text-2xl font-extrabold tabular-nums' : 'py-2.5 text-[15px] tabular-nums'}`} />
    </div>
  );
}

function Select(props) {
  return <select {...props} className={CONTROL} />;
}

function Textarea(props) {
  return <textarea {...props} className={`${CONTROL} resize-none`} />;
}

function Section({ step, title, children }) {
  return (
    <div className="border-t border-stone-100 px-5 py-5 first:border-t-0 sm:px-6">
      <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.1em] text-stone-500">
        {step ? <span className="grid h-5 w-5 place-items-center rounded-full bg-[#171E2D] text-[10px] text-[#E9C77B]">{step}</span> : null}{title}
      </p>
      <div className="space-y-3.5">{children}</div>
    </div>
  );
}

function MethodPicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Payment method">
      {METHODS.map(({ key, label, icon: Icon }) => (
        <button key={key} type="button" role="radio" aria-checked={value === key} onClick={() => onChange(key)}
          className={`flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-xl border px-1 text-xs font-bold transition ${value === key ? 'border-[#171E2D] bg-[#171E2D] text-white shadow-sm' : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'}`}>
          <Icon className={`h-4 w-4 ${value === key ? 'text-[#E9C77B]' : 'text-stone-500'}`} />{label}
        </button>
      ))}
    </div>
  );
}

/** Cash + online split: typing one side fills the other so the two always add up. */
function MixedSplit({ total, cash, online, onChange, labels = ['Cash part', 'Online part'] }) {
  const sum = round2(num(cash) + num(online));
  const off = num(total) > 0 && Math.abs(sum - num(total)) > 0.009;
  return (
    <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50/70 p-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label={labels[0]}><MoneyInput value={cash} onChange={(event) => onChange({ cashAmount: event.target.value, onlineAmount: num(total) ? String(Math.max(0, round2(num(total) - num(event.target.value)))) : online })} /></Field>
        <Field label={labels[1]}><MoneyInput value={online} onChange={(event) => onChange({ onlineAmount: event.target.value, cashAmount: num(total) ? String(Math.max(0, round2(num(total) - num(event.target.value)))) : cash })} /></Field>
      </div>
      <p className={`mt-2 text-xs ${off ? 'font-semibold text-rose-600' : 'text-stone-500'}`}>{off ? `Cash + online is ${formatCurrency(sum)} — it must equal ${formatCurrency(total)}.` : 'Cash + online adds up to the total.'}</p>
    </div>
  );
}

function Pill({ children, tone = 'stone' }) {
  const tones = { stone: 'bg-stone-100 text-stone-700', gold: 'bg-[#FBF3E1] text-[#7A5C1E]', green: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-800', rose: 'bg-rose-50 text-rose-700', sky: 'bg-sky-50 text-sky-800', violet: 'bg-violet-50 text-violet-700' };
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

const METHOD_TONE = { cash: 'gold', online: 'sky', bank_transfer: 'stone', mixed: 'amber' };
const STATUS_TONE = { paid: 'green', partially_paid: 'amber', unpaid: 'rose' };
const SOURCE_LABEL = { advance: 'Advance', salary: 'Salary', commission: 'Commission', supplier: 'Supplier' };

/* ---------------------------------------------------------------------- page */

export default function AdminExpensesPage() {
  const advanceIdempotencyKey = useRef(null);
  const salaryFormRef = useRef(null);
  // Sub-routes open their own tab: /expenses/salary (sidebar "Salary & Payroll"), /new, /reports.
  const pathname = usePathname() || '';
  const routeTab = pathname.endsWith('/salary') ? 'Salary Payments' : pathname.endsWith('/new') ? 'Expenses' : pathname.endsWith('/reports') ? 'Reports' : 'Overview';
  const [activeTab, setActiveTab] = useState(routeTab);
  useEffect(() => { setActiveTab(routeTab); }, [routeTab]);
  const { period, filterProps, ready, query: periodQuery } = usePeriod('month');
  const [data, setData] = useState(null);
  const [expenseForm, setExpenseForm] = useState(null); // null = panel closed
  const [salaryForm, setSalaryForm] = useState(emptySalary);
  const [advanceForm, setAdvanceForm] = useState(emptyAdvance);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [advanceOverLimit, setAdvanceOverLimit] = useState(false);
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [staffAdvances, setStaffAdvances] = useState([]);

  // Opening /expenses/new starts a new expense straight away.
  useEffect(() => { if (pathname.endsWith('/new')) setExpenseForm(emptyExpense()); }, [pathname]);

  const query = useMemo(() => {
    const params = new URLSearchParams(periodQuery);
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    return params.toString();
  }, [filters, periodQuery, page, pageSize]);

  useEffect(() => { setPage(1); }, [filters, periodQuery, pageSize]);

  const fetchData = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError('');
    const response = await fetch(`/api/admin/expenses?${query}`, { headers: headers() });
    const payload = await response.json();
    if (response.ok) setData(payload);
    else setError(payload.error || 'Could not load expenses');
    setLoading(false);
  }, [query, ready]);

  useEffect(() => {
    const timer = setTimeout(fetchData, filters.search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchData, filters.search]);

  const labels = data?.categoryLabels || {};
  const categoryLabel = (value) => labels[value] || value;

  const selectedStaff = useMemo(() => {
    if (!data) return null;
    return data.staff.find((member) => String(member.id) === String(salaryForm.staffId));
  }, [data, salaryForm.staffId]);

  const staffKey = selectedStaff?.id;
  const staffBase = selectedStaff?.baseSalary;
  // Base salary and this month's commission prefill when the staff member or month changes.
  useEffect(() => {
    if (!staffKey) return;
    const loadMetrics = async () => {
      const params = new URLSearchParams({ staffId: String(staffKey), salaryMonth: salaryForm.salaryMonth, pageSize: '10' });
      const response = await fetch(`/api/admin/expenses?${params.toString()}`, { headers: headers() });
      const payload = await response.json();
      const staff = payload.staff?.find((member) => String(member.id) === String(staffKey));
      setSalaryForm((current) => ({
        ...current,
        baseSalary: staffBase ? String(staffBase) : '',
        commissionEarned: staff?.monthMetrics?.commissionEarned ? String(staff.monthMetrics.commissionEarned) : '',
      }));
    };
    loadMetrics();
  }, [staffKey, staffBase, salaryForm.salaryMonth]);

  // The staff member's advance ledger; re-read after every save (data changes).
  useEffect(() => {
    if (!staffKey) { setStaffAdvances([]); return; }
    let live = true;
    fetch(`/api/admin/expenses?${new URLSearchParams({ staffId: String(staffKey), pageSize: '10' })}`, { headers: headers() })
      .then((response) => response.json())
      .then((payload) => { if (live) setStaffAdvances(payload.staffAdvances || []); })
      .catch(() => {});
    return () => { live = false; };
  }, [staffKey, data]);

  const totalPayable = Math.max(0, num(salaryForm.baseSalary) + num(salaryForm.commissionEarned) + num(salaryForm.bonus) - num(salaryForm.deduction));
  // Outstanding advances are absorbed before any cash is handed over. An advance larger than
  // the salary is capped here too, so the preview can never show a negative amount payable.
  const outstandingAdvance = num(selectedStaff?.outstandingAdvance);
  const advanceApplied = Math.min(outstandingAdvance, totalPayable);
  const remainingPayable = Math.max(0, totalPayable - advanceApplied);
  const advanceCarriedForward = Math.max(0, outstandingAdvance - advanceApplied);
  const remainingBalance = Math.max(0, remainingPayable - num(salaryForm.amountPaid));
  const paymentStatus = remainingBalance <= 0 && (num(salaryForm.amountPaid) > 0 || advanceApplied > 0)
    ? 'paid'
    : num(salaryForm.amountPaid) <= 0 ? 'unpaid' : 'partially_paid';
  const advanceStaff = data?.staff?.find((member) => String(member.id) === String(advanceForm.staffId));

  const flash = (text) => { setMessage(text); setError(''); };

  const cancelAdvance = async (advance) => {
    const reason = window.prompt('Reason for cancelling this advance (required):', '');
    if (reason === null) return;
    if (!reason.trim()) { setError('A reason is required to cancel an advance.'); return; }
    setActionLoading(true); setMessage(''); setError('');
    const response = await fetch(`/api/admin/expenses?id=${advance.id}&type=advance&reason=${encodeURIComponent(reason.trim())}`, { method: 'DELETE', headers: headers() });
    const payload = await response.json();
    if (response.ok) { flash(payload.message || 'Advance cancelled.'); fetchData(); } else setError(payload.error || 'Could not cancel the advance');
    setActionLoading(false);
  };

  const saveAdvance = async () => {
    setSaving(true); setMessage(''); setError('');
    if (!advanceIdempotencyKey.current) advanceIdempotencyKey.current = crypto.randomUUID();
    const response = await fetch('/api/admin/expenses', {
      method: 'POST',
      headers: { ...headers(), 'Idempotency-Key': advanceIdempotencyKey.current },
      body: JSON.stringify({
        type: 'advance', staffId: advanceForm.staffId, amount: advanceForm.amount, paymentMethod: advanceForm.paymentMethod,
        cashAmount: advanceForm.cashAmount, onlineAmount: advanceForm.onlineAmount, paymentDate: advanceForm.paymentDate,
        referenceNumber: advanceForm.referenceNumber, note: advanceForm.note, overrideReason: advanceForm.overrideReason,
        idempotencyKey: advanceIdempotencyKey.current, sourceIdentifier: `ADMIN-ADV-${advanceIdempotencyKey.current}`,
      }),
    });
    const payload = await response.json();
    if (response.ok) {
      advanceIdempotencyKey.current = null;
      flash(payload.message || 'Advance recorded.');
      setAdvanceForm({ ...emptyAdvance(), staffId: advanceForm.staffId, paymentDate: advanceForm.paymentDate });
      setAdvanceOverLimit(false);
      setAdvanceOpen(false);
      fetchData();
    } else {
      // Over the allowance: the admin may approve it with a written reason.
      if (payload.code === 'ADVANCE_OVER_ALLOWANCE') setAdvanceOverLimit(true);
      setError(payload.error || 'Could not record the advance');
    }
    setSaving(false);
  };

  const saveExpense = async () => {
    setSaving(true); setMessage(''); setError('');
    const response = await fetch('/api/admin/expenses', { method: expenseForm.id ? 'PUT' : 'POST', headers: headers(), body: JSON.stringify(expenseForm) });
    const payload = await response.json();
    if (response.ok) { flash(payload.message || 'Expense saved.'); setExpenseForm(null); fetchData(); } else setError(payload.error || 'Could not save expense');
    setSaving(false);
  };

  const saveSalary = async () => {
    setSaving(true); setMessage(''); setError('');
    const response = await fetch('/api/admin/expenses', { method: salaryForm.id ? 'PUT' : 'POST', headers: headers(), body: JSON.stringify({ ...salaryForm, type: 'salary' }) });
    const payload = await response.json();
    if (response.ok) { flash(payload.message || 'Salary payment saved.'); setSalaryForm(emptySalary()); fetchData(); } else setError(payload.error || 'Could not save salary payment');
    setSaving(false);
  };

  const removeRecord = async (id, type = 'expense') => {
    setActionLoading(true);
    const response = await fetch(`/api/admin/expenses?id=${id}&type=${type}`, { method: 'DELETE', headers: headers() });
    const payload = await response.json();
    if (response.ok) { flash(payload.message || 'Record deleted.'); setConfirmAction(null); setDetailId(null); fetchData(); } else { setError(payload.error || 'Could not delete record'); setConfirmAction(null); }
    setActionLoading(false);
  };

  const editExpense = (expense) => {
    setDetailId(null);
    setExpenseForm({ ...emptyExpense(), ...expense, amount: String(expense.amount ?? ''), cashAmount: String(expense.cashAmount ?? ''), onlineAmount: String(expense.onlineAmount ?? '') });
  };
  const editSalary = (salary) => {
    setSalaryForm({ ...emptySalary(), ...salary });
    setActiveTab('Salary Payments');
    setTimeout(() => salaryFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  const newExpense = () => { setError(''); setExpenseForm(emptyExpense()); };

  if (loading && !data) {
    return <div className="flex min-h-screen items-center justify-center bg-[#F7F5F2] text-sm text-stone-500">Loading expenses…</div>;
  }

  const expenseList = (readOnly) => (
    <ExpenseTable
      expenses={data?.expenses || []}
      pagination={data?.expensePagination}
      totals={data?.expenseTotals}
      filters={filters}
      setFilters={setFilters}
      categoryList={data?.categoryList || []}
      categoryLabel={categoryLabel}
      onOpen={(expense) => setDetailId(expense.id)}
      onEdit={editExpense}
      onDelete={(record) => setConfirmAction({ type: 'expense', record })}
      onPage={setPage}
      onPageSize={setPageSize}
      pageSize={pageSize}
      readOnly={readOnly}
      onManageCategories={readOnly ? null : () => setCategoriesOpen(true)}
      showFilters={!readOnly}
    />
  );

  return (
    <div className="min-h-screen bg-[#F7F5F2]">
      <header className="border-b border-[#ECE4D8] bg-white px-4 py-5 sm:px-6">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#171E2D] text-[#E9C77B]"><Receipt className="h-5 w-5" /></span>
            <div>
              <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-stone-950">Expenses &amp; Payroll</h1>
              <p className="text-sm text-stone-500">Record spending, settle salaries and see where the money goes.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { setAdvanceForm(emptyAdvance()); setAdvanceOverLimit(false); setAdvanceOpen(true); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-sm font-bold text-stone-700 hover:bg-stone-50"><HandCoins className="h-4 w-4" />Give advance</button>
            <button type="button" onClick={newExpense} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#171E2D] px-5 text-sm font-bold text-white shadow-[0_6px_16px_rgba(23,30,45,0.18)] hover:bg-[#242d42]"><Plus className="h-4 w-4" />New expense</button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] space-y-5 p-4 sm:p-6">
        {message ? <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}<button type="button" aria-label="Dismiss" onClick={() => setMessage('')}><X className="h-4 w-4" /></button></div> : null}
        {error && !expenseForm && !advanceOpen ? <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}<button type="button" aria-label="Dismiss" onClick={() => setError('')}><X className="h-4 w-4" /></button></div> : null}

        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <nav className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]" aria-label="Expense sections">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button key={key} type="button" onClick={() => setActiveTab(key)} aria-current={activeTab === key ? 'page' : undefined}
                className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-bold transition ${activeTab === key ? 'bg-[#171E2D] text-white shadow-sm' : 'border border-stone-200 bg-white text-stone-700 hover:border-stone-300'}`}>
                <Icon className={`h-4 w-4 ${activeTab === key ? 'text-[#E9C77B]' : 'text-stone-500'}`} />{label}
              </button>
            ))}
          </nav>
          <PeriodFilter {...filterProps} className="min-w-0 xl:max-w-[62%]" />
        </div>

        {activeTab === 'Overview' ? (
          <Overview summary={data?.summary || {}} periodSummary={data?.periodSummary} period={period} expenses={data?.expenses || []} categoryLabel={categoryLabel} onOpen={(expense) => setDetailId(expense.id)} onNew={newExpense} />
        ) : null}
        {activeTab === 'Expenses' ? expenseList(false) : null}
        {activeTab === 'Salary Payments' ? (
          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,480px)_minmax(0,1fr)]">
            <div ref={salaryFormRef} className="scroll-mt-4">
              <SalaryForm
                form={salaryForm} setForm={setSalaryForm} staff={data?.staff || []}
                totalPayable={totalPayable} remainingBalance={remainingBalance} paymentStatus={paymentStatus}
                saving={saving} onSave={saveSalary} onReset={() => setSalaryForm(emptySalary())}
                advances={staffAdvances} outstandingAdvance={outstandingAdvance}
                advanceApplied={advanceApplied} remainingPayable={remainingPayable}
                advanceCarriedForward={advanceCarriedForward}
                onGiveAdvance={() => { setAdvanceForm((f) => ({ ...f, staffId: salaryForm.staffId })); setAdvanceOverLimit(false); setAdvanceOpen(true); }}
                onCancelAdvance={cancelAdvance}
              />
            </div>
            <SalaryTable salaries={data?.salaries || []} onEdit={editSalary} onDelete={(record) => setConfirmAction({ type: 'salary', record })} editingId={salaryForm.id} />
          </div>
        ) : null}
        {activeTab === 'Reports' ? (
          <div className="space-y-5">
            <ReportFilters filters={filters} setFilters={setFilters} categoryList={data?.categoryList || []} paymentMethods={data?.paymentMethods || []} paymentStatuses={data?.paymentStatuses || []} staff={data?.staff || []} />
            {expenseList(true)}
            <SalaryTable salaries={data?.salaries || []} onEdit={editSalary} onDelete={() => {}} readOnly />
          </div>
        ) : null}

        {expenseForm ? (
          <ExpenseForm
            key={expenseForm.id || 'new'}
            form={expenseForm} setForm={setExpenseForm}
            categoryList={data?.categoryList || []} categoryLabel={categoryLabel}
            saving={saving} error={error}
            onSave={saveExpense}
            onClose={() => { setExpenseForm(null); setError(''); }}
            onManageCategories={() => setCategoriesOpen(true)}
          />
        ) : null}
        {detailId ? (
          <ExpenseDetailPanel
            id={detailId}
            onClose={() => setDetailId(null)}
            onEdit={editExpense}
            onDelete={(record) => setConfirmAction({ type: 'expense', record })}
          />
        ) : null}
        {categoriesOpen ? <CategoryManager onClose={() => setCategoriesOpen(false)} onChanged={fetchData} /> : null}
        {advanceOpen ? (
          <AdvanceDialog
            form={advanceForm} setForm={setAdvanceForm} staff={data?.staff || []} member={advanceStaff}
            outstandingAdvance={num(advanceStaff?.outstandingAdvance)} saving={saving} error={error}
            overLimit={advanceOverLimit}
            onCancel={() => { setAdvanceOpen(false); setError(''); }} onSave={saveAdvance}
          />
        ) : null}
        <ConfirmDialog
          open={Boolean(confirmAction)}
          title={`Delete ${confirmAction?.type === 'salary' ? 'salary payment' : 'expense'}`}
          description={confirmAction ? `Delete ${confirmAction.type === 'salary' ? `${confirmAction.record.staffName}'s ${fmtMonth(confirmAction.record.salaryMonth)} salary payment` : `“${confirmAction.record.title}” (${formatCurrency(confirmAction.record.amount)})`}? This cannot be undone.` : ''}
          confirmLabel="Delete"
          destructive
          loading={actionLoading}
          onCancel={() => !actionLoading && setConfirmAction(null)}
          onConfirm={() => removeRecord(confirmAction.record.id, confirmAction.type)}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ overview */

function Stat({ label, value, sub, icon: Icon, highlight = false }) {
  return (
    <div className={`rounded-2xl border p-5 ${highlight ? 'border-[#E6DDCF] bg-[#FBF7EF]' : 'border-[#ECE4D8] bg-white'}`}>
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-stone-500">{Icon ? <Icon className="h-4 w-4 text-[#8A6A2F]" /> : null}{label}</p>
      <p className="mt-2 text-[26px] font-extrabold leading-none tracking-[-0.02em] tabular-nums text-stone-950">{formatCurrency(num(value))}</p>
      {sub ? <p className="mt-1.5 text-xs text-stone-500">{sub}</p> : null}
    </div>
  );
}

const BAR_COLORS = ['bg-[#171E2D]', 'bg-violet-500', 'bg-sky-500', 'bg-[#C9A55C]', 'bg-emerald-500', 'bg-rose-400', 'bg-teal-500', 'bg-stone-400'];

function Overview({ summary, periodSummary, expenses, categoryLabel, onOpen, onNew }) {
  const spent = num(periodSummary?.total);
  const rows = periodSummary?.byCategory || [];
  const top = rows.slice(0, 7);
  const rest = rows.slice(7).reduce((sum, row) => sum + row.amount, 0);
  const breakdown = [...top.map((row, index) => ({ label: row.label, value: row.amount, count: row.count, color: BAR_COLORS[index % BAR_COLORS.length] })), ...(rest > 0 ? [{ label: 'Everything else', value: rest, color: 'bg-stone-300' }] : [])];
  const net = num(periodSummary?.revenue) - spent;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={TrendingDown} label="Spent in this period" value={spent} sub={`${periodSummary?.records || 0} record${periodSummary?.records === 1 ? '' : 's'}`} highlight />
        <Stat icon={Banknote} label="Paid in cash" value={periodSummary?.cash} sub="Left the cash drawer" />
        <Stat icon={QrCode} label="Paid online / bank" value={periodSummary?.online} sub={`Spent today ${formatCurrency(num(summary.totalExpensesToday))}`} />
        <div className="rounded-2xl bg-[#171E2D] p-5 text-white shadow-[0_12px_28px_rgba(23,30,45,0.2)]">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-white/60"><TrendingUp className="h-4 w-4 text-[#E9C77B]" />Net after expenses</p>
          <p className={`mt-2 text-[26px] font-extrabold leading-none tracking-[-0.02em] tabular-nums ${net < 0 ? 'text-rose-300' : 'text-[#E9C77B]'}`}>{formatCurrency(net)}</p>
          <p className="mt-1.5 text-xs text-white/60">Sales {formatCurrency(num(periodSummary?.revenue))} − expenses {formatCurrency(spent)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className="rounded-2xl border border-[#ECE4D8] bg-white p-5 sm:p-6">
          <h2 className="text-base font-extrabold text-stone-900">Where the money went</h2>
          <p className="text-sm text-stone-500">Share of {formatCurrency(spent)} spent in the selected period.</p>
          <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-stone-100">
            {breakdown.map((row) => (spent > 0 && row.value > 0 ? <span key={row.label} className={row.color} style={{ width: `${(row.value / spent) * 100}%` }} /> : null))}
          </div>
          {breakdown.length ? (
            <ul className="mt-4 space-y-3">
              {breakdown.map((row) => (
                <li key={row.label} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2 text-stone-700"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${row.color}`} /><span className="truncate">{row.label}</span>{row.count ? <span className="text-xs text-stone-400">×{row.count}</span> : null}</span>
                  <span className="flex items-baseline gap-2"><span className="text-xs text-stone-400">{spent > 0 ? `${Math.round((row.value / spent) * 100)}%` : '—'}</span><strong className="tabular-nums text-stone-900">{formatCurrency(row.value)}</strong></span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-6 text-center text-sm text-stone-400">Nothing spent in this period.</p>}
          <div className="mt-5 flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3 text-sm">
            <span className="font-semibold text-amber-900">Salary still to pay</span>
            <strong className="tabular-nums text-amber-900">{formatCurrency(num(summary.pendingSalaryBalance))}</strong>
          </div>
        </section>

        <section className="rounded-2xl border border-[#ECE4D8] bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-4 sm:px-6">
            <div><h2 className="text-base font-extrabold text-stone-900">Latest expenses</h2><p className="text-sm text-stone-500">Tap one to see its details.</p></div>
            <button type="button" onClick={onNew} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-stone-300 px-3 text-sm font-semibold text-stone-700 hover:bg-stone-50"><Plus className="h-4 w-4" />Add</button>
          </div>
          {expenses.length ? (
            <ul className="divide-y divide-stone-100">
              {expenses.slice(0, 8).map((expense) => (
                <li key={expense.id}>
                  <button type="button" onClick={() => onOpen(expense)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-stone-50 sm:px-6">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#FBF3E1] text-[#8A6A2F]"><Receipt className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-stone-900">{expense.title}</span>
                      <span className="block truncate text-xs text-stone-500">{categoryLabel(expense.category)} · {fmtDate(expense.expenseDate)}{expense.paidTo ? ` · ${expense.paidTo}` : ''}</span>
                    </span>
                    <span className="shrink-0 text-right"><span className="block font-extrabold tabular-nums text-stone-900">{formatCurrency(expense.amount)}</span><span className="text-xs text-stone-500">{methodLabel(expense.paymentMethod)}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="px-6 py-12 text-center text-sm text-stone-400">No expenses in this period.</p>}
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- expense form */

/**
 * New / edit expense in a side panel. The body scrolls; the summary and Save bar are pinned to
 * the bottom so they are always visible, however long the list behind it is.
 */
function ExpenseForm({ form, setForm, categoryList, categoryLabel, saving, error, onSave, onClose, onManageCategories }) {
  const update = (patch) => setForm((current) => ({ ...current, ...patch }));
  const [touched, setTouched] = useState(false);
  const active = categoryList.filter((category) => category.isActive);
  const groups = GROUP_ORDER.map((label) => ({ label, items: active.filter((category) => category.group === label) })).filter((group) => group.items.length);
  const known = active.some((category) => category.name === form.category);
  const suggestions = TITLE_SUGGESTIONS[form.category] || [];
  const amount = num(form.amount);
  const mixedOff = form.paymentMethod === 'mixed' && Math.abs(round2(num(form.cashAmount) + num(form.onlineAmount)) - amount) > 0.009;
  const errors = {
    title: form.title.trim() ? '' : 'Give the expense a short name.',
    amount: amount > 0 ? '' : 'Enter an amount above zero.',
    date: form.expenseDate ? '' : 'Pick the date it was paid.',
  };
  const invalid = Boolean(errors.title || errors.amount || errors.date || mixedOff);
  const submit = () => { setTouched(true); if (!invalid) onSave(); };

  return (
    <SidePanel
      eyebrow={form.id ? 'Edit expense' : 'New expense'}
      icon={Receipt}
      title={form.id ? form.title || 'Edit expense' : 'Record an expense'}
      subtitle={form.id ? 'Changes update the cash and reports straight away.' : 'Everything paid out of the salon.'}
      width="max-w-xl"
      onClose={onClose}
      footer={(
        <div className="space-y-2">
          {error ? <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">{error}</p> : null}
          <p className="text-sm text-stone-600">
            {amount > 0 ? <><strong className="text-stone-900">{formatCurrency(amount)}</strong> · {categoryLabel(form.category)} · {methodLabel(form.paymentMethod)}{form.expenseDate ? ` · ${fmtDate(form.expenseDate)}` : ''}</> : 'Fill in the amount to see the summary.'}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700 hover:bg-stone-50"><X className="h-4 w-4" />Cancel</button>
            <button type="button" onClick={submit} disabled={saving || (touched && invalid)} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-extrabold text-white shadow-[0_8px_18px_rgba(4,120,87,0.22)] hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none">
              <Save className="h-4 w-4" />{saving ? 'Saving…' : form.id ? 'Save changes' : 'Save expense'}
            </button>
          </div>
        </div>
      )}
    >
      <div className="-mx-5 -my-4">
        <Section step="1" title="What was it for">
          <div className="space-y-2.5">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-400">{group.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {group.items.map((item) => (
                    <button key={item.name} type="button" onClick={() => update({ category: item.name })} aria-pressed={form.category === item.name}
                      className={`min-h-9 rounded-full border px-3 text-sm font-semibold transition ${form.category === item.name ? 'border-[#171E2D] bg-[#171E2D] text-white' : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'}`}>
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!known && form.category ? <p className="text-xs text-stone-500">Saved category: <strong>{categoryLabel(form.category)}</strong></p> : null}
            <button type="button" onClick={onManageCategories} className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:underline"><Tags className="h-3.5 w-3.5" />Add or manage categories</button>
          </div>
          <Field label="Expense name" required error={touched ? errors.title : ''}>
            <Input value={form.title} onChange={(event) => update({ title: event.target.value })} placeholder="e.g. Electricity bill for Ashwin" maxLength={120} />
          </Field>
          {suggestions.length && !form.title ? (
            <div className="-mt-1.5 flex flex-wrap gap-1.5">
              {suggestions.map((text) => <button key={text} type="button" onClick={() => update({ title: text })} className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600 hover:bg-stone-200">{text}</button>)}
            </div>
          ) : null}
        </Section>

        <Section step="2" title="Amount & payment">
          <Field label="Amount" required error={touched ? errors.amount : ''}>
            <MoneyInput large value={form.amount} onChange={(event) => update({ amount: event.target.value, ...(form.paymentMethod === 'mixed' ? { cashAmount: event.target.value, onlineAmount: '0' } : {}) })} />
          </Field>
          <MethodPicker value={form.paymentMethod} onChange={(method) => update({ paymentMethod: method, ...(method === 'mixed' ? { cashAmount: form.amount || '', onlineAmount: '0' } : {}) })} />
          {form.paymentMethod === 'mixed' ? <MixedSplit total={form.amount} cash={form.cashAmount} online={form.onlineAmount} onChange={update} /> : null}
          {form.paymentMethod === 'cash' || form.paymentMethod === 'mixed' ? <p className="text-xs text-stone-500">Cash comes out of today&apos;s drawer and lowers Expected Cash.</p> : null}
        </Section>

        <Section step="3" title="Who & when">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Paid to" hint="Shop / person"><Input value={form.paidTo} onChange={(event) => update({ paidTo: event.target.value })} placeholder="e.g. NEA, Ram Store" /></Field>
            <Field label="Paid by"><Input value={form.paidBy} onChange={(event) => update({ paidBy: event.target.value })} /></Field>
          </div>
          <Field label="Date paid" required error={touched ? errors.date : ''}>
            <Input type="date" value={form.expenseDate} max={today()} onChange={(event) => update({ expenseDate: event.target.value })} />
          </Field>
        </Section>

        <Section step="4" title="Proof & notes (optional)">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Bill / receipt no."><Input value={form.referenceNumber} onChange={(event) => update({ referenceNumber: event.target.value })} placeholder="e.g. INV-2231" /></Field>
            <Field label="Receipt link"><Input value={form.attachmentUrl} onChange={(event) => update({ attachmentUrl: event.target.value })} placeholder="https://…" /></Field>
          </div>
          <Field label="Notes"><Textarea rows={2} value={form.notes} onChange={(event) => update({ notes: event.target.value })} placeholder="Anything worth remembering" /></Field>
        </Section>
      </div>
    </SidePanel>
  );
}

/* ------------------------------------------------------------ expense table */

function ExpenseTable({ expenses, pagination, totals, filters, setFilters, categoryList, categoryLabel, onOpen, onEdit, onDelete, onPage, onPageSize, pageSize, readOnly = false, onManageCategories, showFilters = true }) {
  const update = (patch) => setFilters((current) => ({ ...current, ...patch }));
  const total = pagination?.total || 0;
  return (
    <section className="min-w-0 overflow-hidden rounded-[20px] border border-[#ECE4D8] bg-white">
      <div className="flex flex-col gap-3 border-b border-stone-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between sm:px-6">
        <div>
          <h2 className="text-base font-extrabold text-stone-900">Expense records</h2>
          <p className="text-sm text-stone-500">{total} record{total === 1 ? '' : 's'} · <strong className="text-stone-800">{formatCurrency(num(totals?.amount))}</strong><span className="text-stone-400"> · cash {formatCurrency(num(totals?.cash))} · online {formatCurrency(num(totals?.online))}</span></p>
        </div>
        {showFilters ? (
          <div className="flex flex-wrap gap-2">
            <label className="relative"><span className="sr-only">Search expenses</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" /><input value={filters.search} onChange={(event) => update({ search: event.target.value })} placeholder="Search" className="h-10 w-48 rounded-lg border border-stone-300 pl-9 pr-3 text-sm outline-none focus:border-stone-500" /></label>
            <select aria-label="Category" value={filters.category} onChange={(event) => update({ category: event.target.value })} className="h-10 rounded-lg border border-stone-300 bg-white px-2.5 text-sm">
              <option value="all">All categories</option>
              {categoryList.map((item) => <option key={item.id} value={item.name}>{item.label}</option>)}
            </select>
            <select aria-label="Paid with" value={filters.paymentMethod} onChange={(event) => update({ paymentMethod: event.target.value })} className="h-10 rounded-lg border border-stone-300 bg-white px-2.5 text-sm">
              <option value="all">Any payment</option>
              {METHODS.map((method) => <option key={method.key} value={method.key}>{method.label}</option>)}
            </select>
            {onManageCategories ? <button type="button" onClick={onManageCategories} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700 hover:bg-stone-50"><Tags className="h-4 w-4" />Categories</button> : null}
          </div>
        ) : null}
      </div>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-stone-50 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-stone-500">
            <tr><th className="px-5 py-3">Date</th><th className="px-4 py-3">Expense</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Paid with</th><th className="px-4 py-3">Entered by</th><th className="px-4 py-3 text-right">Amount</th>{readOnly ? null : <th className="px-4 py-3 text-right"><span className="sr-only">Actions</span></th>}</tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {expenses.map((expense) => (
              <tr key={expense.id} onClick={() => onOpen(expense)} className="cursor-pointer hover:bg-amber-50/50" title="Open this expense">
                <td className="whitespace-nowrap px-5 py-3 text-stone-600">{fmtDate(expense.expenseDate)}</td>
                <td className="px-4 py-3">
                  <p className="font-semibold text-stone-900">{expense.title}{expense.locked ? <Pill tone="violet"><Lock className="mr-1 h-3 w-3" />{SOURCE_LABEL[expense.source]}</Pill> : null}</p>
                  <p className="text-xs text-stone-500">{[expense.paidTo, expense.referenceNumber ? `#${expense.referenceNumber}` : ''].filter(Boolean).join(' · ') || '—'}</p>
                </td>
                <td className="px-4 py-3"><Pill>{expense.categoryLabel || categoryLabel(expense.category)}</Pill></td>
                <td className="px-4 py-3"><Pill tone={METHOD_TONE[expense.paymentMethod]}>{methodLabel(expense.paymentMethod)}</Pill></td>
                <td className="whitespace-nowrap px-4 py-3 text-stone-600">{expense.createdByName || '—'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-extrabold tabular-nums text-stone-900">{formatCurrency(expense.amount)}</td>
                {readOnly ? null : (
                  <td className="px-4 py-3 text-right">
                    {expense.locked ? <span className="inline-grid h-9 w-9 place-items-center text-stone-300" title="Managed from its own screen"><Lock className="h-4 w-4" /></span> : (
                      <div className="inline-flex gap-1" onClick={(event) => event.stopPropagation()}>
                        <button type="button" onClick={() => onEdit(expense)} aria-label={`Edit ${expense.title}`} className="grid h-9 w-9 place-items-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-800"><Pencil className="h-4 w-4" /></button>
                        <button type="button" onClick={() => onDelete(expense)} aria-label={`Delete ${expense.title}`} className="grid h-9 w-9 place-items-center rounded-lg text-stone-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {!expenses.length ? <tr><td colSpan={7} className="px-5 py-12 text-center text-stone-400">No expenses match this period and filter.</td></tr> : null}
          </tbody>
        </table>
      </div>
      {pagination ? <Pager page={pagination.page} pages={pagination.pages} total={pagination.total} pageSize={pageSize} onPage={onPage} onPageSize={onPageSize} label="expenses" /> : null}
    </section>
  );
}

/* -------------------------------------------------------------- salary form */

function SalaryForm({ form, setForm, staff, totalPayable, remainingBalance, paymentStatus, saving, onSave, onReset, advances = [], outstandingAdvance = 0, advanceApplied = 0, remainingPayable = 0, advanceCarriedForward = 0, onGiveAdvance, onCancelAdvance }) {
  const update = (patch) => setForm((current) => ({ ...current, ...patch }));
  const member = staff.find((row) => String(row.id) === String(form.staffId));
  const mixedOff = form.paymentMethod === 'mixed' && Math.abs(round2(num(form.cashAmount) + num(form.onlineAmount)) - num(form.amountPaid)) > 0.009;
  return (
    <section className="overflow-hidden rounded-[20px] border border-[#E6DDCF] bg-white shadow-[0_10px_28px_rgba(34,28,20,0.07)]">
      <div className="flex items-center justify-between gap-3 bg-[#171E2D] px-5 py-4 text-white sm:px-6">
        <div>
          <h2 className="text-lg font-extrabold">{form.id ? 'Edit salary payment' : 'Pay salary / commission'}</h2>
          <p className="text-xs text-white/60">Base + commission + bonus − deductions − advances already given.</p>
        </div>
        {form.id ? <button type="button" onClick={onReset} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10"><X className="h-3.5 w-3.5" />Cancel edit</button> : null}
      </div>

      <Section step="1" title="Staff & month">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Staff member" required><Select value={form.staffId} onChange={(event) => update({ staffId: event.target.value })}><option value="">Choose staff…</option>{staff.map((row) => <option key={row.id} value={row.id}>{row.name} ({row.role} · {row.payType === 'commission' ? 'commission' : 'salary'})</option>)}</Select></Field>
          <Field label="Salary month" required><MonthInput value={form.salaryMonth} onChange={(event) => update({ salaryMonth: event.target.value })} className={CONTROL} /></Field>
        </div>
        {member ? <p className="text-xs text-stone-500">{member.name} · {member.payType === 'commission' ? `commission-based (${member.commissionPercentage}%)` : `monthly base ${formatCurrency(member.baseSalary)}`}{outstandingAdvance > 0 ? ` · advance outstanding ${formatCurrency(outstandingAdvance)}` : ''}</p> : null}
      </Section>

      <Section step="2" title="Earnings & adjustments">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Base salary"><MoneyInput value={form.baseSalary} onChange={(event) => update({ baseSalary: event.target.value })} /></Field>
          <Field label="Commission earned" hint="From this month's bills"><MoneyInput value={form.commissionEarned} onChange={(event) => update({ commissionEarned: event.target.value })} /></Field>
          <Field label="Bonus"><MoneyInput value={form.bonus} onChange={(event) => update({ bonus: event.target.value })} /></Field>
          <Field label="Deduction"><MoneyInput value={form.deduction} onChange={(event) => update({ deduction: event.target.value })} /></Field>
        </div>
        <PayrollAttendancePanel
          staffId={form.staffId}
          month={form.salaryMonth}
          onApplyBonus={(amount) => setForm((current) => ({ ...current, bonus: String(Math.round((num(current.bonus) + amount) * 100) / 100) }))}
          onApplyDeduction={(amount) => setForm((current) => ({ ...current, deduction: String(Math.round((num(current.deduction) + amount) * 100) / 100) }))}
          onSnapshot={(snapshot) => setForm((current) => ({ ...current, attendanceSnapshot: snapshot }))}
        />
      </Section>

      {/* Settlement breakdown. The gross figure is never overwritten — the advance is shown as
          its own deduction line so the two stay distinguishable. */}
      <Section step="3" title="Settlement">
        <dl className="space-y-2 rounded-2xl bg-[#FBF9F6] p-4 text-sm ring-1 ring-[#ECE4D8]">
          <div className="flex justify-between"><dt className="text-stone-600">Gross salary</dt><dd className="font-semibold tabular-nums">{formatCurrency(totalPayable)}</dd></div>
          {advanceApplied > 0 ? <div className="flex justify-between text-amber-700"><dt>Advance deduction</dt><dd className="font-semibold tabular-nums">− {formatCurrency(advanceApplied)}</dd></div> : null}
          <div className="flex items-end justify-between border-t border-dashed border-[#DCCFBC] pt-2"><dt className="font-bold text-stone-900">To pay</dt><dd className="text-xl font-extrabold tabular-nums text-emerald-700">{formatCurrency(remainingPayable)}</dd></div>
          <div className="flex justify-between text-stone-600"><dt>Balance after this payment</dt><dd className="tabular-nums">{formatCurrency(remainingBalance)}</dd></div>
          <div className="flex justify-between"><dt className="text-stone-600">Status</dt><dd><Pill tone={STATUS_TONE[paymentStatus]}>{paymentStatus.replace('_', ' ')}</Pill></dd></div>
          {advanceCarriedForward > 0 ? <p className="text-xs text-amber-700">Advance exceeds this salary. {formatCurrency(advanceCarriedForward)} stays outstanding and carries to the next period — no negative payment is created.</p> : null}
          {outstandingAdvance > 0 ? <p className="text-xs text-stone-500">The advance was already paid and expensed when it was given, so only the remaining amount is paid now.</p> : null}
        </dl>

        {form.staffId ? (
          <div className="rounded-2xl border border-stone-200 p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-bold text-stone-900">Advances</span>
              <button type="button" onClick={onGiveAdvance} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-stone-300 px-3 text-xs font-semibold hover:bg-stone-50"><HandCoins className="h-3.5 w-3.5" />Give advance</button>
            </div>
            {advances.length === 0 ? <p className="mt-2 text-xs text-stone-500">No advances recorded for this staff member.</p> : (
              <div className="mt-2 space-y-1.5">
                {advances.map((advance) => (
                  <div key={advance.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 text-stone-600">{fmtDate(advance.paymentDate)} · {methodLabel(advance.paymentMethod)}{advance.appliedAmount > 0 ? ` · applied ${formatCurrency(advance.appliedAmount)}` : ''}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="font-semibold tabular-nums">{formatCurrency(advance.amount)}</span>
                      {advance.appliedAmount > 0
                        ? <span className="text-[10px] text-stone-400" title="Already deducted from a salary payment — edit that payment first to release it.">locked</span>
                        : <button type="button" onClick={() => onCancelAdvance(advance)} className="rounded border border-rose-200 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-50">Cancel</button>}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-stone-200 pt-1.5 text-xs font-semibold"><span>Total advance outstanding</span><span className="tabular-nums">{formatCurrency(outstandingAdvance)}</span></div>
              </div>
            )}
          </div>
        ) : null}
      </Section>

      <Section step="4" title="Payment">
        <Field label="Amount paid now" hint={`Up to ${formatCurrency(remainingPayable)}`}>
          <MoneyInput large value={form.amountPaid} max={remainingPayable || undefined} placeholder={String(remainingPayable || 0)} onChange={(event) => update({ amountPaid: event.target.value, ...(form.paymentMethod === 'mixed' ? { cashAmount: event.target.value, onlineAmount: '0' } : {}) })} />
        </Field>
        <MethodPicker value={form.paymentMethod} onChange={(method) => update({ paymentMethod: method, ...(method === 'mixed' ? { cashAmount: form.amountPaid || '', onlineAmount: '0' } : {}) })} />
        {form.paymentMethod === 'mixed' ? <MixedSplit total={form.amountPaid} cash={form.cashAmount} online={form.onlineAmount} onChange={update} labels={['Cash paid', 'Online paid']} /> : null}
        <Field label="Payment date"><Input type="date" value={form.paymentDate} max={today()} onChange={(event) => update({ paymentDate: event.target.value })} /></Field>
        <Field label="Notes"><Textarea rows={2} value={form.notes} onChange={(event) => update({ notes: event.target.value })} /></Field>
      </Section>

      <div className="sticky bottom-0 flex gap-2 border-t border-[#ECE4D8] bg-[#FBF9F6] px-5 py-4 sm:px-6">
        <button type="button" onClick={onReset} className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700 hover:bg-stone-50"><RotateCcw className="h-4 w-4" />Clear</button>
        <button type="button" onClick={onSave} disabled={saving || !form.staffId || mixedOff} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-extrabold text-white shadow-[0_8px_18px_rgba(4,120,87,0.22)] hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none">
          <Coins className="h-4 w-4" />{saving ? 'Saving…' : form.id ? 'Save changes' : 'Save salary payment'}
        </button>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- salary list */

function SalaryTable({ salaries, onEdit, onDelete, editingId, readOnly = false }) {
  const totals = salaries.reduce((acc, row) => ({ gross: acc.gross + num(row.totalPayable), paid: acc.paid + num(row.amountPaid), balance: acc.balance + num(row.remainingBalance) }), { gross: 0, paid: 0, balance: 0 });
  return (
    <section className="min-w-0 overflow-hidden rounded-[20px] border border-[#ECE4D8] bg-white">
      <div className="border-b border-stone-100 px-5 py-4 sm:px-6">
        <h2 className="text-base font-extrabold text-stone-900">Salary payments</h2>
        <p className="text-sm text-stone-500">{salaries.length} payment{salaries.length === 1 ? '' : 's'} in this period · paid <strong className="text-stone-800">{formatCurrency(totals.paid)}</strong> · still owed <strong className="text-amber-800">{formatCurrency(totals.balance)}</strong></p>
      </div>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-stone-50 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-stone-500">
            <tr><th className="px-5 py-3">Staff</th><th className="px-4 py-3">Month</th><th className="px-4 py-3 text-right">Gross</th><th className="px-4 py-3 text-right">Advance</th><th className="px-4 py-3 text-right">Paid</th><th className="px-4 py-3 text-right">Balance</th><th className="px-4 py-3">Status</th>{readOnly ? null : <th className="px-4 py-3"><span className="sr-only">Actions</span></th>}</tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {salaries.map((salary) => (
              <tr key={salary.id} onClick={() => onEdit(salary)} className={`cursor-pointer hover:bg-amber-50/50 ${String(editingId) === String(salary.id) ? 'bg-amber-50/70' : ''}`} title="Open this salary payment">
                <td className="px-5 py-3 font-semibold text-stone-900">{salary.staffName}</td>
                <td className="whitespace-nowrap px-4 py-3 text-stone-600">{fmtMonth(salary.salaryMonth)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(salary.totalPayable)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-amber-700">{salary.advanceApplied > 0 ? `− ${formatCurrency(salary.advanceApplied)}` : '—'}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatCurrency(salary.amountPaid)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(salary.remainingBalance)}</td>
                <td className="px-4 py-3"><Pill tone={STATUS_TONE[salary.paymentStatus]}>{salary.paymentStatus.replace('_', ' ')}</Pill></td>
                {readOnly ? null : (
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1" onClick={(event) => event.stopPropagation()}>
                      <button type="button" onClick={() => onEdit(salary)} aria-label={`Edit ${salary.staffName} salary`} className="grid h-9 w-9 place-items-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-800"><Pencil className="h-4 w-4" /></button>
                      <button type="button" onClick={() => onDelete(salary)} aria-label={`Delete ${salary.staffName} salary`} className="grid h-9 w-9 place-items-center rounded-lg text-stone-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {!salaries.length ? <tr><td colSpan={8} className="px-5 py-12 text-center text-stone-400">No salary payments in this period.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- advances */

/**
 * Give an advance. Salary-based staff are limited by their base salary; commission-based staff
 * by the commission they have already earned and not been paid (shown live). An admin may go
 * over the allowance with a written reason. The advance books an ordinary salary / commission
 * expense immediately and is deducted from the next settlement.
 */
function AdvanceDialog({ form, setForm, staff, member, outstandingAdvance, saving, error, overLimit, onCancel, onSave }) {
  const update = (patch) => setForm((current) => ({ ...current, ...patch }));
  const newTotal = num(outstandingAdvance) + num(form.amount);
  const mixedOff = form.paymentMethod === 'mixed' && Math.abs(round2(num(form.cashAmount) + num(form.onlineAmount)) - num(form.amount)) > 0.009;
  const isCommission = member?.payType === 'commission';
  return (
    <SidePanel
      eyebrow="Advance"
      icon={HandCoins}
      title={isCommission ? 'Give commission advance' : 'Give salary advance'}
      subtitle="Paid now, deducted from the next settlement."
      onClose={onCancel}
      footer={(
        <div className="space-y-2">
          {error ? <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCancel} disabled={saving} className="min-h-11 rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold">Cancel</button>
            <button type="button" onClick={onSave} disabled={saving || !form.staffId || !num(form.amount) || mixedOff || (overLimit && !form.overrideReason.trim())} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-extrabold text-white hover:bg-emerald-800 disabled:opacity-50">
              <HandCoins className="h-4 w-4" />{saving ? 'Saving…' : `Pay ${num(form.amount) ? formatCurrency(form.amount) : 'advance'}`}
            </button>
          </div>
        </div>
      )}
    >
      <div className="space-y-4">
        <Field label="Staff member" required>
          <Select value={form.staffId} onChange={(event) => update({ staffId: event.target.value, overrideReason: '' })}>
            <option value="">Choose staff…</option>
            {staff.map((row) => <option key={row.id} value={row.id}>{row.name} ({row.role} · {row.payType === 'commission' ? 'commission' : 'salary'})</option>)}
          </Select>
        </Field>
        {member && isCommission ? <CommissionPanel staffId={member.id} /> : null}
        {member && !isCommission ? (
          <dl className="space-y-1.5 rounded-xl bg-[#FBF9F6] p-3 text-sm ring-1 ring-[#ECE4D8]">
            <div className="flex justify-between"><dt className="text-stone-600">Monthly salary</dt><dd className="font-semibold tabular-nums">{formatCurrency(member.baseSalary)}</dd></div>
            <div className="flex justify-between"><dt className="text-stone-600">Advance already given</dt><dd className="font-semibold tabular-nums">{formatCurrency(outstandingAdvance)}</dd></div>
            <div className="flex justify-between border-t border-dashed border-[#DCCFBC] pt-1.5"><dt className="font-bold">Outstanding after this</dt><dd className="font-extrabold tabular-nums">{formatCurrency(newTotal)}</dd></div>
          </dl>
        ) : null}
        <Field label="Advance amount" required><MoneyInput large value={form.amount} onChange={(event) => update({ amount: event.target.value, ...(form.paymentMethod === 'mixed' ? { cashAmount: event.target.value, onlineAmount: '0' } : {}) })} /></Field>
        {overLimit ? (
          <Field label="Over the allowance — reason" required hint="Admin approval">
            <Input value={form.overrideReason} onChange={(event) => update({ overrideReason: event.target.value })} placeholder="Why this advance may exceed the allowance" />
          </Field>
        ) : null}
        <MethodPicker value={form.paymentMethod} onChange={(method) => update({ paymentMethod: method, ...(method === 'mixed' ? { cashAmount: form.amount || '', onlineAmount: '0' } : {}) })} />
        {form.paymentMethod === 'mixed' ? <MixedSplit total={form.amount} cash={form.cashAmount} online={form.onlineAmount} onChange={update} labels={['Cash paid', 'Online paid']} /> : null}
        <Field label="Payment date"><Input type="date" value={form.paymentDate} max={today()} onChange={(event) => update({ paymentDate: event.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Reference no."><Input value={form.referenceNumber} onChange={(event) => update({ referenceNumber: event.target.value })} /></Field>
          <Field label="Reason / note"><Input value={form.note} onChange={(event) => update({ note: event.target.value })} /></Field>
        </div>
        <p className="text-xs text-stone-500">Cash advances reduce the drawer; online advances reduce the online balance. The amount is deducted from this staff member&apos;s next settlement, so the expense is recognised only once.</p>
      </div>
    </SidePanel>
  );
}

/* ----------------------------------------------------------------- reports */

function ReportFilters({ filters, setFilters, categoryList, paymentMethods, paymentStatuses, staff }) {
  const update = (patch) => setFilters((current) => ({ ...current, ...patch }));
  const active = Object.entries(filters).filter(([key, value]) => value && !(['category', 'paymentMethod', 'paymentStatus'].includes(key) && value === 'all')).length;
  return (
    <section className="rounded-[20px] border border-[#ECE4D8] bg-white p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div><h2 className="text-base font-extrabold text-stone-900">Filter records</h2><p className="text-sm text-stone-500">The period above and these filters apply to both lists below. Tap any row for its details.</p></div>
        {active ? <button type="button" onClick={() => setFilters(emptyFilters)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-stone-300 px-3 text-sm font-semibold text-stone-700 hover:bg-stone-50"><RotateCcw className="h-4 w-4" />Clear {active}</button> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Search"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" /><input value={filters.search} onChange={(event) => update({ search: event.target.value })} className={`${CONTROL} pl-9`} placeholder="Title, staff, month…" /></div></Field>
        <Field label="Category"><Select value={filters.category} onChange={(event) => update({ category: event.target.value })}><option value="all">All</option>{categoryList.map((category) => <option key={category.id} value={category.name}>{category.label}</option>)}</Select></Field>
        <Field label="Paid with"><Select value={filters.paymentMethod} onChange={(event) => update({ paymentMethod: event.target.value })}><option value="all">All</option>{paymentMethods.map((method) => <option key={method} value={method}>{methodLabel(method)}</option>)}</Select></Field>
        <Field label="Salary status"><Select value={filters.paymentStatus} onChange={(event) => update({ paymentStatus: event.target.value })}><option value="all">All</option>{paymentStatuses.map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}</Select></Field>
        <Field label="Staff"><Select value={filters.staffId} onChange={(event) => update({ staffId: event.target.value })}><option value="">All</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</Select></Field>
        <Field label="Salary month" hint="Overrides the period for salaries"><MonthInput value={filters.salaryMonth} onChange={(event) => update({ salaryMonth: event.target.value })} className={CONTROL} /></Field>
      </div>
    </section>
  );
}
