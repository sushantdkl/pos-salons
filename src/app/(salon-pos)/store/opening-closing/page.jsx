'use client';

/**
 * OPENING & CLOSING — Business Day status, day summary, cash reconciliation, online position
 * and Business Day history.
 *
 * Every figure comes from the server:
 *   - status / lifecycle ........ /api/store (StoreStatusBar is the only Open/Reopen/Next-Day control)
 *   - live drawer + close ....... /api/store/summary -> CloseStoreForm (the only close flow)
 *   - business-day summary ...... the Summary API scoped to today's Business Day
 *   - history ................... /api/store/history (admin) — persisted close snapshots
 * Admin and cashier share this page; cashier payloads never contain salary figures.
 */

import { fmtDate, fmtDateTime } from '@/lib/dates/display';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, DoorOpen, Landmark } from 'lucide-react';
import StoreStatusBar from '@/components/store/store-status-bar';
import CloseStoreForm from '@/components/store/close-store-form';
import BusinessDayHistory from '@/components/store/business-day-history';
import {
  AlertBanner, count, EmptyState, ErpPage, ErrorState, line, LoadingState, MetricCard,
  MetricGroup, money, PageHeader, PrintButton, PrintHeader, RefreshButton, ReportGroup, ReportSection,
  SectionHeading, StatusBadge,
} from '@/components/erp';
import { erpFetch } from '@/components/erp/use-report';

function formatDate(iso) {
  if (!iso) return '—';
  return fmtDate(String(iso).slice(0, 10));
}

function formatTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-US', { timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit' });
}


/* ------------------------------------------------ Section A — status header */

function Fact({ label, value, strong = false }) {
  return (
    <div className="min-w-0">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-stone-400">{label}</p>
      <p className={`mt-0.5 truncate text-[14px] ${strong ? 'font-extrabold tabular-nums text-stone-900' : 'font-semibold text-stone-700'}`}>{value}</p>
    </div>
  );
}

function BusinessDayStatus({ status }) {
  if (!status) return null;
  const open = status.state === 'OPEN';
  const session = status.session;
  const previous = status.previousSession;
  return (
    <section aria-label="Business day status" className="break-inside-avoid overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <div className={`flex flex-wrap items-center gap-2 px-4 py-2.5 ${open ? 'bg-emerald-50' : 'bg-stone-50'}`}>
        <StatusBadge status={open ? 'OPEN' : status.state === 'CLOSED_SAME_DAY' ? 'CLOSED_SAME_DAY' : 'NO_DAY'} label={open ? 'Store open' : status.state === 'CLOSED_SAME_DAY' ? 'Store closed · business day open' : 'No business day open'} />
        <span className="text-xs text-stone-500">
          {status.state === 'NO_DAY'
            ? 'Open the store to start the next business day.'
            : `Business Day ${formatDate(status.businessDate)} · ${status.sessionCount ?? 0} session${Number(status.sessionCount) === 1 ? '' : 's'}`}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 sm:grid-cols-4 lg:grid-cols-7">
        <Fact label="Business day" value={formatDate(status.businessDate)} />
        <Fact label="Store status" value={open ? 'Open' : 'Closed'} />
        <Fact label="Session" value={open ? `Session ${session?.sessionNumber || 1}` : previous ? `Last: ${previous.sessionNumber}` : '—'} />
        <Fact label="Opened at" value={open ? formatTime(session?.openedAt) : '—'} />
        <Fact label="Opened by" value={open ? session?.openedBy || '—' : '—'} />
        <Fact label="Starting cash" value={open ? money(session?.startingCash) : money(status.suggestedStartingCash ?? status.previousClosingCash)} strong />
        <Fact label="Expected cash" value={open ? money(session?.expectedCash) : previous ? money(previous.countedCash) : '—'} strong />
      </div>
      {previous ? (
        <p className="border-t border-stone-100 px-4 py-2 text-xs text-stone-500">
          Previous session: Session {previous.sessionNumber} closed {formatTime(previous.closedAt)}
          {previous.closedBy ? ` by ${previous.closedBy}` : ''} with {money(previous.countedCash)} counted.
          {open ? ' Its closing snapshot stays unchanged; this session reconciles on its own.' : ''}
        </p>
      ) : null}
    </section>
  );
}

/* ---------------------------------------- Section B — business day summary */

