'use client';

import {
  Banknote, CalendarCheck, Gift, HandCoins, Landmark, PiggyBank, Receipt, RotateCcw, Scissors, ShoppingCart, Tag, Ticket,
  TrendingUp, UserRound, Wallet,
} from 'lucide-react';
import { count, money } from '@/components/erp';
import { DashSection, FlowCard, GroupHeading, MiniStat, rupees } from './kit';

/** Money flow + how payment was recorded + where sales came from. Always above the tabs. */
export function MoneyFlow({ a, onTab }) {
  // Reports open on the same dates as this Analytics period.
  const range = a.period?.startDate && a.period?.endDate ? `?start=${a.period.startDate}&end=${a.period.endDate}` : '';
  const report = (name) => `/admin/reports/center/${name}${range}`;
  const m = a.money;
  const r = m.revenue;
  const p = m.payments;
  const sourceIcon = { walkin: UserRound, token: Ticket, appointment: CalendarCheck };
  const sourceTone = { walkin: 'gold', token: 'ops', appointment: 'online' };
  return (
    <div className="space-y-4">
      <GroupHeading title="Money flow" description="What was sold, what was taken off, what left the salon — then how the money came in and where the bills came from." />
      <div className="grid grid-cols-2 items-start gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <FlowCard icon={Wallet} tone="cash" href="/store/opening-closing" label="Opening cash" value={rupees(m.cashPosition?.startingCash)} hint="Drawer cash at the first opening" />
        <FlowCard icon={TrendingUp} tone="inflow" href={report('sales')} label="Total sales" value={rupees(r.grossSales)} hint="Services & products at list price" />
        <FlowCard icon={Tag} tone="outflow" onClick={() => onTab?.('cancellations')} label="Discounts" value={rupees(r.discounts)} hint={Number(r.loyaltyDiscounts) ? `Includes ${money(r.loyaltyDiscounts)} loyalty rewards` : 'Discounts given to customers'} />
        <FlowCard icon={Gift} tone="crm" href="/admin/crm/loyalty" label="Loyalty rewards" value={rupees(r.loyaltyDiscounts)} hint="Free / reduced visits (inside discounts)" />
        <FlowCard icon={Scissors} tone="hrm" onClick={() => onTab?.('staff')} label="Staff commission" value={rupees(m.salary.commissionAccrued)} hint="Earned by staff on services" />
        <FlowCard icon={PiggyBank} tone="ledger" href="/admin/savings" label="Savings & deposits" value={rupees(m.savings.total)} hint={`${count(m.savings.records)} deposit${m.savings.records === 1 ? '' : 's'} this period`} />
        <FlowCard icon={RotateCcw} tone="outflow" onClick={() => onTab?.('cancellations')} label="Refunds" value={rupees(p.refunds)} hint={`${count(r.voidCount)} voided bill${r.voidCount === 1 ? '' : 's'} · money returned`} />
        <FlowCard icon={ShoppingCart} tone="cash" href="/admin/purchases" label="Purchases" value={rupees(m.purchases.total)} hint={`${count(m.purchases.records)} product purchase record${m.purchases.records === 1 ? '' : 's'}`} />
        <FlowCard icon={Receipt} tone="outflow" href={report('expenses')} label="Expenses" value={rupees(m.expenses.excludingPurchases)} hint="Operating expenses, excluding purchases" />
        <FlowCard icon={HandCoins} highlight onClick={() => onTab?.('money')} label="Net collection" value={rupees(p.netReceived)} hint="Money received, not sales">
          <dl className="mt-3 space-y-0.5 border-t border-white/10 pt-2.5 text-[11.5px] text-white/70" title="Bills paid in cash or online + credit collected for earlier bills − refunds">
            <div className="flex justify-between gap-2"><dt>Bills paid</dt><dd className="tabular-nums text-white">{rupees(p.salesReceived)}</dd></div>
            <div className="flex justify-between gap-2"><dt>+ Credit collected</dt><dd className="tabular-nums text-emerald-300">{rupees(a.payments.creditCollected)}</dd></div>
            <div className="flex justify-between gap-2"><dt>− Refunds</dt><dd className="tabular-nums text-rose-300">{rupees(p.refunds)}</dd></div>
          </dl>
        </FlowCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DashSection title="How payment was recorded" description="Cash, online and credit for this period." padded>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <MiniStat icon={Banknote} tone="cash" href={report('payments')} label="Cash sale" value={rupees(p.cash)} />
            <MiniStat icon={Landmark} tone="online" href={report('payments')} label="Online sale" value={rupees(p.online)} sub={`eSewa ${money(p.esewaPhonePay)} · Bank ${money(p.bankQr)}`} />
            <MiniStat icon={UserRound} tone="ledger" href={report('credit')} label="Credit sale" value={rupees(r.creditSales)} sub="Billed, not yet received" />
          </div>
          <div className="my-5 border-t border-stone-100" />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <MiniStat icon={Banknote} tone="cash" href={report('credit')} label="Credit collection (cash)" value={rupees(p.creditCollectionsCash)} />
            <MiniStat icon={Landmark} tone="online" href={report('credit')} label="Credit collection (online)" value={rupees(p.creditCollectionsOnline)} />
            <MiniStat icon={Wallet} tone="cash" onClick={() => onTab?.('money')} label="Net cash collection" value={rupees(p.netCash)} sub="Cash sales + cash collections − cash refunds" />
            <MiniStat icon={Landmark} tone="online" onClick={() => onTab?.('money')} label="Net online collection" value={rupees(p.netOnline)} sub="Online sales + online collections − online refunds" />
          </div>
        </DashSection>
        <DashSection title="Where sales came from" description="Finalized bills by how the customer arrived." padded>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            {a.sources.map((source) => (
              <MiniStat key={source.key} href={{ walkin: report('sales'), token: '/dashboard/admin/tokens', appointment: '/admin/appointments' }[source.key]} icon={sourceIcon[source.key]} tone={sourceTone[source.key]} label={source.label} value={rupees(source.total)} sub={`${count(source.bills)} bills · ${source.share}%`} />
            ))}
          </div>
          <div className="mt-6 flex h-3 overflow-hidden rounded-full bg-stone-100" role="img" aria-label="Share of sales by source">
            {a.sources.map((source) => (
              <span key={source.key} style={{ width: `${source.share}%` }} className={{ walkin: 'bg-[#C9A55C]', token: 'bg-teal-500', appointment: 'bg-sky-500' }[source.key]} title={`${source.label} ${source.share}%`} />
            ))}
          </div>
          <p className="mt-3 text-xs text-stone-500">Token bills came from the walk-in queue; appointment bills from a booking checked in at the salon. Direct bills had neither.</p>
        </DashSection>
      </div>
    </div>
  );
}
