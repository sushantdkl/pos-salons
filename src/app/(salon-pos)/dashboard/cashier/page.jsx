'use client';

import { useEffect, useState } from 'react';
import { CreditCard, MessageCircle, ReceiptText, Scissors, Ticket, Users, Wallet, Warehouse } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/currency';

const actions = [
  { label: 'Create Bill', description: 'Start checkout with services and products.', href: '/admin/billing', icon: CreditCard },
  { label: 'Tokens', description: 'Generate and convert walk-in tokens.', href: '/dashboard/cashier/tokens', icon: Ticket },
  { label: 'Daily Expenses', description: 'Record petty cash and daily savings.', href: '/dashboard/cashier/daily-expenses', icon: ReceiptText },
  { label: 'Customers', description: 'Find or create customer profiles.', href: '/admin/customers', icon: Users },
  { label: 'Services', description: 'Review service pricing and duration.', href: '/admin/products', icon: Scissors },
  { label: 'Inventory', description: 'View stock and low-stock products.', href: '/admin/stock', icon: Warehouse },
  { label: 'Reminders', description: 'Send manual WhatsApp reminders.', href: '/admin/reminders', icon: MessageCircle },
];

function MetricCard({ label, value }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-gray-950">{value}</p>
    </div>
  );
}

export default function CashierDashboard() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch('/api/cashier/dashboard', {
          headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` },
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not load cashier dashboard');
        setData(payload);
      } catch (err) {
        setError(err.message || 'Could not load cashier dashboard');
      }
    }
    load();
  }, []);

  const summary = data?.summary || {};
  const metrics = [
    ['Bills completed', summary.totalBills || 0],
    ['Total sales', formatCurrency(summary.totalSales || 0)],
    ['Cash received', formatCurrency(summary.cashReceived || 0)],
    ['QR received', formatCurrency(summary.qrReceived || 0)],
    ['Esewa / PhonePay', formatCurrency(summary.esewaPhonePayReceived || 0)],
    ['Bank QR', formatCurrency(summary.bankQrReceived || 0)],
    ['Split cash', formatCurrency(summary.splitCash || 0)],
    ['Split QR', formatCurrency(summary.splitQr || 0)],
    ['Tokens generated', summary.tokensGenerated || 0],
    ['Tokens converted', summary.tokensConverted || 0],
    ['Direct bills', summary.directBills || 0],
    ['Customers served', summary.customersServed || 0],
    ['Services sold', summary.servicesSold || 0],
    ['Products sold', summary.productsSold || 0],
    ['Petty expenses', formatCurrency(summary.dailyPettyExpenses || 0)],
    ['Daily saving', formatCurrency(summary.dailySaving || 0)],
    ['Waiting tokens', summary.currentWaitingTokens || 0],
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-950 sm:text-3xl">Cashier Dashboard</h1>
            <p className="mt-1 text-sm text-gray-600">Today&apos;s front-desk sales, tokens, payments, and daily cash records.</p>
          </div>
          <button onClick={() => router.push('/dashboard/cashier/daily-expenses')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white">
            <Wallet className="h-4 w-4" />
            Add Daily Expense
          </button>
        </div>

        {error ? <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          {metrics.map(([label, value]) => <MetricCard key={label} label={label} value={value} />)}
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {actions.map((action) => (
            <button key={action.href} onClick={() => router.push(action.href)} className="rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:border-gray-400 hover:shadow-md">
              <action.icon className="mb-4 h-7 w-7 text-gray-800" />
              <h2 className="text-lg font-semibold text-gray-950">{action.label}</h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">{action.description}</p>
            </button>
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 p-5">
              <h2 className="font-semibold text-gray-950">Recent Bills</h2>
              <p className="text-sm text-gray-500">Completed by you today</p>
            </div>
            <div className="divide-y divide-gray-100">
              {(data?.recentBills || []).length ? data.recentBills.map((bill) => (
                <div key={bill.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-950">{bill.bill_number}</p>
                      <p className="text-sm text-gray-500">{bill.customer_name || 'Walk-in Customer'} - {new Date(bill.transaction_date).toLocaleString()}</p>
                    </div>
                    <p className="font-semibold text-gray-950">{formatCurrency(bill.grand_total)}</p>
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-gray-600">
                    {(bill.items || []).filter((item) => item.type === 'service').map((item) => (
                      <p key={`${bill.id}-${item.name}-${item.staffName}`}>{item.name} - {item.staffName || 'Unassigned'}</p>
                    ))}
                  </div>
                </div>
              )) : <div className="p-8 text-center text-sm text-gray-500">No bills completed today.</div>}
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 p-5">
              <h2 className="font-semibold text-gray-950">Recent Expenses</h2>
              <p className="text-sm text-gray-500">Petty expenses and cash transfers</p>
            </div>
            <div className="divide-y divide-gray-100">
              {(data?.recentExpenses || []).length ? data.recentExpenses.map((expense) => (
                <div key={expense.id} className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium text-gray-950">{expense.title}</p>
                    <p className="text-xs text-gray-500">{expense.category} - {expense.record_type}</p>
                  </div>
                  <p className="font-semibold text-gray-950">{formatCurrency(expense.amount)}</p>
                </div>
              )) : <div className="p-8 text-center text-sm text-gray-500">No expenses recorded today.</div>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