function DaySummary({ report, isAdmin }) {
  if (!report) return null;
  const { revenue, payments, expenses, savings, quantities, tokens, cashPosition } = report;
  const cashOutflow = isAdmin ? report.salary?.totalCash : null;
  return (
    <div className="space-y-3">
      <MetricGroup columns={4}>
        <MetricCard label="Gross sales" value={money(revenue.grossSalesBeforeDiscount)} tone="ops" sub={`${count(revenue.bills)} bills`} />
        <MetricCard label="Net sales" value={money(revenue.netSales)} tone="inflow" emphasis sub={`after ${money(revenue.totalDiscounts)} discounts${revenue.voidedSales ? ` and ${money(revenue.voidedSales)} voids` : ''}`} />
        <MetricCard label="Cash collected" value={money(payments.grossCashCollected)} tone="cash" sub={payments.creditCollectionsCash ? `+ ${money(payments.creditCollectionsCash)} credit collected` : 'bill cash'} />
        <MetricCard label="Online collected" value={money(payments.grossQrCollected)} tone="online" sub={payments.creditCollectionsOnline ? `+ ${money(payments.creditCollectionsOnline)} credit collected` : 'QR / bank'} />
      </MetricGroup>
      <div className="grid gap-3 lg:grid-cols-3">
        <ReportSection
          title="Sales"
          lines={[
            line('Gross sales', revenue.grossSalesBeforeDiscount),
            line('Discounts', revenue.totalDiscounts, { sign: '−', tone: 'outflow' }),
            revenue.voidedSales ? line(`Voids processed (${revenue.voidCount})`, revenue.voidedSales, { sign: '−', tone: 'outflow' }) : null,
            revenue.creditSales ? line('Sold on customer credit', revenue.creditSales, { muted: true, note: 'Included in sales; not yet received' }) : null,
            line('Net sales', revenue.netSales, { strong: true, tone: 'inflow' }),
          ]}
        />
        <ReportSection
          title="Money out"
          lines={[
            line('Refunds', Number(payments.cashRefunds || 0) + Number(payments.onlineRefunds || 0), { sign: '−', tone: 'outflow' }),
            line('Operating expenses', expenses.total, { sign: '−', tone: 'outflow' }),
            isAdmin ? line('Salary / advances paid', report.salary?.totalPaid, { sign: '−', tone: 'outflow', note: cashOutflow ? `${money(cashOutflow)} paid from the drawer` : undefined }) : null,
            line('Savings / transfers', savings.total, { note: 'Money moved to savings — not an expense' }),
            line('Cash paid out (all)', cashPosition.cashOut, { strong: true, note: 'Refunds, expenses, salary and savings paid in cash' }),
          ]}
        />
        <ReportSection
          title="Activity"
          lines={[
            line('Bills', count(quantities.bills)),
            line('Customers', count(quantities.uniqueCustomers)),
            line('Services sold', count(quantities.servicesSold)),
            line('Products sold', count(quantities.productsSold)),
            line('Tokens generated', count(tokens.generated)),
            line('Tokens converted to bills', count(tokens.converted)),
          ]}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------- Section D — online / bank position */

function OnlinePosition({ online, isAdmin }) {
  if (!online) return null;
  return (
    <ReportSection
      title="Online / bank position — this session"
      note="QR, eSewa, PhonePay and bank money. It is never physical cash and never changes Expected Cash."
      lines={[
        line('Online sales', online.onlineSales, { sign: '+', tone: 'online' }),
        line('Credit collected online', online.creditCollectionsOnline, { sign: '+', tone: 'online' }),
        line('Online refunds', online.onlineRefunds, { sign: '−', tone: 'outflow' }),
        isAdmin
          ? line('Online expenses', online.onlineExpenses, { sign: '−', tone: 'outflow' })
          : line('Online expenses & salary', online.onlinePaidOut, { sign: '−', tone: 'outflow' }),
        isAdmin ? line('Online salary / advances', online.salaryOnline, { sign: '−', tone: 'outflow' }) : null,
        line('Online to savings / transfers', online.onlineSavings, { sign: '−' }),
        line('Net online movement', online.netOnlineMovement, { strong: true, tone: 'online' }),
      ]}
    />
  );
}

/* ------------------------------------------------------------------ page */

export default function OpeningClosingPage() {
  const [status, setStatus] = useState(null);
  const [session, setSession] = useState(null);
  const [report, setReport] = useState(null);
  const [days, setDays] = useState([]);
  const [role, setRole] = useState('cashier');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusKey, setStatusKey] = useState(0);
  const isAdmin = role === 'admin';

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    let currentRole = 'cashier';
    try {
      const user = JSON.parse(localStorage.getItem('pos_user') || '{}');
      currentRole = String(user.role || '').toLowerCase() === 'admin' ? 'admin' : 'cashier';
    } catch { /* default cashier */ }
    setRole(currentRole);
    try {
      const [sessionPayload, reportPayload, historyPayload] = await Promise.all([
        // The close preview only exists while a session is open; a 409 is expected otherwise.
        erpFetch('/api/store/summary').catch((fetchError) => (fetchError.status === 409 ? null : Promise.reject(fetchError))),
        erpFetch(`/api/${currentRole === 'admin' ? 'admin' : 'cashier'}/executive-summary?period=today`),
        currentRole === 'admin' ? erpFetch('/api/store/history?limit=30') : Promise.resolve(null),
      ]);
      setSession(sessionPayload?.open ? sessionPayload : null);
      setReport(reportPayload?.summary || null);
      if (historyPayload) setDays(historyPayload.days || []);
    } catch (loadError) {
      setError(loadError.message || 'Could not load the store session details.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const afterLifecycleChange = () => {
    setStatusKey((key) => key + 1);
    loadAll();
  };

  const generatedAt = report?.generatedAt ? fmtDateTime(report.generatedAt) : '';

  return (
    <ErpPage>
      <PrintHeader title="Opening & Closing" period={formatDate(status?.businessDate)} generatedAt={generatedAt} context="Business Day reconciliation" />
      <PageHeader
        icon={DoorOpen}
        iconTone="cash"
        title="Opening & Closing"
        subtitle="Business Day status, the live cash drawer, and the history of every close."
        actions={<><PrintButton /><RefreshButton loading={loading} onClick={afterLifecycleChange} /></>}
      />

      <div className="space-y-4">
        {error ? <ErrorState message={error} onRetry={loadAll} /> : null}

        <BusinessDayStatus status={status} />

        {/* The one lifecycle control: Open / Reopen / Start Next Business Day. Close lives in Section C. */}
        <StoreStatusBar
          key={statusKey}
          variant="actions"
          role={role}
          showOpeningClosingLink={false}
          showManageLink={false}
          showClose={false}
          onStatus={setStatus}
          onChanged={loadAll}
        />

        {loading && !report ? <LoadingState label="Loading the business day…" /> : null}

        {report ? (
          <ReportGroup title="Business day summary" tone="ops" note={`All sessions of ${formatDate(report.businessDay?.date || status?.businessDate)} so far — the same figures as Summary and Dashboard.`}>
            <DaySummary report={report} isAdmin={isAdmin} />
          </ReportGroup>
        ) : null}

        <SectionHeading
          title="Cash reconciliation"
          note="Physical drawer cash for the current store session. Count the notes; the difference is worked out for you."
        />
        {session ? (
          <CloseStoreForm
            key={session.sessionNumber}
            summary={session.summary}
            blockers={session.blockers}
            role={role}
            sessionLabel={`Store session ${session.sessionNumber} of ${status?.sessionCount || session.sessionNumber}`}
            onClosed={afterLifecycleChange}
          />
        ) : !loading ? (
          status?.previousSession ? (
            <AlertBanner tone="neutral" title={`Last close: Session ${status.previousSession.sessionNumber} · ${money(status.previousSession.countedCash)} counted`}>
              The store is closed. Reopen it (same business day) or start the next business day to trade again. Closed sessions keep their
              reconciliation snapshot — it is never recalculated.
            </AlertBanner>
          ) : (
            <EmptyState title="The store is not open" message="Open the store to start a business day and see the live cash drawer." icon={DoorOpen} />
          )
        ) : null}

        {session ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <OnlinePosition online={session.summary.online} isAdmin={isAdmin} />
            <ReportSection
              title="Cash ledger vs. drawer"
              note="Why these two numbers can differ."
              lines={[
                line('Expected cash in drawer (this session)', session.summary.expected.expectedCash, { tone: 'cash' }),
                line('Net cash movement (whole business day)', report?.cashPosition?.netCashMovement, { note: 'Cash in less cash out across every session, incl. opening adjustments; excludes the float' }),
              ]}
              footnote="Expected drawer cash answers “what should be in the till now”. Net cash movement answers “how much cash did today’s trading add”. A reopen, a float adjustment or an earlier shortage makes them differ — neither is wrong."
            />
          </div>
        ) : null}

        {isAdmin ? (
          <>
            <SectionHeading
              title="Business day history"
              note="Expected and counted cash are the final session's persisted close — never a sum of sessions. Differences add up because each shortage is its own event."
              action={<Link href="/dashboard/admin/business-days" className="print-hide inline-flex items-center gap-1 text-xs font-bold text-indigo-700 hover:underline"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> Full history</Link>}
            />
            <BusinessDayHistory days={days} />
          </>
        ) : null}

        <p className="flex items-start gap-2 pb-2 text-xs text-stone-500">
          <Landmark className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          One business day may hold several store sessions. Reopening on the same day continues the same business day; only Start Next
          Business Day begins a new operational day. Nothing is ever deleted.
        </p>
      </div>
    </ErpPage>
  );
}
