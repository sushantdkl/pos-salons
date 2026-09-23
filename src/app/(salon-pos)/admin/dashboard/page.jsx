'use client';

/**
 * ADMIN DASHBOARD — "What is happening right now?"
 *
 * Current Business Day only. Periods, trends and breakdowns live on Analytics and Summary.
 * All figures come from /api/admin/dashboard (money from getFinancialSummary, drawer from the
 * store status), so the dashboard reconciles with Opening & Closing and Summary.
 */

import Link from 'next/link';
import { AlertTriangle, ArrowRight, ChartColumnBig, LayoutDashboard, ScrollText, Store } from 'lucide-react';
import StoreStatusBar from '@/components/store/store-status-bar';
import {
  AlertBanner, count, EmptyState, ErpPage, ErrorState, FinancialTable, LoadingState, MetricCard, MetricGroup,
  money, PageHeader, RefreshButton, ReportSection, SectionHeading, StatusBadge,
} from '@/components/erp';
import { useReport } from '@/components/erp/use-report';

function timeLabel(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-US', { timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit' });
}

function waitedMinutes(value) {
  if (!value) return '';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function QuickLink({ href, icon: Icon, label }) {
  return (
    <Link href={href} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3.5 text-sm font-semibold text-stone-700 hover:bg-stone-50">
      <Icon className="h-4 w-4" aria-hidden="true" /> {label}
    </Link>
  );
}

function Alerts({ stats }) {
  const alerts = [];
  const store = stats.store;
  if (store?.state === 'NO_DAY') alerts.push({ tone: 'cash', text: 'No business day is open. Open the store before taking bills.' });
  if (store?.state === 'CLOSED_SAME_DAY') alerts.push({ tone: 'cash', text: 'The store is closed. Reopen it to keep trading today.' });
  if (stats.alerts?.lowStock?.length) alerts.push({ tone: 'cash', text: `${stats.alerts.lowStock.length} product(s) at or below their low-stock level.`, href: '/admin/stock' });
  if (stats.alerts?.billsMissingStaff) alerts.push({ tone: 'outflow', text: `${stats.alerts.billsMissingStaff} bill(s) have a service without an assigned staff member.` });
  if (stats.alerts?.onlineMissingQr) alerts.push({ tone: 'online', text: `${stats.alerts.onlineMissingQr} online payment(s) have no QR type recorded.` });
  if (stats.alerts?.tokenMismatch) alerts.push({ tone: 'outflow', text: `${stats.alerts.tokenMismatch} token(s) marked billed without a matching paid bill.` });
  if (stats.summary?.voidCount) alerts.push({ tone: 'outflow', text: `${stats.summary.voidCount} bill(s) voided today (${money(stats.summary.voidedSales)}).` });
  if (!alerts.length) return <AlertBanner tone="inflow" title="All clear">No operational alerts right now.</AlertBanner>;
  return (
    <div className="space-y-2">
      {alerts.map((alert) => (
        <AlertBanner
          key={alert.text}
          tone={alert.tone}
          action={alert.href ? <Link href={alert.href} className="text-xs font-bold text-stone-700 hover:underline">Open</Link> : null}
        >
          {alert.text}
        </AlertBanner>
      ))}
    </div>
  );
}

export default function AdminDashboardPage() {
  const { data, error, loading, reload } = useReport('/api/admin/dashboard?period=today');
  const stats = data?.stats;
  const s = stats?.summary;
  const store = stats?.store;
  const open = store?.state === 'OPEN';

  return (
    <ErpPage>
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        subtitle="What is happening in the salon right now."
        meta={store ? (
          <>
            <span>{store.state === 'NO_DAY' ? 'No business day open' : `Business Day ${store.businessDate}`}</span>
            {open ? <span>Session {store.session?.sessionNumber} · opened {timeLabel(store.session?.openedAt)} by {store.session?.openedBy || '—'}</span> : null}
          </>
        ) : null}
        actions={(
          <>
            <QuickLink href="/admin/billing" icon={Store} label="New bill" />
            <RefreshButton loading={loading} onClick={reload} />
          </>
        )}
      />

      <div className="mb-4"><StoreStatusBar onChanged={reload} role="admin" showManageLink /></div>

      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {loading && !stats ? <LoadingState label="Loading today…" /> : null}

      {stats && s ? (
        <div className="space-y-5">
          <MetricGroup columns={4}>
            <MetricCard label="Net sales" value={money(s.netSalesAfterDiscount)} tone="inflow" emphasis sub={`${count(s.totalBills)} bills · avg ${money(s.avgBillValue)}`} />
            <MetricCard label="Customers" value={count(s.customersServed)} tone="ops" sub={`${count(s.servicesSold)} services · ${count(s.productsSold)} products`} />
            <MetricCard label="Waiting tokens" value={count(s.currentWaitingTokens)} tone={s.currentWaitingTokens ? 'cash' : 'neutral'} sub={`${count(s.tokensGenerated)} issued today`} />
            <MetricCard
              label="Expected cash in drawer"
              value={open ? money(store.session?.expectedCash) : '—'}
              tone="cash"
              sub={open ? `float ${money(store.session?.startingCash)}` : 'Store closed'}
            />
            <MetricCard label="Cash collected" value={money(s.cashReceived)} tone="cash" />
            <MetricCard label="Online collected" value={money(s.qrReceived)} tone="online" />
            <MetricCard label="Expenses" value={money(s.operatingExpenses)} tone="outflow" sub={s.savingsTransfers ? `${money(s.savingsTransfers)} saved` : undefined} />
            <MetricCard label="Discounts" value={money(s.totalDiscounts)} tone="neutral" sub={s.voidCount ? `${s.voidCount} void(s) · ${money(s.voidedSales)}` : undefined} />
          </MetricGroup>

          <div>
            <SectionHeading title="Alerts" />
            <Alerts stats={stats} />
          </div>

          <div className="grid gap-4 xl:grid-cols-5">
            <div className="xl:col-span-2">
              <SectionHeading title="Current queue" action={<Link href="/dashboard/admin/tokens" className="inline-flex items-center gap-1 text-xs font-bold text-teal-700 hover:underline">Tokens <ArrowRight className="h-3.5 w-3.5" /></Link>} />
              {stats.queue.length ? (
                <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
                  {stats.queue.map((token) => (
                    <li key={token.id} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-sm font-extrabold text-teal-800">{token.tokenNumber}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-stone-900">{token.customerName}</p>
                        <p className="truncate text-xs text-stone-500">{[token.serviceName, token.staffName].filter(Boolean).join(' · ') || 'Any service'}</p>
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-stone-500">waiting {waitedMinutes(token.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState title="Nobody is waiting" message="New walk-ins appear here as tokens are issued." />}
            </div>
            <div className="min-w-0 xl:col-span-3">
              <SectionHeading title="Recent bills" action={<Link href="/admin/reports/transactions?period=today" className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 hover:underline">All transactions <ArrowRight className="h-3.5 w-3.5" /></Link>} />
              <FinancialTable
                caption="Recent bills"
                rows={stats.recentTransactions}
                empty="No bills yet today."
                columns={[
                  { key: 'bill_number', label: 'Bill', render: (bill) => <span className="font-semibold text-stone-900">{bill.bill_number}</span> },
                  { key: 'time', label: 'Time', render: (bill) => timeLabel(bill.transaction_date) },
                  { key: 'customer_name', label: 'Customer', render: (bill) => bill.customer_name || 'Walk-in' },
                  { key: 'payment_method', label: 'Paid by', render: (bill) => <span className="capitalize">{bill.payment_method}</span> },
                  { key: 'status', label: 'Status', render: (bill) => <StatusBadge status={String(bill.status).toLowerCase() === 'cancelled' ? 'CANCELLED' : 'PAID'} /> },
                  { key: 'grand_total', label: 'Total', align: 'right', render: (bill) => money(bill.grand_total) },
                ]}
              />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <SectionHeading title="Today's staff activity" />
              <FinancialTable
                caption="Staff activity"
                rows={stats.staffActivity || []}
                rowKey={(row) => row.staffId}
                empty="No services completed yet today."
                columns={[
                  { key: 'staffName', label: 'Staff' },
                  { key: 'role', label: 'Role', render: (row) => <span className="capitalize">{row.role}</span> },
                  { key: 'servicesCompleted', label: 'Services', align: 'right' },
                  { key: 'customersServed', label: 'Customers', align: 'right' },
                  { key: 'revenue', label: 'Revenue', align: 'right', render: (row) => money(row.revenue) },
                ]}
              />
            </div>
            <div>
              <SectionHeading title="Low stock" action={<Link href="/admin/stock" className="inline-flex items-center gap-1 text-xs font-bold text-lime-700 hover:underline">Stock <ArrowRight className="h-3.5 w-3.5" /></Link>} />
              {stats.lowStockItems.length ? (
                <ReportSection
                  lines={stats.lowStockItems.map((item) => ({
                    label: item.name,
                    value: `${count(item.qty)} left`,
                    tone: item.status === 'critical' ? 'outflow' : 'cash',
                  }))}
                />
              ) : <EmptyState icon={AlertTriangle} title="Stock is healthy" message="No product is at or below its low-stock level." />}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-stone-200 pt-4">
            <QuickLink href="/store/opening-closing" icon={Store} label="Opening & Closing" />
            <QuickLink href="/admin/executive-summary" icon={ScrollText} label="Summary report" />
            <QuickLink href="/admin/analytics" icon={ChartColumnBig} label="Analytics" />
          </div>
        </div>
      ) : null}
    </ErpPage>
  );
}
