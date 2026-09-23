'use client';

/**
 * SALON ANALYTICS — "What is driving the salon?"
 * Everything is aggregated server-side by /api/admin/analytics (lib/reports/analytics.js,
 * which reuses the Summary's shared money services). Charts only display those rows.
 */

import { useState } from 'react';
import { ChartColumnBig } from 'lucide-react';
import {
  AlertBanner, BreakdownCard, ChartCard, count, EmptyState, ErpPage, ErrorState, FinancialTable, line,
  LoadingState, MetricCard, MetricGroup, money, PageHeader, percent, PeriodFilter, RefreshButton,
  ReportSection, TONES,
} from '@/components/erp';
import { DonutChart, GroupedBarChart, HorizontalBarChart, TrendChart } from '@/components/erp/charts';
import { usePeriod, useReport } from '@/components/erp/use-report';

const TABS = [
  ['overview', 'Overview'],
  ['money', 'Sales & Money'],
  ['services', 'Services'],
  ['customers', 'Customers'],
  ['staff', 'Staff'],
  ['products', 'Products & Inventory'],
  ['frontdesk', 'Tokens / Front Desk'],
  ['controls', 'Controls & Activity'],
];

const countFormat = (value) => count(value);

function updatedLabel(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', { timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit' });
}

/* ------------------------------------------------------------------- tabs */

function Overview({ a }) {
  const trendNote = a.period?.value === 'today' ? 'Net sales by hour of the Business Day (voids applied when processed).' : 'Net sales per day (voids applied on the day processed).';
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <ChartCard title="Sales trend" note={trendNote} height={280}>
          <TrendChart rows={a.salesTrend} series={[{ key: 'netSales', label: 'Net sales', color: TONES.inflow.hex }]} />
        </ChartCard>
      </div>
      <ChartCard title="Payment breakdown" note="Money received by method." height={240}>
        <DonutChart
          centerLabel="Received"
          rows={[
            { label: 'Cash', value: a.payments.cash, color: TONES.cash.hex },
            { label: 'Online / QR', value: a.payments.online, color: TONES.online.hex },
            { label: 'Customer credit (billed)', value: a.payments.credit, color: TONES.ledger.hex },
          ]}
        />
      </ChartCard>
      <ChartCard title="Customer mix" note="Identified customers: first visit ever vs. returning. Walk-ins without a saved customer are shown separately." height={240}>
        <DonutChart
          format={countFormat}
          centerLabel="Customers"
          rows={[
            { label: 'New', value: a.customers.newCustomers, color: TONES.ops.hex },
            { label: 'Returning', value: a.customers.returningCustomers, color: TONES.ledger.hex },
            { label: 'Walk-in bills (not saved)', value: a.customers.walkInBills, color: TONES.neutral.hex },
          ]}
        />
      </ChartCard>
      <ChartCard title="Service revenue by category" height={240}>
        <HorizontalBarChart rows={a.services.categories.map((row) => ({ label: row.category, value: row.revenue }))} color={TONES.ops.hex} name="Revenue" />
      </ChartCard>
      <ChartCard title="Top services" note="By revenue." height={240}>
        <HorizontalBarChart rows={a.services.byRevenue.slice(0, 6).map((row) => ({ label: row.name, value: row.revenue }))} color={TONES.ledger.hex} name="Revenue" />
      </ChartCard>
      <ChartCard title="Product sales by category" height={220}>
        <HorizontalBarChart rows={a.products.categories.map((row) => ({ label: row.category, value: row.revenue }))} color={TONES.online.hex} name="Revenue" />
      </ChartCard>
      <ChartCard title="Expenses by category" note="Operating expenses only — salary and savings excluded." height={220}>
        <HorizontalBarChart rows={a.expenses.categories.map((row) => ({ label: row.category, value: row.amount }))} color={TONES.outflow.hex} name="Expense" />
      </ChartCard>
      <div className="lg:col-span-2">
        <ChartCard title="Token performance" height={200}>
          <GroupedBarChart
            format={countFormat}
            axisFormat={countFormat}
            rows={[{ label: 'Tokens', generated: a.tokens.generated, converted: a.tokens.converted, cancelled: a.tokens.cancelled, noShow: a.tokens.noShow }]}
            series={[
              { key: 'generated', label: 'Generated', color: TONES.neutral.hex },
              { key: 'converted', label: 'Converted', color: TONES.inflow.hex },
              { key: 'cancelled', label: 'Cancelled', color: TONES.outflow.hex },
              { key: 'noShow', label: 'No show', color: TONES.cash.hex },
            ]}
          />
        </ChartCard>
      </div>
    </div>
  );
}

