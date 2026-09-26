'use client';

import { Crown, Receipt, Scissors, Star, UserPlus, Users } from 'lucide-react';
import { count, humanize, money, TONES } from '@/components/erp';
import { TrendChart } from '@/components/erp/charts';
import { ChartPanel, ColumnBars, GroupHeading, RankedBars, RingDonut, StatStrip, rupees } from './kit';

export const SOURCE_COLOURS = { walkin: '#C9A55C', token: TONES.ops.hex, appointment: TONES.online.hex };

export function OverviewTab({ a }) {
  const m = a.money;
  const trendNote = a.period?.value === 'today' ? 'Net sales by hour of the Business Day' : 'Net sales per day (voids applied on the day processed)';
  return (
    <div className="space-y-4">
      <GroupHeading eyebrow="Visual dashboard" title="What is driving the salon" description="Hover, tap or focus a donut segment to inspect its share." />
      <div className="grid gap-4 lg:grid-cols-4">
        <ChartPanel title="Sales trend" note={trendNote} className="lg:col-span-2">
          <div className="h-[230px]"><TrendChart rows={a.salesTrend} series={[{ key: 'netSales', label: 'Net sales', color: TONES.ops.hex }]} /></div>
        </ChartPanel>
        <ChartPanel title="Sales by source">
          <RingDonut stacked height={180} centerLabel="Billed" rows={a.sources.map((s) => ({ label: s.label.replace(' (direct bill)', ''), value: s.total, sub: `${count(s.bills)} bills`, color: SOURCE_COLOURS[s.key] }))} />
        </ChartPanel>
        <ChartPanel title="Payments breakdown">
          <RingDonut stacked height={180} centerLabel="Received" rows={[
            { label: 'Cash', value: m.payments.cash, color: TONES.cash.hex },
            { label: 'Online', value: m.payments.online, color: TONES.online.hex },
            { label: 'Credit (billed)', value: m.revenue.creditSales, color: TONES.ledger.hex },
          ]} />
        </ChartPanel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel title="Sales by service category">
          <RingDonut centerLabel="Service sales" rows={a.services.categories.map((row) => ({ label: row.category, value: row.revenue, sub: `${count(row.quantity)} done` }))} />
        </ChartPanel>
        <ChartPanel title="Services vs products" note="Line value before bill discounts">
          <RingDonut centerLabel="Sales" rows={[
            { label: 'Services', value: m.revenue.serviceRevenue, sub: `${count(a.services.servicesSold)} done`, color: TONES.ops.hex },
            { label: 'Retail products', value: m.revenue.productRevenue, sub: `${count(a.products.productsSold)} sold`, color: '#C9A55C' },
          ]} />
        </ChartPanel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel title="Product sales by category">
          <RingDonut centerLabel="Product sales" empty="No products sold in this period." rows={a.products.categories.map((row) => ({ label: row.category, value: row.revenue, sub: `${count(row.quantity)} sold` }))} />
        </ChartPanel>
        <ChartPanel title="Expenses by category" note="Operating expenses — salary and savings excluded">
          <RingDonut centerLabel="Expenses" empty="No expenses in this period." rows={a.expenses.categories.map((row) => ({ label: humanize(row.category), value: row.amount, sub: `${count(row.records)} entries` }))} />
        </ChartPanel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel title="Staff earnings" note="Service revenue earned by each team member">
          <RankedBars rows={a.staff.map((row) => ({ label: row.staffName, value: row.revenue }))} color={TONES.hrm.hex} />
        </ChartPanel>
        <ChartPanel title="Busiest days of the week" note="Billed value by weekday (Nepal week starts Sunday)">
          <ColumnBars rows={a.byWeekday} color="#1C1917" height={Math.max(230, a.staff.length * 36 + 30)} />
        </ChartPanel>
      </div>

      <StatStrip items={[
        { icon: Receipt, label: 'Total bills', value: count(a.kpis.bills) },
        { icon: Crown, label: 'Average bill', value: rupees(a.kpis.averageBill) },
        { icon: Scissors, label: 'Services done', value: count(a.services.servicesSold), tone: 'ops' },
        { icon: UserPlus, label: 'New customers', value: count(a.customers.newCustomers), tone: 'inflow' },
        { icon: Users, label: 'Returning customers', value: count(a.customers.returningCustomers), tone: 'ledger' },
        { icon: Star, label: 'Top service', value: a.services.byRevenue[0]?.name || '—', tone: 'crm' },
      ]} />
    </div>
  );
}
