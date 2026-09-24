'use client';

/**
 * TODAY DASHBOARD — "What is happening right now?" — one layout for admin and cashier.
 *
 * The page passes normalised data from its own API (/api/admin/dashboard or
 * /api/cashier/dashboard). Both APIs read money from getFinancialSummary and never send
 * payroll to a cashier, so this component shows only what it is given.
 */

import Link from 'next/link';
import { BillLink } from '@/components/bills/bill-detail';
import { AlertTriangle, ArrowRight, CalendarClock, LayoutDashboard, Store } from 'lucide-react';
import StoreStatusBar from '@/components/store/store-status-bar';
import {
  AlertBanner, count, EmptyState, ErpPage, ErrorState, FinancialTable, LoadingState, MetricCard, MetricGroup,
  money, PageHeader, RefreshButton, ReportSection, SectionHeading, StatusBadge,
} from '@/components/erp';

const APPOINTMENT_TONE = {
  PENDING: ['Pending', 'cash'], CONFIRMED: ['Confirmed', 'online'], CHECKED_IN: ['Arrived', 'ledger'], IN_SERVICE: ['In service', 'hrm'],
};

function timeLabel(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-US', { timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit' });
}

function waitedMinutes(value) {
  if (!value) return '';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function QuickLink({ href, icon: Icon, label }) {
  return (
    <Link href={href} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3.5 text-sm font-semibold text-stone-700 hover:bg-stone-50">
      <Icon className="h-4 w-4" aria-hidden="true" /> {label}
    </Link>
  );
}

function Alerts({ data }) {
  const alerts = [];
  const { store, summary, alerts: raw = {} } = data;
  if (store?.state === 'NO_DAY') alerts.push({ tone: 'cash', text: 'No business day is open. Open the store before taking bills.' });
  if (store?.state === 'CLOSED_SAME_DAY') alerts.push({ tone: 'cash', text: 'The store is closed. Reopen it to keep trading today.' });
  if (data.lowRatingReviews) alerts.push({ tone: 'outflow', text: `${data.lowRatingReviews} low-rating review(s) waiting for a look.`, href: '/admin/crm/reviews' });
  if (data.pendingWebsiteRequests) alerts.push({ tone: 'cash', text: `${data.pendingWebsiteRequests} website booking request(s) waiting for confirmation.`, href: '/admin/appointments' });
  if (raw.lowStock?.length) alerts.push({ tone: 'cash', text: `${raw.lowStock.length} product(s) at or below their low-stock level.`, href: '/admin/stock' });
  if (raw.billsMissingStaff) alerts.push({ tone: 'outflow', text: `${raw.billsMissingStaff} bill(s) have a service without an assigned staff member.` });
  if (raw.onlineMissingQr) alerts.push({ tone: 'online', text: `${raw.onlineMissingQr} online payment(s) have no QR type recorded.` });
  if (raw.tokenMismatch) alerts.push({ tone: 'outflow', text: `${raw.tokenMismatch} token(s) marked billed without a matching paid bill.` });
  if (summary?.voidCount) alerts.push({ tone: 'outflow', text: `${summary.voidCount} bill(s) voided today (${money(summary.voidedSales)}).` });
  if (!alerts.length) return <AlertBanner tone="inflow" title="All clear">No operational alerts right now.</AlertBanner>;
  return (
    <div className="space-y-2">
      {alerts.map((alert) => (
        <AlertBanner key={alert.text} tone={alert.tone} action={alert.href ? <Link href={alert.href} className="text-xs font-bold text-stone-700 hover:underline">Open</Link> : null}>
          {alert.text}
        </AlertBanner>
      ))}
    </div>
  );
}

/**
 * data: { store, summary, queue, upcomingAppointments, pendingWebsiteRequests, recentBills,
 *         staffActivity, lowStock: [{ name, qty, critical }], alerts }
 */
export default function TodayDashboard({ data, error, loading, reload, role, tokensHref, shortcuts }) {
  const s = data?.summary;
  const store = data?.store;
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

      <div className="mb-4"><StoreStatusBar onChanged={reload} role={role} showManageLink={role === 'admin'} /></div>

      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {loading && !data ? <LoadingState label="Loading today…" /> : null}

      {data && s ? (
        <div className="space-y-5">
          <MetricGroup columns={4}>
            <MetricCard label="Net sales" value={money(s.netSalesAfterDiscount)} tone="inflow" emphasis sub={`${count(s.totalBills)} bills · avg ${money(s.avgBillValue)}`} />
            <MetricCard label="Customers" value={count(s.customersServed)} tone="ops" sub={`${count(s.servicesSold)} services · ${count(s.productsSold)} products`} />
            <MetricCard label="Waiting tokens" value={count(s.currentWaitingTokens)} tone={s.currentWaitingTokens ? 'cash' : 'neutral'} sub={`${count(s.tokensGenerated)} issued today`} />
            <MetricCard label="Expected cash in drawer" value={open ? money(store.session?.expectedCash) : '—'} tone="cash" sub={open ? `float ${money(store.session?.startingCash)}` : 'Store closed'} />
            <MetricCard label="Cash collected" value={money(s.cashReceived)} tone="cash" />
            <MetricCard label="Online collected" value={money(s.qrReceived)} tone="online" />
            <MetricCard label="Expenses" value={money(s.operatingExpenses)} tone="outflow" sub={s.savingsTransfers ? `${money(s.savingsTransfers)} saved` : undefined} />
            <MetricCard label="Appointments today" value={count(data.upcomingAppointments?.length || 0)} tone="outflow" sub="still to come / in the salon" />
          </MetricGroup>

          <div>
            <SectionHeading title="Alerts" />
            <Alerts data={data} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="min-w-0">
              <SectionHeading title="Current queue" action={<Link href={tokensHref} className="inline-flex items-center gap-1 text-xs font-bold text-teal-700 hover:underline">Tokens <ArrowRight className="h-3.5 w-3.5" /></Link>} />
              {data.queue?.length ? (
                <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
                  {data.queue.map((token) => (
                    <li key={token.id} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 px-1 text-xs font-extrabold text-teal-800">{token.tokenNumber}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-stone-900">{token.customerName}</p>
                        <p className="truncate text-xs text-stone-500">{[token.serviceName, token.staffName].filter(Boolean).join(' · ') || 'Any service'}</p>
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-stone-500">{waitedMinutes(token.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState title="Nobody is waiting" message="New walk-ins appear here as tokens are issued." />}
            </div>
            <div className="min-w-0">
              <SectionHeading title="Today's appointments" action={<Link href="/admin/appointments" className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 hover:underline">Calendar <ArrowRight className="h-3.5 w-3.5" /></Link>} />
              {data.upcomingAppointments?.length ? (
                <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
                  {data.upcomingAppointments.map((item) => (
                    <li key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="w-12 shrink-0 text-sm font-extrabold tabular-nums text-stone-900">{item.startTime}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-stone-900">{item.customerName}</p>
                        <p className="truncate text-xs text-stone-500">{[item.services, item.staffName].filter(Boolean).join(' · ')}</p>
                      </div>
                      <StatusBadge status={item.status} label={APPOINTMENT_TONE[item.status]?.[0]} tone={APPOINTMENT_TONE[item.status]?.[1]} />
                    </li>
                  ))}
                </ul>
              ) : <EmptyState icon={CalendarClock} title="No more appointments today" message="Bookings for today appear here." />}
            </div>
          </div>

          <div className="min-w-0">
            <SectionHeading title="Recent bills" />
            <FinancialTable
              caption="Recent bills"
              rows={data.recentBills || []}
              empty="No bills yet today."
              columns={[
                { key: 'bill_number', label: 'Bill', render: (bill) => <BillLink billId={bill.id} number={bill.bill_number} /> },
                { key: 'time', label: 'Time', render: (bill) => timeLabel(bill.transaction_date) },
                { key: 'customer_name', label: 'Customer', render: (bill) => bill.customer_name || 'Walk-in' },
                { key: 'payment_method', label: 'Paid by', render: (bill) => <span className="capitalize">{bill.payment_method}</span> },
                { key: 'status', label: 'Status', render: (bill) => <StatusBadge status={String(bill.status).toLowerCase() === 'cancelled' ? 'CANCELLED' : 'PAID'} /> },
                { key: 'grand_total', label: 'Total', align: 'right', render: (bill) => money(bill.grand_total) },
              ]}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="min-w-0">
              <SectionHeading title="Today's staff activity" />
              <FinancialTable
                caption="Staff activity"
                rows={data.staffActivity || []}
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
            <div className="min-w-0">
              <SectionHeading title="Low stock" action={<Link href="/admin/stock" className="inline-flex items-center gap-1 text-xs font-bold text-lime-700 hover:underline">Stock <ArrowRight className="h-3.5 w-3.5" /></Link>} />
              {data.lowStock?.length ? (
                <ReportSection lines={data.lowStock.map((item) => ({ label: item.name, value: `${count(item.qty)} left`, tone: item.critical ? 'outflow' : 'cash' }))} />
              ) : <EmptyState icon={AlertTriangle} title="Stock is healthy" message="No product is at or below its low-stock level." />}
            </div>
          </div>

          {shortcuts?.length ? (
            <div className="flex flex-wrap gap-2 border-t border-stone-200 pt-4">
              {shortcuts.map((shortcut) => <QuickLink key={shortcut.href} {...shortcut} />)}
            </div>
          ) : null}
        </div>
      ) : null}
    </ErpPage>
  );
}
