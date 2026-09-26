'use client';

/**
 * SUMMARY REPORT — "What happened financially during this period?"
 *
 * A narrow, printable report (not a dashboard). Every figure is read from the Summary API
 * (lib/reports/executive-summary.js, built on finance-summary); this component only lays it
 * out. The cashier variant receives a payload WITHOUT payroll, P&L, purchases and staff
 * sections — they are absent from the response, not hidden here.
 */

import { fmtDate, fmtDateTime } from '@/lib/dates/display';
import { ScrollText } from 'lucide-react';
import {
  AlertBanner, BreakdownCard, count, ErpPage, humanize, ErrorState, line, LoadingState, money, PageHeader,
  PeriodFilter, PrintButton, PrintHeader, RefreshButton, ReportGroup, ReportSection,
} from '@/components/erp';
import { usePeriod, useReport } from '@/components/erp/use-report';
import { CashPositionBoard } from '@/components/reports/cash-position-board';

function generatedLabel(iso) {
  if (!iso) return '';
  return fmtDateTime(iso);
}

function MoneyIn({ s }) {
  const { revenue: r, payments: p } = s;
  return (
    <ReportGroup title="Money in" tone="inflow" note="Everything the salon billed and actually received in this period.">
      <div className="grid gap-3 md:grid-cols-2">
        <ReportSection
          title="Salon revenue"
          note="Service and product value, less discounts, plus tax/charges gives the finalized bill total. Voids are deducted on the day they are processed."
          lines={[
            line('Service value', r.serviceRevenue),
            line('Product value', r.productRevenue),
            line('Gross bill value', r.grossSalesBeforeDiscount, { note: 'Before discounts' }),
            line('Discounts', r.totalDiscounts, { sign: '−', tone: 'outflow' }),
            ...(Number(r.loyaltyDiscounts) > 0 ? [line('of which loyalty rewards', r.loyaltyDiscounts, { sign: '−', tone: 'outflow', indent: true, muted: true, note: 'Free / discounted services from loyalty cards — a discount, not a payment.' })] : []),
            r.totalTax ? line('Tax / VAT', r.totalTax, { sign: '+' }) : null,
            r.totalServiceCharge ? line('Service charge', r.totalServiceCharge, { sign: '+' }) : null,
            line('Finalized bill total', r.finalizedBillTotal, { note: `${count(r.bills)} bills` }),
            line(`Voids (${count(r.voidCount)})`, r.voidedSales, { sign: '−', tone: 'outflow', note: 'Bills voided in this period' }),
            line('Net revenue', r.netSales, { strong: true, tone: 'inflow' }),
          ]}
        />
        <ReportSection
          title="Payment received"
          note="Money actually collected. Split bills are already inside cash and online."
          lines={[
            line('Cash received', p.grossCashCollected, { tone: 'cash' }),
            line('Online received', p.grossQrCollected, { tone: 'online' }),
            line('of which split — cash', p.splitCash, { indent: true, muted: true }),
            line('of which split — online', p.splitQr, { indent: true, muted: true }),
            r.creditSales ? line('Sold on customer credit', r.creditSales, { muted: true, note: 'Billed but not yet received' }) : null,
            line('Credit collected — cash', p.creditCollectionsCash, { sign: '+', tone: 'cash', note: 'Payments against earlier credit, not new sales' }),
            line('Credit collected — online', p.creditCollectionsOnline, { sign: '+', tone: 'online' }),
            line('Refunds — cash', p.cashRefunds, { sign: '−', tone: 'outflow' }),
            line('Refunds — online', p.onlineRefunds, { sign: '−', tone: 'outflow' }),
            line('Net received', p.netReceived, { strong: true, tone: 'inflow' }),
          ]}
          footnote={p.backdatedBills ? `${p.backdatedBills} backdated bill(s) — ${money(p.backdatedCollected)} — were collected now but belong to an earlier business day's revenue.` : undefined}
        />
      </div>
    </ReportGroup>
  );
}

