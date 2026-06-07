'use client';

import { useEffect, useMemo, useState } from 'react';
import { DollarSign, Plus, Save, Search, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';

const tabs = ['Overview', 'Expenses', 'Salary Payments', 'Reports'];
const emptyExpense = {
  title: '',
  category: 'Other',
  amount: '',
  paymentMethod: 'cash',
  cashAmount: '',
  onlineAmount: '',
  paidBy: 'Admin',
  paidTo: '',
  expenseDate: new Date().toISOString().slice(0, 10),
  notes: '',
  referenceNumber: '',
  attachmentUrl: '',
};
const emptySalary = {
  staffId: '',
  salaryMonth: new Date().toISOString().slice(0, 7),
  baseSalary: 0,
  commissionEarned: 0,
  bonus: 0,
  deduction: 0,
  amountPaid: 0,
  paymentMethod: 'cash',
  cashAmount: 0,
  onlineAmount: 0,
  paymentDate: new Date().toISOString().slice(0, 10),
  notes: '',
};

function headers() {
  return {
    Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
    'Content-Type': 'application/json',
  };
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-gray-900">{label}</span>
      {children}
    </label>
  );
}

function Input(props) {
  return <input {...props} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900" />;
}

function Select(props) {
  return <select {...props} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900" />;
}

function Textarea(props) {
  return <textarea {...props} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900" />;
}