function SalesMoney({ a }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <ChartCard title="Cash vs online collected" note="Collections by the day (or hour) they were received." height={280}>
          <GroupedBarChart
            stacked
            xKey="label"
            rows={a.salesTrend}
            series={[{ key: 'cashCollected', label: 'Cash', color: TONES.cash.hex }, { key: 'qrCollected', label: 'Online', color: TONES.online.hex }]}
          />
        </ChartCard>
      </div>
      <ReportSection
        title="Sales"
        lines={[
          line('Gross sales', a.kpis.grossSales),
          line('Discounts', a.kpis.discounts, { sign: '−', tone: 'outflow' }),
          line('Voids processed', a.kpis.voids, { sign: '−', tone: 'outflow' }),
          line('Net sales', a.kpis.netSales, { strong: true, tone: 'inflow' }),
          line('Average bill', a.kpis.averageBill, { muted: true }),
        ]}
      />
      <ReportSection
        title="Collections"
        lines={[
          line('Cash sales', a.payments.cash, { tone: 'cash' }),
          line('Online sales', a.payments.online, { tone: 'online' }),
          line('of which split — cash', a.payments.splitCash, { indent: true, muted: true }),
          line('of which split — online', a.payments.splitOnline, { indent: true, muted: true }),
          line('Billed on credit', a.payments.credit, { muted: true, note: 'Not yet received' }),
          line('Credit collected', a.payments.creditCollected, { tone: 'inflow' }),
          line('Net cash collection', a.payments.netCash, { strong: true, tone: 'cash', note: 'Cash sales + credit collected in cash − cash refunds' }),
          line('Net online collection', a.payments.netOnline, { strong: true, tone: 'online' }),
        ]}
      />
    </div>
  );
}

function Services({ a }) {
  const s = a.services;
  return (
    <div className="space-y-3">
      <MetricGroup columns={4}>
        <MetricCard label="Services sold" value={count(s.servicesSold)} tone="ops" />
        <MetricCard label="Service revenue" value={money(s.serviceRevenue)} tone="ops" />
        <MetricCard label="Average service value" value={money(s.averageServiceValue)} tone="neutral" />
        <MetricCard label="Service / product split" value={`${percent(s.serviceShare, 0)} / ${percent(s.productShare, 0)}`} tone="neutral" hint="Share of line-item value before bill discounts." />
      </MetricGroup>
      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="Top services by revenue" height={300}>
          <HorizontalBarChart rows={s.byRevenue.map((row) => ({ label: row.name, value: row.revenue }))} color={TONES.ops.hex} name="Revenue" />
        </ChartCard>
        <ChartCard title="Top services by quantity" height={300}>
          <HorizontalBarChart rows={s.byQuantity.map((row) => ({ label: row.name, value: row.quantity }))} format={countFormat} axisFormat={countFormat} color={TONES.ledger.hex} name="Services" />
        </ChartCard>
      </div>
      <BreakdownCard title="Service category mix" tone="ops" rows={s.categories.map((row) => ({ label: row.category, value: row.revenue, sub: `${row.quantity} services · ${row.percentage}% of service revenue` }))} />
      <FinancialTable
        caption="Services"
        rows={s.byRevenue}
        columns={[
          { key: 'name', label: 'Service' },
          { key: 'category', label: 'Category' },
          { key: 'quantity', label: 'Qty', align: 'right' },
          { key: 'averageValue', label: 'Avg value', align: 'right', render: (row) => money(row.averageValue) },
          { key: 'revenue', label: 'Revenue', align: 'right', render: (row) => money(row.revenue) },
        ]}
      />
    </div>
  );
}