function MoneyOut({ s, isAdmin }) {
  const { expenses: e, salary, purchases } = s;
  return (
    <ReportGroup title="Money out" tone="outflow" note="Operating costs and wages paid in this period, by how they were paid.">
      <div className="grid gap-3 md:grid-cols-2">
        <ReportSection
          title="Expenses"
          lines={[
            line('Paid in cash', e.cash, { tone: 'cash' }),
            line('Paid online / bank', e.online, { tone: 'online' }),
            line('Total operating expenses', e.total, { strong: true, tone: 'outflow', note: `${count(e.records)} records` }),
            isAdmin && purchases?.totalPurchase ? line('of which product purchases', purchases.totalPurchase, { indent: true, muted: true, note: 'Already inside the total — not added again' }) : null,
          ]}
        />
        {isAdmin && salary ? (
          <ReportSection
            title="Salary paid"
            note="Cash-basis: wages actually paid out. An advance is salary paid early and is counted once, when issued."
            lines={[
              line('Salary paid', salary.regularSalaryPaid),
              line('Advance salary paid', salary.advancePaid),
              line('Commission paid', salary.commissionPaid),
              line('Paid in cash', salary.totalCash, { tone: 'cash', indent: true }),
              line('Paid online / bank', salary.totalOnline, { tone: 'online', indent: true }),
              line('Total wages paid', salary.totalPaid, { strong: true, tone: 'outflow' }),
            ]}
          />
        ) : (
          <ReportSection
            title="Cash paid out"
            note="All cash that left the drawer for expenses and wages."
            lines={[line('Expenses & wages paid in cash', s.cashPosition.cashPaidOut, { strong: true, tone: 'outflow' })]}
          />
        )}
      </div>
      {isAdmin && e.categories?.length ? (
        <div className="mt-3">
          <BreakdownCard title="Expenses by category" tone="outflow" rows={e.categories.map((row) => ({ label: humanize(row.category), value: row.amount, sub: `${row.records} records · cash ${money(row.cash)} · online ${money(row.online)}` }))} />
        </div>
      ) : null}
    </ReportGroup>
  );
}

function CashPosition({ s, isAdmin }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
      <CashPositionBoard cash={s.cashPosition} online={s.onlinePosition} isAdmin={isAdmin} />
    </div>
  );
}

function Savings({ s }) {
  const v = s.savings;
  return (
    <ReportGroup title="Savings & transfers" tone="ledger" note="Money moved into savings. A transfer between the salon's own accounts — not an operating expense.">
      <div className="grid gap-3 md:grid-cols-2">
        <ReportSection
          lines={[
            line('Cash to savings', v.fromCash, { tone: 'cash' }),
            line('Online to savings', v.fromOnline, { tone: 'online' }),
            line('Total saved', v.total, { strong: true, tone: 'ledger', note: `${count(v.records)} records` }),
          ]}
        />
        <ReportSection
          lines={[
            line('Bank deposits', v.bankDeposits),
            line('Sahakari deposits', v.sahakariDeposits),
            line('Other savings', v.otherSavings),
          ]}
        />
      </div>
    </ReportGroup>
  );
}

function Profitability({ s }) {
  const pl = s.profitLoss;
  if (!pl) return null;
  return (
    <ReportGroup title="Profitability" tone="ledger" note={`${pl.basis} result — ${pl.costNote}`}>
      <div className="grid gap-3 md:grid-cols-2">
        <ReportSection
          title="Profit & loss"
          lines={[
            line('Net revenue', pl.netSales),
            line(pl.costTracked ? 'Product cost (estimated)' : 'Product cost (not recorded)', pl.estimatedProductCost, { sign: '−', tone: 'outflow' }),
            line('Gross profit', pl.grossProfit, { strong: true, note: `${pl.grossMargin}% margin` }),
            line('Operating expenses', pl.operatingExpenses, { sign: '−', tone: 'outflow' }),
            line('Salary expense (paid)', pl.salaryExpense, { sign: '−', tone: 'outflow' }),
            line(`${pl.basis} net profit`, pl.operatingResult, { strong: true, tone: pl.operatingResult < 0 ? 'outflow' : 'inflow', note: `${pl.operatingMargin}% of net revenue` }),
          ]}
          footnote="Service cost is not tracked, so no service cost of goods is deducted. Savings transfers never reduce profit."
        />
        <ReportSection
          title="Sales less spending"
          note="Net revenue minus operating expenses and wages, without product cost."
          lines={[
            line('Net revenue', pl.netSales),
            line('Operating expenses & wages', Number(pl.operatingExpenses) + Number(pl.salaryExpense), { sign: '−', tone: 'outflow' }),
            line('Result', Number(pl.netSales) - Number(pl.operatingExpenses) - Number(pl.salaryExpense), { strong: true }),
            line('Commission accrued on services', pl.commissionAccrued, { muted: true, note: 'Earned by staff; expensed when paid' }),
          ]}
        />
      </div>
    </ReportGroup>
  );
}