export default function AdminExpensesPage() {
  const [activeTab, setActiveTab] = useState('Overview');
  const [data, setData] = useState(null);
  const [expenseForm, setExpenseForm] = useState(emptyExpense);
  const [salaryForm, setSalaryForm] = useState(emptySalary);
  const [filters, setFilters] = useState({ search: '', category: 'all', paymentMethod: 'all', paymentStatus: 'all', staffId: '', salaryMonth: '', from: '', to: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  }, [filters]);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    const response = await fetch(`/api/admin/expenses?${query}`, { headers: headers() });
    const payload = await response.json();
    if (response.ok) setData(payload);
    else setError(payload.error || 'Could not load expenses');
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [query]);

  const selectedStaff = useMemo(() => {
    if (!data) return null;
    return data.staff.find((member) => String(member.id) === String(salaryForm.staffId));
  }, [data, salaryForm.staffId]);

  useEffect(() => {
    if (!selectedStaff) return;
    const loadMetrics = async () => {
      const params = new URLSearchParams({ staffId: String(selectedStaff.id), salaryMonth: salaryForm.salaryMonth });
      const response = await fetch(`/api/admin/expenses?${params.toString()}`, { headers: headers() });
      const payload = await response.json();
      const staff = payload.staff?.find((member) => String(member.id) === String(selectedStaff.id));
      setSalaryForm((current) => ({
        ...current,
        baseSalary: Number(selectedStaff.baseSalary || 0),
        commissionEarned: Number(staff?.monthMetrics?.commissionEarned || 0),
      }));
    };
    loadMetrics();
  }, [selectedStaff?.id, salaryForm.salaryMonth]);

  const totalPayable = Math.max(0, Number(salaryForm.baseSalary || 0) + Number(salaryForm.commissionEarned || 0) + Number(salaryForm.bonus || 0) - Number(salaryForm.deduction || 0));
  const remainingBalance = Math.max(0, totalPayable - Number(salaryForm.amountPaid || 0));
  const paymentStatus = Number(salaryForm.amountPaid || 0) <= 0 ? 'unpaid' : remainingBalance <= 0 ? 'paid' : 'partially_paid';

  const saveExpense = async () => {
    setSaving(true);
    setMessage('');
    setError('');
    const response = await fetch('/api/admin/expenses', {
      method: expenseForm.id ? 'PUT' : 'POST',
      headers: headers(),
      body: JSON.stringify(expenseForm),
    });
    const payload = await response.json();
    if (response.ok) {
      setMessage(payload.message || 'Expense saved.');
      setExpenseForm(emptyExpense);
      fetchData();
    } else {
      setError(payload.error || 'Could not save expense');
    }
    setSaving(false);
  };

  const saveSalary = async () => {
    setSaving(true);
    setMessage('');
    setError('');
    const response = await fetch('/api/admin/expenses', {
      method: salaryForm.id ? 'PUT' : 'POST',
      headers: headers(),
      body: JSON.stringify({ ...salaryForm, type: 'salary' }),
    });
    const payload = await response.json();
    if (response.ok) {
      setMessage(payload.message || 'Salary payment saved.');
      setSalaryForm(emptySalary);
      fetchData();
    } else {
      setError(payload.error || 'Could not save salary payment');
    }
    setSaving(false);
  };

  const removeRecord = async (id, type = 'expense') => {
    if (!confirm('Delete this record?')) return;
    const response = await fetch(`/api/admin/expenses?id=${id}&type=${type}`, { method: 'DELETE', headers: headers() });
    const payload = await response.json();
    if (response.ok) {
      setMessage(payload.message || 'Record deleted.');
      fetchData();
    } else {
      setError(payload.error || 'Could not delete record');
    }
  };

  if (loading && !data) {
    return <div className="min-h-screen bg-gray-50 p-6 text-gray-600">Loading expenses...</div>;
  }

  return (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-gray-950">Expenses & Salary</h1>
            <p className="mt-1 text-sm text-gray-600">Track expenses, salary payments, commission payouts, and net profit.</p>
          </div>
          <button onClick={() => setActiveTab('Expenses')} className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-950 px-5 py-3 font-semibold text-white">
            <Plus className="h-4 w-4" /> Add Expense
          </button>
        </div>

        {message ? <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">{message}</div> : null}
        {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

        <div className="mb-5 flex gap-2 overflow-x-auto rounded-lg border border-gray-200 bg-white p-2">
          {tabs.map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`shrink-0 rounded-md px-4 py-2 text-sm font-semibold ${activeTab === tab ? 'bg-gray-950 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'Overview' ? <Overview summary={data?.summary} /> : null}
        {activeTab === 'Expenses' ? (
          <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
            <ExpenseForm form={expenseForm} setForm={setExpenseForm} categories={data?.categories || []} paymentMethods={data?.paymentMethods || []} saving={saving} onSave={saveExpense} />
            <ExpenseTable expenses={data?.expenses || []} onEdit={setExpenseForm} onDelete={(id) => removeRecord(id, 'expense')} />
          </div>
        ) : null}
        {activeTab === 'Salary Payments' ? (
          <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
            <SalaryForm form={salaryForm} setForm={setSalaryForm} staff={data?.staff || []} totalPayable={totalPayable} remainingBalance={remainingBalance} paymentStatus={paymentStatus} saving={saving} onSave={saveSalary} />
            <SalaryTable salaries={data?.salaries || []} onEdit={setSalaryForm} onDelete={(id) => removeRecord(id, 'salary')} />
          </div>
        ) : null}
        {activeTab === 'Reports' ? (
          <Reports filters={filters} setFilters={setFilters} categories={data?.categories || []} paymentMethods={data?.paymentMethods || []} paymentStatuses={data?.paymentStatuses || []} staff={data?.staff || []} expenses={data?.expenses || []} salaries={data?.salaries || []} />
        ) : null}
      </div>
  );
}

function Overview({ summary = {} }) {
  const cards = [
    ['Total expenses today', summary.totalExpensesToday],
    ['Total expenses this week', summary.totalExpensesWeek],
    ['Total expenses this month', summary.totalExpensesMonth],
    ['Staff salary paid this month', summary.staffSalaryPaidMonth],
    ['Commission paid this month', summary.commissionPaidMonth],
    ['Product purchase expenses', summary.productPurchaseMonth],
    ['Other expenses', summary.otherExpensesMonth],
    ['Pending salary balance', summary.pendingSalaryBalance],
    ['Monthly revenue', summary.monthlyRevenue],
    ['Net revenue after expenses', summary.netRevenueAfterExpenses],
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {cards.map(([label, value]) => (
        <div key={label} className={`rounded-lg border p-5 shadow-sm ${String(label).includes('Net') ? 'border-gray-900 bg-gray-950 text-white' : 'border-gray-200 bg-white'}`}>
          <p className={`text-xs font-semibold uppercase tracking-wide ${String(label).includes('Net') ? 'text-white/60' : 'text-gray-500'}`}>{label}</p>
          <p className="mt-2 text-2xl font-semibold">{formatCurrency(Number(value || 0))}</p>
        </div>
      ))}
    </div>
  );
}

function ExpenseForm({ form, setForm, categories, paymentMethods, saving, onSave }) {
  const update = (patch) => setForm((current) => ({ ...current, ...patch }));
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-xl font-semibold text-gray-950">{form.id ? 'Edit Expense' : 'Add Expense'}</h2>
      <div className="grid gap-3">
        <Field label="Expense title"><Input value={form.title} onChange={(event) => update({ title: event.target.value })} /></Field>
        <Field label="Category"><Select value={form.category} onChange={(event) => update({ category: event.target.value })}>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</Select></Field>
        <Field label="Amount"><Input type="number" min="0" value={form.amount} onChange={(event) => update({ amount: event.target.value })} /></Field>
        <Field label="Payment method"><Select value={form.paymentMethod} onChange={(event) => update({ paymentMethod: event.target.value })}>{paymentMethods.map((method) => <option key={method} value={method}>{method.replace('_', ' ')}</option>)}</Select></Field>
        {form.paymentMethod === 'mixed' ? <div className="grid gap-3 md:grid-cols-2"><Field label="Cash amount"><Input type="number" min="0" value={form.cashAmount} onChange={(event) => update({ cashAmount: event.target.value })} /></Field><Field label="Online amount"><Input type="number" min="0" value={form.onlineAmount} onChange={(event) => update({ onlineAmount: event.target.value })} /></Field></div> : null}
        <div className="grid gap-3 md:grid-cols-2"><Field label="Paid by"><Input value={form.paidBy} onChange={(event) => update({ paidBy: event.target.value })} /></Field><Field label="Paid to"><Input value={form.paidTo} onChange={(event) => update({ paidTo: event.target.value })} /></Field></div>
        <Field label="Date"><Input type="date" value={form.expenseDate} onChange={(event) => update({ expenseDate: event.target.value })} /></Field>
        <div className="grid gap-3 md:grid-cols-2"><Field label="Reference number"><Input value={form.referenceNumber} onChange={(event) => update({ referenceNumber: event.target.value })} /></Field><Field label="Attachment URL"><Input value={form.attachmentUrl} onChange={(event) => update({ attachmentUrl: event.target.value })} /></Field></div>
        <Field label="Notes"><Textarea rows={3} value={form.notes} onChange={(event) => update({ notes: event.target.value })} /></Field>
        <button onClick={onSave} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-950 px-5 py-3 font-semibold text-white disabled:opacity-60"><Save className="h-4 w-4" />{saving ? 'Saving...' : 'Save Expense'}</button>
      </div>
    </section>
  );
}

function SalaryForm({ form, setForm, staff, totalPayable, remainingBalance, paymentStatus, saving, onSave }) {
  const update = (patch) => setForm((current) => ({ ...current, ...patch }));
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-xl font-semibold text-gray-950">{form.id ? 'Edit Salary Payment' : 'Add Salary Payment'}</h2>
      <div className="grid gap-3">
        <Field label="Staff"><Select value={form.staffId} onChange={(event) => update({ staffId: event.target.value })}><option value="">Select staff</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.name} ({member.role})</option>)}</Select></Field>
        <Field label="Salary month"><Input type="month" value={form.salaryMonth} onChange={(event) => update({ salaryMonth: event.target.value })} /></Field>
        <div className="grid gap-3 md:grid-cols-2"><Field label="Base salary"><Input type="number" min="0" value={form.baseSalary} onChange={(event) => update({ baseSalary: Number(event.target.value) })} /></Field><Field label="Commission earned"><Input type="number" min="0" value={form.commissionEarned} onChange={(event) => update({ commissionEarned: Number(event.target.value) })} /></Field></div>
        <div className="grid gap-3 md:grid-cols-2"><Field label="Bonus"><Input type="number" min="0" value={form.bonus} onChange={(event) => update({ bonus: Number(event.target.value) })} /></Field><Field label="Deduction"><Input type="number" min="0" value={form.deduction} onChange={(event) => update({ deduction: Number(event.target.value) })} /></Field></div>
        <div className="rounded-lg bg-gray-50 p-4 text-sm">
          <div className="flex justify-between"><span>Total payable</span><strong>{formatCurrency(totalPayable)}</strong></div>
          <div className="mt-2 flex justify-between"><span>Remaining balance</span><strong>{formatCurrency(remainingBalance)}</strong></div>
          <div className="mt-2 flex justify-between"><span>Status</span><strong>{paymentStatus.replace('_', ' ')}</strong></div>
        </div>
        <Field label="Amount paid"><Input type="number" min="0" value={form.amountPaid} onChange={(event) => update({ amountPaid: Number(event.target.value) })} /></Field>
        <Field label="Payment method"><Select value={form.paymentMethod} onChange={(event) => update({ paymentMethod: event.target.value })}><option value="cash">cash</option><option value="online">online</option><option value="bank_transfer">bank transfer</option><option value="mixed">mixed</option></Select></Field>
        {form.paymentMethod === 'mixed' ? <div className="grid gap-3 md:grid-cols-2"><Field label="Cash paid"><Input type="number" min="0" value={form.cashAmount} onChange={(event) => update({ cashAmount: Number(event.target.value) })} /></Field><Field label="Online paid"><Input type="number" min="0" value={form.onlineAmount} onChange={(event) => update({ onlineAmount: Number(event.target.value) })} /></Field></div> : null}
        <Field label="Payment date"><Input type="date" value={form.paymentDate} onChange={(event) => update({ paymentDate: event.target.value })} /></Field>
        <Field label="Notes"><Textarea rows={3} value={form.notes} onChange={(event) => update({ notes: event.target.value })} /></Field>
        <button onClick={onSave} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-950 px-5 py-3 font-semibold text-white disabled:opacity-60"><DollarSign className="h-4 w-4" />{saving ? 'Saving...' : 'Save Salary Payment'}</button>
      </div>
    </section>
  );
}

function ExpenseTable({ expenses, onEdit, onDelete }) {
  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 p-4"><h2 className="text-xl font-semibold text-gray-950">Expense Records</h2></div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">Title</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Method</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Paid To</th><th className="px-4 py-3">Actions</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {expenses.map((expense) => <tr key={expense.id}><td className="px-4 py-3 font-medium">{expense.title}</td><td className="px-4 py-3">{expense.category}</td><td className="px-4 py-3">{formatCurrency(expense.amount)}</td><td className="px-4 py-3">{expense.paymentMethod.replace('_', ' ')}</td><td className="px-4 py-3">{expense.expenseDate}</td><td className="px-4 py-3">{expense.paidTo || '-'}</td><td className="px-4 py-3"><div className="flex gap-2"><button onClick={() => onEdit(expense)} className="rounded border border-gray-300 px-3 py-1">Edit</button><button onClick={() => onDelete(expense.id)} className="rounded border border-red-200 px-3 py-1 text-red-700"><Trash2 className="h-4 w-4" /></button></div></td></tr>)}
            {!expenses.length ? <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No expenses found.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SalaryTable({ salaries, onEdit, onDelete }) {
  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 p-4"><h2 className="text-xl font-semibold text-gray-950">Salary Payments</h2></div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">Staff</th><th className="px-4 py-3">Month</th><th className="px-4 py-3">Payable</th><th className="px-4 py-3">Paid</th><th className="px-4 py-3">Balance</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {salaries.map((salary) => <tr key={salary.id}><td className="px-4 py-3 font-medium">{salary.staffName}</td><td className="px-4 py-3">{salary.salaryMonth}</td><td className="px-4 py-3">{formatCurrency(salary.totalPayable)}</td><td className="px-4 py-3">{formatCurrency(salary.amountPaid)}</td><td className="px-4 py-3">{formatCurrency(salary.remainingBalance)}</td><td className="px-4 py-3">{salary.paymentStatus.replace('_', ' ')}</td><td className="px-4 py-3"><div className="flex gap-2"><button onClick={() => onEdit(salary)} className="rounded border border-gray-300 px-3 py-1">Edit</button><button onClick={() => onDelete(salary.id)} className="rounded border border-red-200 px-3 py-1 text-red-700"><Trash2 className="h-4 w-4" /></button></div></td></tr>)}
            {!salaries.length ? <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No salary payments found.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Reports({ filters, setFilters, categories, paymentMethods, paymentStatuses, staff, expenses, salaries }) {
  const update = (patch) => setFilters((current) => ({ ...current, ...patch }));
  return (
    <div className="grid gap-5">
      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-gray-950">Filters</h2>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-8">
          <Field label="Search"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={filters.search} onChange={(event) => update({ search: event.target.value })} className="w-full rounded-lg border border-gray-300 py-3 pl-9 pr-4" /></div></Field>
          <Field label="Category"><Select value={filters.category} onChange={(event) => update({ category: event.target.value })}><option value="all">All</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</Select></Field>
          <Field label="Payment method"><Select value={filters.paymentMethod} onChange={(event) => update({ paymentMethod: event.target.value })}><option value="all">All</option>{paymentMethods.map((method) => <option key={method} value={method}>{method.replace('_', ' ')}</option>)}</Select></Field>
          <Field label="Payment status"><Select value={filters.paymentStatus} onChange={(event) => update({ paymentStatus: event.target.value })}><option value="all">All</option>{paymentStatuses.map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}</Select></Field>
          <Field label="Staff"><Select value={filters.staffId} onChange={(event) => update({ staffId: event.target.value })}><option value="">All</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</Select></Field>
          <Field label="Salary month"><Input type="month" value={filters.salaryMonth} onChange={(event) => update({ salaryMonth: event.target.value })} /></Field>
          <Field label="From"><Input type="date" value={filters.from} onChange={(event) => update({ from: event.target.value })} /></Field>
          <Field label="To"><Input type="date" value={filters.to} onChange={(event) => update({ to: event.target.value })} /></Field>
        </div>
      </section>
      <ExpenseTable expenses={expenses} onEdit={() => {}} onDelete={() => {}} />
      <SalaryTable salaries={salaries} onEdit={() => {}} onDelete={() => {}} />
    </div>
  );
}
