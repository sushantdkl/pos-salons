'use client';

import {
  AlertTriangle, Ban, BadgePercent, Boxes, CalendarCheck, CalendarClock, CalendarX, Clock, Coins, Crown, Gift, HeartHandshake, History,
  PackageSearch, Receipt, Repeat, Scissors, ShieldAlert, Sparkles, Star, Ticket, TicketCheck, UserMinus, UserPlus, Users, UsersRound,
} from 'lucide-react';
import { count, humanize, money, percent, TONES } from '@/components/erp';
import { GroupedBarChart, TrendChart } from '@/components/erp/charts';
import { ReportTable } from '@/components/reports/report-table';
import { ChartPanel, ColumnBars, DashSection, FlowCard, LedgerPanel, PlainTable, RankedBars, RingDonut, rupees } from './kit';

const Grid = ({ children, cols = 4 }) => <div className={`grid grid-cols-2 gap-3 sm:gap-4 ${cols === 5 ? 'xl:grid-cols-5' : cols === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>{children}</div>;

/* ---------------------------------------------------------------- services */

export function ServicesTab({ a }) {
  const s = a.services;
  return (
    <div className="space-y-5">
      <Grid>
        <FlowCard icon={Scissors} tone="ops" label="Services done" value={count(s.servicesSold)} hint={`${count(s.distinctServices)} different services`} />
        <FlowCard icon={Coins} tone="inflow" label="Service revenue" value={rupees(s.serviceRevenue)} hint="Line value before bill discounts" />
        <FlowCard icon={Crown} tone="gold" label="Average service value" value={rupees(s.averageServiceValue)} />
        <FlowCard icon={Sparkles} tone="ledger" label="Service share of sales" value={percent(s.serviceShare)} hint={`Products ${percent(s.productShare)}`} />
      </Grid>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel title="Top services by revenue"><RankedBars rows={s.byRevenue.map((row) => ({ label: row.name, value: row.revenue }))} color={TONES.ops.hex} /></ChartPanel>
        <ChartPanel title="Most booked services" note="By times done"><RankedBars rows={s.byQuantity.map((row) => ({ label: row.name, value: row.quantity }))} color="#C9A55C" format={count} name="Times done" /></ChartPanel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel title="Service category mix"><RingDonut centerLabel="Service sales" rows={s.categories.map((row) => ({ label: row.category, value: row.revenue, sub: `${count(row.quantity)} done` }))} /></ChartPanel>
        <DashSection title="Service menu performance" description="Top services in this period.">
          <PlainTable
            rowKey={(row) => row.id}
            columns={[
              { key: 'name', label: 'Service', className: 'font-semibold text-stone-900' },
              { key: 'category', label: 'Category', className: 'text-stone-500' },
              { key: 'quantity', label: 'Done', align: 'right', render: (row) => count(row.quantity) },
              { key: 'averageValue', label: 'Avg value', align: 'right', render: (row) => money(row.averageValue) },
              { key: 'revenue', label: 'Revenue', align: 'right', className: 'font-bold text-emerald-700', render: (row) => money(row.revenue) },
            ]}
            rows={s.byRevenue}
          />
        </DashSection>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- customers */

export function CustomersTab({ a }) {
  const c = a.customers;
  const crm = c.crm;
  return (
    <div className="space-y-5">
      <Grid>
        <FlowCard icon={Users} tone="ops" label="Customers served" value={count(c.customersServed)} hint={`${count(c.identifiedCustomers)} saved · ${count(c.walkInBills)} walk-in bills`} />
        <FlowCard icon={UserPlus} tone="inflow" label="New customers" value={count(c.newCustomers)} hint="First ever paid visit in this period" />
        <FlowCard icon={Repeat} tone="ledger" label="Returning customers" value={count(c.returningCustomers)} hint={`${percent(c.returningShare)} of saved customers`} />
        <FlowCard icon={Receipt} tone="gold" label="Average spend per bill" value={rupees(c.averageSpendPerBill)} hint={`${c.visitsPerCustomer.toFixed(2)} visits per saved customer`} />
      </Grid>
      {crm ? (
        <Grid>
          <FlowCard icon={Star} tone="cash" label="Average rating" value={crm.reviews.average === null ? '—' : `${crm.reviews.average} ★`} hint={`${count(crm.reviews.count)} reviews · ${count(crm.reviews.verified)} verified`} />
          <FlowCard icon={HeartHandshake} tone="crm" label="Loyalty visits earned" value={count(crm.loyalty.stampsEarned)} hint={`${count(crm.loyalty.customersEarning)} customers earning`} />
          <FlowCard icon={Gift} tone="crm" label="Rewards redeemed" value={count(crm.loyalty.rewardsRedeemed)} hint={`Loyalty discount ${money(crm.loyalty.loyaltyDiscount)}`} />
          <FlowCard icon={Sparkles} tone="online" label="Rewards waiting now" value={count(crm.loyalty.outstandingRewards)} hint={`${count(crm.loyalty.customersNearReward)} customers one visit away`} />
        </Grid>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartPanel title="Customers per day" className="lg:col-span-2">
          {c.trend.length > 1 ? <div className="h-[230px]"><TrendChart rows={c.trend} format={count} axisFormat={count} series={[{ key: 'customers', label: 'Customers', color: TONES.crm.hex }]} /></div>
            : <p className="py-12 text-center text-sm text-stone-400">Choose a multi-day period to see the trend.</p>}
        </ChartPanel>
        <ChartPanel title="Customer mix">
          <RingDonut format={count} centerLabel="Customers" rows={[
            { label: 'New', value: c.newCustomers, color: TONES.inflow.hex },
            { label: 'Returning', value: c.returningCustomers, color: TONES.ledger.hex },
            { label: 'Walk-in bills (not saved)', value: c.walkInBills, color: '#C9A55C' },
          ]} />
        </ChartPanel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {crm ? (
          <ChartPanel title="Ratings" note="Verified reviews from customers who visited">
            <ColumnBars rows={[5, 4, 3, 2, 1].map((star) => ({ label: `${star} ★`, total: crm.reviews.ratings[star] }))} format={count} color={TONES.cash.hex} name="Reviews" />
          </ChartPanel>
        ) : null}
        <DashSection title="Top customers by spend" description="Saved customers billed in this period.">
          <PlainTable
            rowKey={(row) => row.id}
            empty="No saved customers billed in this period."
            columns={[
              { key: 'name', label: 'Customer', className: 'font-semibold text-stone-900' },
              { key: 'bills', label: 'Bills', align: 'right', render: (row) => count(row.bills) },
              { key: 'spend', label: 'Spend', align: 'right', className: 'font-bold text-pink-700', render: (row) => money(row.spend) },
            ]}
            rows={c.topCustomers}
          />
        </DashSection>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- staff */

export function StaffTab({ a }) {
  const staff = a.staff;
  return (
    <div className="space-y-5">
      <Grid cols={3}>
        <FlowCard icon={UsersRound} tone="hrm" label="Team members billed" value={count(staff.length)} />
        <FlowCard icon={Coins} tone="inflow" label="Service revenue by team" value={rupees(a.services.serviceRevenue)} />
        <FlowCard icon={Crown} tone="gold" label="Commission earned" value={rupees(a.money.salary.commissionAccrued)} hint={`Salary / payroll paid ${money(a.money.salary.total)}`} />
      </Grid>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel title="Staff earnings" note="Service revenue by team member"><RankedBars rows={staff.map((row) => ({ label: row.staffName, value: row.revenue }))} color={TONES.hrm.hex} /></ChartPanel>
        <ChartPanel title="Services done" note="Count of service lines"><RankedBars rows={staff.map((row) => ({ label: row.staffName, value: row.servicesCompleted }))} color={TONES.ops.hex} format={count} name="Services" /></ChartPanel>
      </div>
      <DashSection title="Team performance" description="Revenue is the value of service lines assigned at billing. Shift length and assisting work are not captured, so read it with context.">
        <PlainTable
          rowKey={(row) => row.staffId}
          empty="No service lines with an assigned staff member in this period."
          columns={[
            { key: 'staffName', label: 'Staff', className: 'font-semibold text-stone-900' },
            { key: 'role', label: 'Role', render: (row) => <span className="capitalize text-stone-500">{row.role}</span> },
            { key: 'servicesCompleted', label: 'Services', align: 'right', render: (row) => count(row.servicesCompleted) },
            { key: 'customersServed', label: 'Customers', align: 'right', render: (row) => count(row.customersServed) },
            { key: 'averageTicket', label: 'Avg ticket', align: 'right', render: (row) => money(row.averageTicket) },
            { key: 'revenue', label: 'Revenue', align: 'right', className: 'font-bold text-emerald-700', render: (row) => money(row.revenue) },
            { key: 'commission', label: 'Commission', align: 'right', className: 'font-semibold text-violet-700', render: (row) => money(row.commission) },
            { key: 'percentage', label: 'Share', align: 'right', render: (row) => `${row.percentage}%` },
          ]}
          rows={staff}
        />
      </DashSection>
    </div>
  );
}

/* ---------------------------------------------------------------- products */

export function ProductsTab({ a }) {
  const p = a.products;
  return (
    <div className="space-y-5">
      <Grid>
        <FlowCard icon={PackageSearch} tone="online" label="Products sold" value={count(p.productsSold)} hint={`${count(p.activeProducts)} active products`} />
        <FlowCard icon={Coins} tone="inflow" label="Product revenue" value={rupees(p.productRevenue)} />
        <FlowCard icon={AlertTriangle} tone={p.lowStockCount ? 'cash' : 'neutral'} label="Low stock" value={count(p.lowStockCount)} hint={`${count(p.outOfStockCount)} out of stock`} />
        <FlowCard icon={Boxes} tone="ledger" label="Stock value (cost)" value={rupees(p.stockValue)} hint={p.stockValueComplete ? 'Current stock × purchase price' : `${p.uncostedInStock} product(s) without a purchase price`} />
      </Grid>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel title="Top products" note="By revenue"><RankedBars rows={p.topProducts.map((row) => ({ label: row.name, value: row.revenue }))} color="#C9A55C" /></ChartPanel>
        <ChartPanel title="Product category mix"><RingDonut centerLabel="Product sales" empty="No products sold in this period." rows={p.categories.map((row) => ({ label: row.category, value: row.revenue, sub: `${count(row.quantity)} sold` }))} /></ChartPanel>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <LedgerPanel title="Stock movement & purchases" tone="cash" rows={[
          ...p.movements.map((row) => ({ label: humanize(String(row.type).toUpperCase()), value: `${count(row.units)} units · ${count(row.records)} entries` })),
          { label: 'Units restocked', value: count(p.unitsRestocked) },
          { label: 'Purchases paid', value: p.purchaseValue, strong: true },
        ]} />
        <DashSection title="Low stock" description="At or below the alert level.">
          <PlainTable rowKey={(row) => row.id} empty="Nothing is low on stock." columns={[
            { key: 'name', label: 'Product', className: 'font-semibold text-stone-900' },
            { key: 'currentStock', label: 'In stock', align: 'right', className: 'font-bold text-rose-700' },
            { key: 'threshold', label: 'Alert at', align: 'right' },
          ]} rows={p.lowStock} />
        </DashSection>
        <DashSection title="Slow moving" description="In stock with no sale in 30 days.">
          <PlainTable rowKey={(row) => row.id} empty="Every product in stock sold in the last 30 days." columns={[
            { key: 'name', label: 'Product', className: 'font-semibold text-stone-900' },
            { key: 'currentStock', label: 'In stock', align: 'right' },
          ]} rows={p.slowMoving || []} />
        </DashSection>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- front desk */

export function FrontDeskTab({ a }) {
  const t = a.tokens;
  const p = a.appointments;
  const SOURCE = { WALK_IN: 'Walk-in', PHONE: 'Phone', WEBSITE: 'Website', WHATSAPP: 'WhatsApp', STAFF: 'Staff entry', REBOOKING: 'Rebooking' };
  return (
    <div className="space-y-5">
      <Grid cols={5}>
        <FlowCard icon={Ticket} tone="ops" label="Tokens issued" value={count(t.generated)} hint={`${count(t.waitingNow)} waiting now`} />
        <FlowCard icon={TicketCheck} tone="inflow" label="Converted to bills" value={count(t.converted)} hint={`${percent(t.conversionRate)} conversion`} />
        <FlowCard icon={CalendarClock} tone="online" label="Appointments booked" value={count(p?.booked)} hint={`${count(p?.pending)} pending · ${count(p?.confirmed)} confirmed`} />
        <FlowCard icon={CalendarCheck} tone="inflow" label="Appointments completed" value={count(p?.completed)} hint={`${percent(p?.completionRate)} completion`} />
        <FlowCard icon={CalendarX} tone="outflow" label="No shows" value={count((p?.noShow || 0))} hint={`Tokens ${count(t.noShow)} · no-show rate ${percent(p?.noShowRate)}`} />
      </Grid>
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartPanel title="Queue by hour" note="Tokens issued and converted (Nepal time)" className="lg:col-span-2">
          <div className="h-[240px]"><GroupedBarChart format={count} axisFormat={count} rows={t.byHour} series={[{ key: 'tokens', label: 'Tokens', color: '#C9A55C' }, { key: 'converted', label: 'Converted', color: TONES.inflow.hex }]} /></div>
        </ChartPanel>
        <ChartPanel title="How bills started">
          <RingDonut format={count} centerLabel="Bills" rows={a.sources.map((s) => ({ label: s.label.replace(' (direct bill)', ''), value: s.bills, color: { walkin: '#C9A55C', token: TONES.ops.hex, appointment: TONES.online.hex }[s.key] }))} />
        </ChartPanel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel title="Appointment status">
          <RingDonut format={count} centerLabel="Booked" empty="No appointments in this period." rows={p ? [
            { label: 'Completed', value: p.completed, color: TONES.inflow.hex },
            { label: 'Upcoming / in salon', value: p.pending + p.confirmed + p.inSalon, color: TONES.online.hex },
            { label: 'Cancelled', value: p.cancelled, color: '#a8a29e' },
            { label: 'No show', value: p.noShow, color: TONES.outflow.hex },
          ] : []} />
        </ChartPanel>
        <ChartPanel title="Where bookings come from">
          <RankedBars rows={(p?.sources || []).map((row) => ({ label: SOURCE[row.source] || row.source, value: row.count }))} format={count} color={TONES.online.hex} name="Bookings" />
        </ChartPanel>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- controls */

export function ControlsTab({ a }) {
  const c = a.controls;
  return (
    <div className="space-y-5">
      <Grid>
        <FlowCard icon={Ban} tone="outflow" label="Voided bills" value={count(c.voids)} hint={money(c.voidedAmount)} />
        <FlowCard icon={BadgePercent} tone="cash" label="Bills with a discount" value={count(c.discountedBills)} hint={`${percent(c.discountedShare)} of bills · ${percent(c.discountRate)} of gross`} />
        <FlowCard icon={History} tone="ledger" label="Backdated bills" value={count(c.backdatedBills)} />
        <FlowCard icon={ShieldAlert} tone={c.shortages ? 'outflow' : 'neutral'} label="Short cash closes" value={count(c.shortages)} hint={money(c.shortageTotal)} />
      </Grid>
      <div className="grid gap-4 lg:grid-cols-2">
        <LedgerPanel title="Sales exceptions" tone="outflow" rows={[
          { label: 'Voided bills', value: `${count(c.voids)} · ${money(c.voidedAmount)}` },
          { label: 'Bills with a discount', value: `${count(c.discountedBills)} (${percent(c.discountedShare)})` },
          { label: 'Discount given', value: c.discountTotal, sub: `${percent(c.discountRate)} of gross sales` },
          { label: 'Backdated bills', value: count(c.backdatedBills) },
          { label: 'Payment method changes', value: count(c.paymentMethodChanges), sub: 'Cash ↔ online fixes, each with a reason' },
          { label: 'Cancelled tokens', value: count(c.cancelledTokens) },
        ]} />
        <LedgerPanel title="Cash control" tone="cash" rows={[
          { label: 'Store sessions', value: count(c.sessions) },
          { label: 'Same-day reopens', value: count(c.reopenedSessions) },
          { label: 'Cash shortages', value: `${count(c.shortages)} · ${money(c.shortageTotal)}` },
          { label: 'Cash overages', value: `${count(c.overages)} · ${money(c.overageTotal)}` },
          { label: 'Force-closed sessions', value: count(c.forceClosed) },
          { label: 'Float added at open', value: c.cashAdded },
          { label: 'Float removed at open', value: c.cashRemoved },
        ]} />
      </div>
    </div>
  );
}

/* ----------------------------------------------------- cancellations & changes */

export function CancellationsTab({ a, calendarSystem }) {
  const x = a.cancellations;
  const t = x.totals;
  return (
    <div className="space-y-5">
      <Grid>
        <FlowCard icon={Ban} tone="outflow" label="Voided value" value={rupees(t.voidedAmount)} hint={`${count(x.voids.length)} voided bills`} />
        <FlowCard icon={BadgePercent} tone="cash" label="Discounts given" value={rupees(t.discountAmount)} hint={`${count(x.discounts.length)} bills · loyalty ${money(t.loyaltyAmount)}`} />
        <FlowCard icon={UserMinus} tone="outflow" label="Tokens cancelled / no show" value={`${count(t.cancelledTokens)} / ${count(t.noShowTokens)}`} />
        <FlowCard icon={Clock} tone="online" label="Appointments cancelled / no show" value={`${count(t.cancelledAppointments)} / ${count(t.noShowAppointments)}`} />
      </Grid>
      <ReportTable title="Voided bills" calendarSystem={calendarSystem} rows={x.voids} totals={{ amount: t.voidedAmount }} defaultPageSize={25} exportName="Voided bills" empty="No bills were voided in this period."
        columns={[
          { key: 'time', label: 'Voided at', type: 'datetime' },
          { key: 'bill_number', label: 'Bill', type: 'bill', idKey: 'bill_id' },
          { key: 'customer', label: 'Customer', type: 'text' },
          { key: 'reason', label: 'Reason', type: 'text', muted: true },
          { key: 'by_name', label: 'By', type: 'text' },
          { key: 'amount', label: 'Voided amount', type: 'money', tone: 'outflow', strong: true },
        ]} />
      <ReportTable title="Discounted bills" calendarSystem={calendarSystem} rows={x.discounts} totals={{ discount: t.discountAmount, loyalty: t.loyaltyAmount }} defaultPageSize={25} exportName="Discounted bills" empty="No discounts in this period."
        columns={[
          { key: 'time', label: 'Date / time', type: 'datetime' },
          { key: 'bill_number', label: 'Bill', type: 'bill', idKey: 'id' },
          { key: 'customer', label: 'Customer', type: 'text' },
          { key: 'subtotal', label: 'Before discount', type: 'money' },
          { key: 'rate', label: 'Rate', type: 'percent' },
          { key: 'loyalty', label: 'Loyalty reward', type: 'money', tone: 'crm' },
          { key: 'discount', label: 'Discount', type: 'money', tone: 'outflow', strong: true },
        ]} />
      <div className="space-y-5">
        <ReportTable title="Cancelled & no-show tokens" calendarSystem={calendarSystem} rows={x.tokens} defaultPageSize={25} exportName="Cancelled tokens" empty="No cancelled or no-show tokens."
          columns={[
            { key: 'date', label: 'Date', type: 'date' },
            { key: 'token_number', label: 'Token', type: 'text', strong: true },
            { key: 'customer', label: 'Customer', type: 'text' },
            { key: 'status', label: 'Status', type: 'status' },
          ]} />
        <ReportTable title="Cancelled & no-show appointments" calendarSystem={calendarSystem} rows={x.appointments} defaultPageSize={25} exportName="Cancelled appointments" empty="No cancelled or no-show appointments."
          columns={[
            { key: 'date', label: 'Date', type: 'date' },
            { key: 'appointment_number', label: 'Booking', type: 'text', strong: true },
            { key: 'customer', label: 'Customer', type: 'customer', idKey: 'customer_id' },
            { key: 'staff', label: 'Staff', type: 'text' },
            { key: 'status', label: 'Status', type: 'status' },
            { key: 'reason', label: 'Reason', type: 'text', muted: true },
          ]} />
      </div>
      <ReportTable title="Backdated bills" calendarSystem={calendarSystem} rows={x.backdated} defaultPageSize={25} exportName="Backdated bills" empty="No backdated bills in this period."
        columns={[
          { key: 'time', label: 'Service date', type: 'datetime' },
          { key: 'entered_at', label: 'Entered at', type: 'datetime' },
          { key: 'bill_number', label: 'Bill', type: 'bill', idKey: 'id' },
          { key: 'customer', label: 'Customer', type: 'text' },
          { key: 'reason', label: 'Reason', type: 'text', muted: true },
          { key: 'by_name', label: 'By', type: 'text' },
          { key: 'total', label: 'Bill total', type: 'money', strong: true },
        ]} />
    </div>
  );
}