function Customers({ a }) {
  const c = a.customers;
  return (
    <div className="space-y-3">
      <MetricGroup columns={4}>
        <MetricCard label="Customers served" value={count(c.customersServed)} tone="ops" sub={`${count(c.identifiedCustomers)} saved · ${count(c.walkInBills)} walk-in bills`} />
        <MetricCard label="New customers" value={count(c.newCustomers)} tone="inflow" hint="First ever paid visit is in this period." />
        <MetricCard label="Returning customers" value={count(c.returningCustomers)} tone="ledger" sub={`${percent(c.returningShare)} of saved customers`} />
        <MetricCard label="Average spend per bill" value={money(c.averageSpendPerBill)} tone="neutral" />
      </MetricGroup>
      <MetricGroup columns={2}>
        <MetricCard label="Repeat within period" value={percent(c.repeatWithinPeriodRate)} tone="neutral" hint="Saved customers with 2+ bills inside this period. Not a retention rate." />
        <MetricCard label="Visits per saved customer" value={c.visitsPerCustomer.toFixed(2)} tone="neutral" hint="Bills ÷ saved customers in this period." />
      </MetricGroup>
      {c.trend.length ? (
        <ChartCard title="Customers per day" height={240}>
          <TrendChart rows={c.trend} format={countFormat} axisFormat={countFormat} series={[{ key: 'customers', label: 'Customers', color: TONES.ops.hex }]} />
        </ChartCard>
      ) : <AlertBanner tone="online">Choose a multi-day period to see the customer trend.</AlertBanner>}
      <FinancialTable
        caption="Top customers by spend"
        rows={c.topCustomers}
        empty="No saved customers billed in this period."
        columns={[
          { key: 'name', label: 'Top customers by spend' },
          { key: 'bills', label: 'Bills', align: 'right' },
          { key: 'spend', label: 'Spend', align: 'right', render: (row) => money(row.spend) },
        ]}
      />
    </div>
  );
}

function Staff({ a }) {
  if (!a.staff.length) return <EmptyState title="No attributed services" message="No service lines with an assigned staff member in this period." />;
  return (
    <div className="space-y-3">
      <AlertBanner tone="online" title="Read with context">
        Revenue is the value of service lines assigned to each person at billing. Shift length, service mix and assisting
        work are not captured, so this is not a ranking of who is the best employee.
      </AlertBanner>
      <ChartCard title="Service revenue by staff" height={Math.max(200, a.staff.length * 34)}>
        <HorizontalBarChart rows={a.staff.map((row) => ({ label: row.staffName, value: row.revenue }))} color={TONES.hrm.hex} name="Revenue" />
      </ChartCard>
      <FinancialTable
        caption="Staff performance"
        rows={a.staff}
        rowKey={(row) => row.staffId}
        columns={[
          { key: 'staffName', label: 'Staff' },
          { key: 'role', label: 'Role', render: (row) => <span className="capitalize">{row.role}</span> },
          { key: 'servicesCompleted', label: 'Services', align: 'right' },
          { key: 'customersServed', label: 'Customers', align: 'right' },
          { key: 'bills', label: 'Bills', align: 'right' },
          { key: 'averageTicket', label: 'Avg ticket', align: 'right', render: (row) => money(row.averageTicket) },
          { key: 'revenue', label: 'Revenue', align: 'right', render: (row) => money(row.revenue) },
          { key: 'commission', label: 'Commission accrued', align: 'right', render: (row) => money(row.commission) },
        ]}
      />
    </div>
  );
}

