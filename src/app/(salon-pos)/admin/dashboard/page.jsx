'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  Banknote,
  CalendarDays,
  DollarSign,
  Package,
  Plus,
  RefreshCw,
  ShoppingCart,
  Ticket,
  Users,
} from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import { getNepaliDateString } from '@/lib/time-utils';
import FinancialOverview from '@/modules/reports/components/financial-overview';

const PERIOD_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: '3days', label: 'Last 3 Days' },
  { value: '7days', label: 'Last 7 Days' },
  { value: 'month', label: 'This Month' },
];

const CARD = 'rounded-2xl border border-[#ece7e1] bg-white shadow-[0_1px_2px_rgba(40,30,20,0.04)]';
const BUTTON = 'inline-flex h-[38px] items-center justify-center gap-2 rounded-[10px] px-3.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#b7a4fa] disabled:cursor-not-allowed disabled:opacity-60';

function num(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

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

function ActionButton({ children, icon: Icon, variant = 'secondary', ...props }) {
  const className = variant === 'primary'
    ? `${BUTTON} border border-[#6b46e5] bg-[#6b46e5] text-white shadow-[0_6px_14px_-8px_rgba(107,70,229,0.9)] hover:border-[#5a38d0] hover:bg-[#5a38d0]`
    : `${BUTTON} border border-[#e4ded6] bg-white text-[#3a342d] hover:border-[#d6cfc5] hover:bg-[#f7f5f2]`;

  return (
    <button type="button" className={className} {...props}>
      {Icon ? <Icon className="h-4 w-4" /> : null}
      <span>{children}</span>
    </button>
  );
}

function DashboardHeader({ periodLabel, rangeLabel, updatedAt, refreshing, onRefresh, onNavigate }) {
  return (
    <header className="border-b border-[#e9e3db] pb-5">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold leading-tight tracking-[-0.02em] text-[#17140f] sm:text-[28px]">
            Admin Dashboard
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#7a736b]">
            Sales, collections, outflows and queue health for the selected report period.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium">
            <span className="inline-flex items-center gap-2 rounded-lg border border-[#e9e3db] bg-white px-3 py-1.5 text-[#5c554d]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#1f8a5b]" />
              Live
              <CalendarDays className="h-3.5 w-3.5 text-[#6b46e5]" />
              {getNepaliDateString(new Date())}
            </span>
            <span className="text-[#8a837b]">
              {periodLabel || 'Today'}{rangeLabel ? ` · ${rangeLabel}` : ''}
            </span>
            {updatedAt ? <span className="text-[#8a837b]">Updated {updatedAt}</span> : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 xl:max-w-[650px] xl:justify-end">
          <ActionButton variant="primary" icon={Plus} onClick={() => onNavigate('/admin/billing')}>New Bill</ActionButton>
          <ActionButton icon={Ticket} onClick={() => onNavigate('/dashboard/admin/tokens')}>Tokens</ActionButton>
          <ActionButton icon={Banknote} onClick={() => onNavigate('/dashboard/admin/expenses')}>Expenses</ActionButton>
          <ActionButton icon={Users} onClick={() => onNavigate('/admin/customers')}>Customers</ActionButton>
          <ActionButton icon={RefreshCw} onClick={onRefresh} disabled={refreshing}>
            {refreshing ? 'Refreshing' : 'Refresh'}
          </ActionButton>
        </div>
      </div>
    </header>
  );
}

const PERIOD_TABS = [...PERIOD_OPTIONS, { value: 'custom', label: 'Custom Range' }];

function PeriodBar({ period, rangeLabel, onChange, onTransactions, onReports, customRange, onCustomChange, onApplyCustom, today }) {
  return (
    <div className="flex flex-col gap-3 py-1">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div
          role="tablist"
          aria-label="Dashboard report period"
          className="grid grid-cols-2 gap-1 rounded-xl bg-[#efebe5] p-1 sm:inline-grid sm:grid-cols-5"
        >
          {PERIOD_TABS.map((option) => {
            const active = period === option.value;
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
          <span className="text-sm font-extrabold text-[#2a251f]">{rangeLabel || 'Nepal calendar dates'}</span>
        </div>

        <div className="flex flex-wrap gap-2 lg:ml-auto">
          <ActionButton onClick={onTransactions}>View All Transactions</ActionButton>
          <ActionButton onClick={onReports}>Full Reports</ActionButton>
        </div>
      </div>

      {period === 'custom' ? (
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

function Panel({ title, description, action, children, className = '' }) {
  return (
    <section className={`${CARD} overflow-hidden ${className}`}>
      <div className="flex flex-col gap-2 border-b border-[#f0ece6] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div>
          <h2 className="text-[15px] font-bold text-[#17140f]">{title}</h2>
          {description ? <p className="mt-1 text-xs leading-5 text-[#8a837b]">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function TodayGlance({ stats, profit, periodLabel }) {
  const items = [
    { label: `${periodLabel} Net Sales`, value: formatCurrency(stats?.todaySales), tone: 'text-[#17140f]' },
    { label: `${periodLabel} Operating Profit`, value: formatCurrency(profit), tone: 'text-[#1f7a52]' },
    { label: `${periodLabel} Bills`, value: num(stats?.todayOrders), tone: 'text-[#17140f]' },
    { label: 'Total Staff - Active', value: num(stats?.totalEmployees), tone: 'text-[#17140f]' },
  ];

  return (
    <section aria-label="Admin period at a glance" className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#ece7e1] bg-[#ece7e1] lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="bg-white px-4 py-3.5 sm:px-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#8a837b]">{item.label}</p>
          <p className={`mt-1 text-xl font-extrabold tabular-nums ${item.tone}`}>{item.value}</p>
        </div>
      ))}
    </section>
  );
}

function TokenQueue({ tokenStats, onManage }) {
  const groups = [
    {
      title: 'Queue',
      rows: [
        ['Waiting Now', tokenStats.waiting || 0],
        ['Cancelled / No-show', num(tokenStats.cancelled) + num(tokenStats.noShow)],
      ],
    },
    {
      title: 'Generation',
      rows: [
        ['Tokens Generated', tokenStats.generated || 0],
        ['Digital Tokens', tokenStats.digitalTokens || 0],
        ['Printed Tokens', tokenStats.printedTokens || 0],
      ],
    },
    {
      title: 'Conversion',
      rows: [
        ['Converted to Bills', tokenStats.billed || 0],
        [
          'Conversion Rate',
          num(tokenStats.generated) > 0 ? `${Math.round((num(tokenStats.billed) / num(tokenStats.generated)) * 100)}%` : '0%',
        ],
      ],
    },
    {
      title: 'Billing',
      rows: [
        ['Digital Bills', tokenStats.digitalBills || 0],
        ['Printed Bills', tokenStats.printedBills || 0],
        ['Direct Bills', tokenStats.directBills || tokenStats.billsWithoutToken || 0],
      ],
    },
  ];

  return (
    <Panel
      title="Token and Queue Summary"
      description="Token cohort for the selected period, with Waiting Now kept live."
      action={
        <button
          type="button"
          onClick={onManage}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6b46e5]"
        >
          Manage tokens
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      }
    >
      <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4 sm:p-5">
        {groups.map((group) => (
          <div key={group.title} className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#9a938b]">{group.title}</p>
            {group.rows.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 rounded-xl border border-[#f0ece6] bg-[#fbfaf8] px-3 py-2.5">
                <span className="text-[12.5px] font-medium text-[#5c554d]">{label}</span>
                <span className="text-sm font-extrabold tabular-nums text-[#17140f]">{value}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function RecentTransactions({ transactions, period, onNavigate }) {
  if (!transactions.length) {
    return (
      <Panel
        title="Recent Transactions"
        description="Latest completed bills for the selected period."
        action={<ActionButton onClick={() => onNavigate(`/admin/reports/transactions?period=${period}`)}>View All</ActionButton>}
      >
        <div className="m-4 rounded-2xl border border-dashed border-[#e2dcd4] bg-[#fbfaf8] px-6 py-10 text-center">
          <p className="text-sm font-bold text-[#3a342d]">No transactions in this period.</p>
          <p className="mt-1 text-xs text-[#8a837b]">Bills created for this period will appear here instantly.</p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title="Recent Transactions"
      description={`Latest ${transactions.length} completed bills for this period.`}
      action={<ActionButton onClick={() => onNavigate(`/admin/reports/transactions?period=${period}`)}>View All</ActionButton>}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] border-collapse text-left text-[12.5px] tabular-nums">
          <thead>
            <tr className="border-b border-[#f0ece6] bg-[#fbfaf8] text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#9a938b]">
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Services and Staff</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3 text-right">Cash</th>
              <th className="px-4 py-3 text-right">QR</th>
              <th className="px-4 py-3 text-right">Discount</th>
              <th className="px-4 py-3 text-right">Final Total</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f3efe9]">
            {transactions.map((bill) => {
              const serviceItems = (bill.items || []).filter((item) => item.type === 'service');
              return (
                <tr key={bill.id} className="align-top hover:bg-[#fbf8ff]">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-[#5c554d]">{formatTime(bill.transaction_date)}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-bold text-[#17140f]">{bill.bill_number}</td>
                  <td className="px-4 py-3 text-[#3a342d]">{bill.customer_name || 'Walk-in Customer'}</td>
                  <td className="px-4 py-3">
                    {serviceItems.length ? (
                      <div className="space-y-1">
                        {serviceItems.map((item, index) => (
                          <div key={`${bill.id}-${index}-${item.name}-${item.staffName || 'unassigned'}`}>
                            <span className="font-semibold text-[#17140f]">{item.name}</span>
                            <span className="text-[#9a938b]"> - </span>
                            <span className="text-[#5c554d]">{item.staffName || 'Unassigned'}</span>
                          </div>
                        ))}
                      </div>
                    ) : <span className="text-[#8a837b]">Product sale only</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-lg bg-[#f2eefe] px-2.5 py-1 text-xs font-bold text-[#5433c9]">
                      {bill.paymentLabel || 'Not recorded'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-[#3a342d]">{formatCurrency(bill.cash_amount)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-[#3a342d]">{formatCurrency(bill.qr_amount)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-[#3a342d]">{formatCurrency(bill.discount_amount)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-extrabold text-[#6b46e5]">{formatCurrency(bill.grand_total)}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-lg bg-[#eaf6f0] px-2.5 py-1 text-xs font-bold text-[#1f7a52]">
                      {categoryLabel(bill.status || 'paid')}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function RevenueMix({ stats }) {
  const topServices = stats?.topServices || [];
  const serviceTotal = topServices.reduce((sum, item) => sum + num(item.revenue), 0);
  const rows = serviceTotal > 0
    ? topServices.map((item, index) => ({
        name: item.name,
        amount: num(item.revenue),
        pct: Math.round((num(item.revenue) / serviceTotal) * 100),
        color: ['#6b46e5', '#8064ea', '#9e86f0', '#bcacf5', '#d8cffb'][index] || '#6b46e5',
      }))
    : (stats?.revenueSources || []).map((item, index) => ({
        name: item.type === 'service' ? 'Services' : 'Products',
        amount: num(item.amount),
        pct: num(item.percentage),
        color: index === 0 ? '#6b46e5' : '#1f8a5b',
      }));

  return (
    <Panel title="Revenue Mix" description={`By service - ${stats?.period?.displayRange || 'selected period'}`}>
      {rows.length ? (
        <div className="space-y-3 p-4 sm:p-5">
          {rows.map((row) => (
            <div key={row.name} className="space-y-1.5">
              <div className="flex items-baseline gap-3">
                <span className="text-[12.5px] font-semibold text-[#3a342d]">{row.name}</span>
                <span className="ml-auto text-sm font-extrabold tabular-nums text-[#17140f]">{formatCurrency(row.amount)}</span>
                <span className="w-11 text-right text-xs font-bold text-[#8a837b]">{row.pct}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#f1ede7]">
                <span className="block h-full rounded-full" style={{ width: `${Math.min(100, row.pct)}%`, backgroundColor: row.color }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="m-4 rounded-2xl border border-dashed border-[#e2dcd4] bg-[#fbfaf8] px-6 py-10 text-center">
          <p className="text-sm font-bold text-[#3a342d]">No revenue data available for this period.</p>
          <p className="mt-1 text-xs text-[#8a837b]">Completed service and product sales will appear here.</p>
        </div>
      )}
    </Panel>
  );
}

function StockAlerts({ items, onNavigate }) {
  return (
    <Panel
      title="Stock Alerts"
      action={
        <button
          type="button"
          onClick={() => onNavigate('/admin/stock')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6b46e5]"
        >
          View inventory
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      }
    >
      {items.length ? (
        <div className="space-y-2 p-4 sm:p-5">
          {items.map((item) => (
            <div key={item.name} className="flex items-center gap-3 rounded-xl border border-[#f5dfc8] bg-[#fdf8f2] px-3 py-3">
              <span className={`h-2 w-2 flex-none rounded-sm ${item.status === 'critical' ? 'bg-[#c4392f]' : 'bg-[#c4691f]'}`} />
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-[#17140f]">{item.name}</span>
              <span className="whitespace-nowrap text-xs font-bold tabular-nums text-[#b4651a]">
                {item.qty} {item.unit} - {item.status}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="m-4 flex items-center gap-3 rounded-xl border border-[#d5ebe0] bg-[#f6fbf8] px-4 py-4">
          <span className="h-2 w-2 rounded-full bg-[#1f8a5b]" />
          <span className="text-[12.5px] font-semibold text-[#1f7a52]">All stock levels are good.</span>
        </div>
      )}
    </Panel>
  );
}

function StaffActivity({ staff }) {
  return (
    <Panel title="Staff Activity" description="Revenue attributed by service assignment.">
      {staff.length ? (
        <div className="divide-y divide-[#f3efe9]">
          {staff.map((member) => (
            <div key={`${member.name}-${member.salon_role}`} className="grid gap-3 px-4 py-3.5 sm:grid-cols-[1.2fr_0.7fr_0.8fr] sm:items-center sm:px-5">
              <div>
                <p className="font-bold text-[#17140f]">{member.name}</p>
                <p className="mt-0.5 text-xs capitalize text-[#8a837b]">{member.salon_role}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#9a938b]">Services</p>
                <p className="font-extrabold text-[#17140f]">{num(member.services)}</p>
              </div>
              <div className="sm:text-right">
                <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#9a938b]">Revenue</p>
                <p className="font-extrabold text-[#17140f]">{formatCurrency(member.revenue)}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="m-4 rounded-2xl border border-dashed border-[#e2dcd4] bg-[#fbfaf8] px-6 py-10 text-center text-sm font-semibold text-[#5c554d]">
          No staff performance data is available for this period.
        </div>
      )}
    </Panel>
  );
}

function BusinessOverview({ stats, profit, periodLabel }) {
  const rows = [
    [`Net sales (${periodLabel})`, formatCurrency(stats?.todaySales)],
    ['Operating profit', formatCurrency(profit)],
    ['Average bill value', formatCurrency(stats?.avgOrder)],
    ['Customers served', num(stats?.todayCustomers)],
    ['Services sold', num(stats?.todayServices)],
    ['Active services', num(stats?.totalProducts)],
    ['Customer retention', `${num(stats?.repeatCustomerRate)}%`],
    ['Commission earned', formatCurrency(stats?.commissionSummary)],
  ];

  return (
    <Panel title="Business Overview" description="Management-level period summary.">
      <dl className="divide-y divide-[#f3efe9] px-4 py-2 sm:px-5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 py-3">
            <dt className="text-sm text-[#5c554d]">{label}</dt>
            <dd className="text-right text-sm font-extrabold tabular-nums text-[#17140f]">{value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

function AttentionItems({ stats }) {
  const alerts = [
    num(stats?.tokenStats?.waiting) > 0 ? `${stats.tokenStats.waiting} customers are waiting now.` : '',
    stats?.tokenStats?.mismatchWarning ? 'Some billed tokens need invoice-link review.' : '',
    ...(stats?.lowStockItems || []).map((item) => `${item.name} is low in stock (${item.qty} ${item.unit}).`),
  ].filter(Boolean);

  return (
    <Panel title="Attention Items" description={alerts.length ? `${alerts.length} items need action.` : 'All clear.'}>
      {alerts.length ? (
        <div className="grid gap-3 p-4 md:grid-cols-3 sm:p-5">
          {alerts.map((alert) => (
            <div key={alert} className="rounded-xl border border-[#f5dfc8] bg-[#fdf8f2] px-4 py-3 text-sm font-semibold text-[#5c554d]">
              {alert}
            </div>
          ))}
        </div>
      ) : (
        <div className="m-4 flex items-center gap-3 rounded-xl border border-[#d5ebe0] bg-[#f6fbf8] px-4 py-4">
          <span className="h-2 w-2 rounded-full bg-[#1f8a5b]" />
          <span className="text-[12.5px] font-semibold text-[#3a342d]">No attention items for this period.</span>
        </div>
      )}
    </Panel>
  );
}

export default function AdminDashboard() {
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
  // Only an applied, valid range triggers a fetch — typing in the date inputs must not.
  const [appliedRange, setAppliedRange] = useState(() => (
    normalizedQueryPeriod === 'custom' && isValidRange(searchParams.get('startDate'), searchParams.get('endDate'))
      ? { start: searchParams.get('startDate'), end: searchParams.get('endDate') }
      : { start: '', end: '' }
  ));
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');

  const customQuery = period === 'custom' && isValidRange(appliedRange.start, appliedRange.end)
    ? `&startDate=${appliedRange.start}&endDate=${appliedRange.end}`
    : '';

  const fetchStats = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('pos_token');
      const response = await fetch(`/api/admin/dashboard?period=${period}${customQuery}`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load the dashboard');
      setStats(data.stats);
      setUpdatedAt(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      setError(err.message || 'Failed to load the dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, customQuery]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    const nextQueryPeriod = queryPeriod === 'week' ? '7days' : queryPeriod;
    if (validPeriods.includes(nextQueryPeriod) && nextQueryPeriod !== period) {
      setPeriod(nextQueryPeriod);
    }
  }, [queryPeriod, period, validPeriods]);

  const changePeriod = (nextPeriod) => {
    setPeriod(nextPeriod);
    if (nextPeriod !== 'custom') {
      router.replace(`/admin/dashboard?period=${nextPeriod}`, { scroll: false });
    }
  };

  const applyCustom = () => {
    if (!isValidRange(customRange.start, customRange.end)) return;
    setAppliedRange({ start: customRange.start, end: customRange.end });
    router.replace(`/admin/dashboard?period=custom&startDate=${customRange.start}&endDate=${customRange.end}`, { scroll: false });
  };

  const periodMeta = stats?.period || PERIOD_OPTIONS.find((option) => option.value === period) || PERIOD_OPTIONS[0];
  const periodLabel = periodMeta.label || 'Today';
  const profit = num(stats?.todaySales) - num(stats?.todayCosts);
  const recentTransactions = stats?.recentTransactions || [];

  const quickFinancialStats = useMemo(() => ([
    { label: 'Total Customers', value: num(stats?.totalCustomers), icon: Users, tone: 'bg-[#f2eefe] text-[#5433c9]' },
    { label: 'Active Services', value: num(stats?.totalProducts), icon: Package, tone: 'bg-[#f6fbf8] text-[#1f7a52]' },
    { label: 'Bills Completed', value: num(stats?.todayOrders), icon: ShoppingCart, tone: 'bg-[#fff7ed] text-[#b4651a]' },
    { label: 'Commission Earned', value: formatCurrency(stats?.commissionSummary), icon: DollarSign, tone: 'bg-[#f2eefe] text-[#5433c9]' },
  ]), [stats]);

  return (
    <div className="min-h-screen bg-[#f7f5f2] px-3 py-4 text-[#17140f] sm:px-5 lg:px-7 lg:py-6">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-4 sm:gap-5">
        <DashboardHeader
          periodLabel={periodLabel}
          rangeLabel={periodMeta.displayRange}
          updatedAt={updatedAt}
          refreshing={refreshing}
          onRefresh={() => fetchStats({ quiet: true })}
          onNavigate={router.push}
        />

        <PeriodBar
          period={period}
          rangeLabel={periodMeta.displayRange}
          onChange={changePeriod}
          today={todayIso}
          customRange={customRange}
          onCustomChange={setCustomRange}
          onApplyCustom={applyCustom}
          onTransactions={() => router.push(`/admin/reports/transactions?period=${period}${customQuery}`)}
          onReports={() => router.push(`/admin/reports?period=${period}${customQuery}`)}
        />

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        <TodayGlance stats={stats} profit={profit} periodLabel={periodLabel} />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {quickFinancialStats.map((item) => {
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
          financial={stats?.financial}
          salesSeries={stats?.salesSeries}
          loading={loading}
          error={error}
          onRetry={() => fetchStats()}
          period={period}
          transactionsHref={`/admin/reports/transactions?period=${period}`}
          reportsHref={`/admin/reports?period=${period}`}
          updatedAt={updatedAt}
          showHeader={false}
        />

        <RecentTransactions transactions={recentTransactions} period={period} onNavigate={router.push} />

        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <TokenQueue tokenStats={stats?.tokenStats || {}} onManage={() => router.push('/dashboard/admin/tokens')} />
          <StaffActivity staff={stats?.topStaff || []} />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr_1fr]">
          <RevenueMix stats={stats} />
          <StockAlerts items={stats?.lowStockItems || []} onNavigate={router.push} />
          <BusinessOverview stats={stats} profit={profit} periodLabel={periodLabel} />
        </div>

        <AttentionItems stats={stats} />
      </div>
    </div>
  );
}