function Breakdown({ s, isAdmin }) {
  return (
    <ReportGroup title="Salon breakdown" tone="ops" note="Where sales came from. Category values are line totals before bill-level discounts and voids.">
      <div className="grid gap-3 md:grid-cols-2">
        <BreakdownCard title="Service revenue by category" tone="ops" rows={s.serviceCategories.map((row) => ({ label: row.category, value: row.revenue, sub: `${row.quantity} services · ${row.percentage}%` }))} />
        <BreakdownCard title="Product sales by category" tone="ops" rows={s.productCategories.map((row) => ({ label: row.category, value: row.revenue, sub: `${row.quantity} units · ${row.percentage}%` }))} />
        {isAdmin && s.staffPerformance ? (
          <BreakdownCard
            title="Revenue by stylist"
            tone="hrm"
            note="Service lines assigned to each staff member at billing."
            rows={s.staffPerformance.map((row) => ({ label: row.staffName, value: row.revenue, sub: `${row.servicesCompleted} services · ${row.customersServed} customers` }))}
          />
        ) : null}
      </div>
    </ReportGroup>
  );
}

function Quantities({ s, isAdmin }) {
  const q = s.quantities;
  const t = s.tokens;
  const items = [
    ['Bills', q.bills], ['Customers served', q.uniqueCustomers], ['Services sold', q.servicesSold], ['Products sold', q.productsSold],
    ['Tokens generated', q.tokensGenerated], ['Tokens converted', q.tokenConversions], ['Cancelled tokens', t.cancelled], ['No shows', t.noShow],
    ['Voided bills', s.revenue.voidCount], ['Expense records', q.expenseRecords], ...(isAdmin ? [['Salary records', q.salaryRecords]] : []), ['Savings records', q.savingsRecords],
  ];
  return (
    <ReportGroup title="Quantity & operating summary" tone="neutral">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-stone-200 bg-stone-200 sm:grid-cols-3 lg:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label} className="bg-white px-3 py-2.5">
            <dt className="text-[11px] font-bold uppercase tracking-[0.05em] text-stone-500">{label}</dt>
            <dd className="mt-0.5 text-lg font-extrabold tabular-nums text-stone-900">{count(value)}</dd>
          </div>
        ))}
      </dl>
    </ReportGroup>
  );
}

export default function SummaryReport({ scope = 'admin' }) {
  const isAdmin = scope === 'admin';
  const period = usePeriod('today');
  const url = period.ready ? `/api/${isAdmin ? 'admin' : 'cashier'}/executive-summary?${period.query}` : null;
  const { data, error, loading, reload } = useReport(url, { enabled: period.ready });
  const s = data?.summary;
  const businessDayNote = s?.businessDay?.scoped
    ? `Business Day ${fmtDate(s.businessDay.date)} · ${s.businessDay.sessions} session(s)`
    : s?.period?.displayRange;

  return (
    <ErpPage narrow>
      <PrintHeader
        title="Summary Report"
        period={`${s?.period?.label || ''} · ${s?.period?.displayRange || ''}`}
        generatedAt={generatedLabel(s?.generatedAt)}
        context={s?.businessDay?.scoped ? `Business Day ${fmtDate(s.businessDay.date)} (${s.businessDay.sessions} session(s))` : undefined}
      />
      <PageHeader
        icon={ScrollText}
        iconTone="ledger"
        title="Summary"
        subtitle="What happened financially during this period."
        meta={s ? <><span>{businessDayNote}</span><span>Generated {generatedLabel(s.generatedAt)}</span></> : null}
        actions={<><PrintButton /><RefreshButton loading={loading} onClick={reload} /></>}
      />
      <PeriodFilter {...period.filterProps} className="mb-4" />

      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {!period.ready ? <AlertBanner tone="online" title="Choose a date range">Select a start and end date, then Apply.</AlertBanner> : null}
      {loading && !s ? <LoadingState label="Building the summary…" /> : null}

      {s ? (
        <div className={`space-y-4 ${loading ? 'opacity-60' : ''}`}>
          {s.period?.value === 'today' && s.businessDay?.scoped ? (
            <p className="text-xs text-stone-500">Today follows the open Business Day: every session of the day accumulates here, even across midnight.</p>
          ) : null}
          <MoneyIn s={s} />
          <MoneyOut s={s} isAdmin={isAdmin} />
          <CashPosition s={s} isAdmin={isAdmin} />
          <Savings s={s} />
          {isAdmin ? <Profitability s={s} /> : null}
          <Breakdown s={s} isAdmin={isAdmin} />
          <Quantities s={s} isAdmin={isAdmin} />
        </div>
      ) : null}
    </ErpPage>
  );
}