function Products({ a }) {
  const p = a.products;
  return (
    <div className="space-y-3">
      <MetricGroup columns={4}>
        <MetricCard label="Products sold" value={count(p.productsSold)} tone="online" />
        <MetricCard label="Product revenue" value={money(p.productRevenue)} tone="online" />
        <MetricCard label="Low stock" value={count(p.lowStockCount)} tone={p.lowStockCount ? 'cash' : 'neutral'} sub={`${count(p.outOfStockCount)} out of stock`} />
        <MetricCard
          label="Stock value (cost)"
          value={money(p.stockValue)}
          tone="neutral"
          hint={p.stockValueComplete ? 'Current stock × purchase price.' : `${p.uncostedInStock} in-stock product(s) have no purchase price — value is incomplete.`}
        />
      </MetricGroup>
      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="Top products" note="By revenue." height={260}>
          <HorizontalBarChart rows={p.topProducts.map((row) => ({ label: row.name, value: row.revenue }))} color={TONES.online.hex} name="Revenue" />
        </ChartCard>
        <ReportSection
          title="Stock movement & purchases"
          note="Movement counts use calendar dates. Purchase value is money paid under the Product Purchase expense category."
          lines={[
            ...p.movements.map((row) => line(row.type.replace('_', ' '), `${count(row.units)} units · ${count(row.records)} entries`)),
            line('Units restocked', count(p.unitsRestocked)),
            line('Purchase value paid', p.purchaseValue, { strong: true, tone: 'outflow' }),
          ]}
        />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <FinancialTable
          caption="Low stock"
          rows={p.lowStock}
          empty="No product is at or below its low-stock level."
          columns={[
            { key: 'name', label: 'Low stock' },
            { key: 'currentStock', label: 'In stock', align: 'right' },
            { key: 'threshold', label: 'Alert at', align: 'right' },
          ]}
        />
        {p.slowMoving ? (
          <FinancialTable
            caption="Slow-moving products"
            rows={p.slowMoving}
            empty="Every product in stock sold in the last 30 days."
            columns={[
              { key: 'name', label: 'No sale in 30 days' },
              { key: 'currentStock', label: 'In stock', align: 'right' },
            ]}
          />
        ) : <AlertBanner tone="online">Slow-moving products appear once there are 30 days of sales history.</AlertBanner>}
      </div>
    </div>
  );
}

function FrontDesk({ a }) {
  const t = a.tokens;
  return (
    <div className="space-y-3">
      <MetricGroup columns={5}>
        <MetricCard label="Tokens generated" value={count(t.generated)} tone="ops" />
        <MetricCard label="Converted to bills" value={count(t.converted)} tone="inflow" />
        <MetricCard label="Conversion rate" value={percent(t.conversionRate)} tone="neutral" />
        <MetricCard label="Cancelled · no show" value={`${count(t.cancelled)} · ${count(t.noShow)}`} tone={t.cancelled + t.noShow ? 'outflow' : 'neutral'} />
        <MetricCard label="Waiting now" value={count(t.waitingNow)} tone="cash" />
      </MetricGroup>
      <ChartCard title="Hourly demand" note="Tokens issued by hour of day (Nepal time)." height={260}>
        <GroupedBarChart
          format={countFormat}
          axisFormat={countFormat}
          rows={t.byHour}
          series={[{ key: 'tokens', label: 'Tokens', color: TONES.ops.hex }, { key: 'converted', label: 'Converted', color: TONES.inflow.hex }]}
        />
      </ChartCard>
      <ReportSection lines={[line('Bills from tokens', count(t.tokenBills)), line('Direct bills (no token)', count(t.directBills))]} />
    </div>
  );
}

function Controls({ a }) {
  const c = a.controls;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <ReportSection
        title="Sales exceptions"
        lines={[
          line('Voided bills', `${count(c.voids)} · ${money(c.voidedAmount)}`, { tone: c.voids ? 'outflow' : undefined }),
          line('Bills with a discount', `${count(c.discountedBills)} (${percent(c.discountedShare)})`),
          line('Discount given', c.discountTotal, { note: `${percent(c.discountRate)} of gross sales` }),
          line('Backdated bills', count(c.backdatedBills)),
          line('Cancelled tokens', count(c.cancelledTokens)),
        ]}
      />
      <ReportSection
        title="Cash control"
        lines={[
          line('Store sessions', count(c.sessions)),
          line('Same-day reopens', count(c.reopenedSessions)),
          line('Cash shortages', `${count(c.shortages)} · ${money(c.shortageTotal)}`, { tone: c.shortages ? 'outflow' : undefined }),
          line('Cash overages', `${count(c.overages)} · ${money(c.overageTotal)}`, { tone: c.overages ? 'cash' : undefined }),
          line('Force-closed sessions', count(c.forceClosed), { tone: c.forceClosed ? 'outflow' : undefined }),
          line('Manual cash in (float added)', c.cashAdded),
          line('Manual cash out (float removed)', c.cashRemoved),
        ]}
      />
    </div>
  );
}

/* ------------------------------------------------------------------- page */

export default function AnalyticsPage() {
  const period = usePeriod('today');
  const [tab, setTab] = useState('overview');
  const url = period.ready ? `/api/admin/analytics?${period.query}` : null;
  const { data, error, loading, reload } = useReport(url, { enabled: period.ready });
  const a = data?.analytics;

  const TabBody = { overview: Overview, money: SalesMoney, services: Services, customers: Customers, staff: Staff, products: Products, frontdesk: FrontDesk, controls: Controls }[tab];

  return (
    <ErpPage>
      <PageHeader
        icon={ChartColumnBig}
        iconTone="ledger"
        title="Salon Analytics"
        subtitle="Sales, customers, services, staff, products and salon performance for the selected period."
        meta={a ? (
          <>
            <span>{a.businessDay?.scoped ? `Business Day ${a.businessDay.date} · ${a.businessDay.sessions} session(s)` : a.period?.displayRange}</span>
            <span>Updated {updatedLabel(a.generatedAt)}</span>
          </>
        ) : null}
        actions={<RefreshButton loading={loading} onClick={reload} />}
      />
      <PeriodFilter {...period.filterProps} className="mb-4" />

      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {!period.ready ? <AlertBanner tone="online" title="Choose a date range">Select a start and end date, then Apply.</AlertBanner> : null}
      {loading && !a ? <LoadingState label="Crunching the numbers…" /> : null}

      {a ? (
        <div className={`space-y-4 ${loading ? 'opacity-60' : ''}`}>
          <MetricGroup columns={5}>
            <MetricCard label="Gross sales" value={money(a.kpis.grossSales)} tone="ops" />
            <MetricCard label="Discounts" value={money(a.kpis.discounts)} tone="outflow" />
            <MetricCard label="Net sales" value={money(a.kpis.netSales)} tone="inflow" emphasis sub={a.kpis.voids ? `after ${money(a.kpis.voids)} voids` : undefined} />
            <MetricCard label="Expenses" value={money(a.kpis.expenses)} tone="outflow" />
            <MetricCard label="Salary / payroll paid" value={money(a.kpis.payroll)} tone="hrm" />
            <MetricCard label="Net collection" value={money(a.kpis.netCollection)} tone="cash" hint="Cash + online received − refunds." />
            <MetricCard label="Completed bills" value={count(a.kpis.bills)} tone="neutral" />
            <MetricCard label="Customers served" value={count(a.kpis.customersServed)} tone="ops" />
            <MetricCard label="Cash sales" value={money(a.payments.cash)} tone="cash" sub={`net ${money(a.payments.netCash)}`} />
            <MetricCard label="Online sales" value={money(a.payments.online)} tone="online" sub={`net ${money(a.payments.netOnline)}`} />
          </MetricGroup>

          <div role="tablist" aria-label="Analytics sections" className="print-hide -mx-1 flex gap-1 overflow-x-auto border-b border-stone-200 px-1">
            {TABS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={`shrink-0 border-b-2 px-3 py-2 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900/30 ${
                  tab === value ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-500 hover:text-stone-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div role="tabpanel">
            <TabBody a={a} />
          </div>
        </div>
      ) : null}
    </ErpPage>
  );
}
