'use client';

import {
  Banknote, CalendarCheck, Gift, HandCoins, Landmark, PiggyBank, Receipt, RotateCcw, Scissors, ShoppingCart, Tag, Ticket,
  TrendingUp, UserRound, Wallet,
} from 'lucide-react';
import { count, money } from '@/components/erp';
import { DashSection, FlowCard, GroupHeading, MiniStat, rupees } from './kit';

/** Money flow + how payment was recorded + where sales came from. Always above the tabs. */
export function MoneyFlow({ a }) {
  const m = a.money;
  const r = m.revenue;
  const p = m.payments;
  const sourceIcon = { walkin: UserRound, token: Ticket, appointment: CalendarCheck };
  const sourceTone = { walkin: 'gold', token: 'ops', appointment: 'online' };
  return (
    <div className="space-y-4">
      <GroupHeading title="Money flow" description="What was sold, what was taken off, what left the salon — then how the money came in and where the bills came from." />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <FlowCard icon={Wallet} tone="cash" label="Opening cash" value={rupees(m.cashPosition?.startingCash)} hint="Drawer cash at the first opening" />
        <FlowCard icon={TrendingUp} tone="inflow" label="Total sales" value={rupees(r.grossSales)} hint="Services & products at list price" />
        <FlowCard icon={Tag} tone="outflow" label="Discounts" value={rupees(r.discounts)} hint={Number(r.loyaltyDiscounts) ? `Includes ${money(r.loyaltyDiscounts)} loyalty rewards` : 'Discounts given to customers'} />
        <FlowCard icon={Gift} tone="crm" label="Loyalty rewards" value={rupees(r.loyaltyDiscounts)} hint="Free / reduced visits (inside discounts)" />
        <FlowCard icon={Scissors} tone="hrm" label="Staff commission" value={rupees(m.salary.commissionAccrued)} hint="Earned by staff on services" />
        <FlowCard icon={PiggyBank} tone="ledger" label="Savings & deposits" value={rupees(m.savings.total)} hint={`${count(m.savings.records)} deposit${m.savings.records === 1 ? '' : 's'} this period`} />
        <FlowCard icon={RotateCcw} tone="outflow" label="Refunds" value={rupees(p.refunds)} hint={`${count(r.voidCount)} voided bill${r.voidCount === 1 ? '' : 's'} · money returned`} />
        <FlowCard icon={ShoppingCart} tone="cash" label="Purchases" value={rupees(m.purchases.total)} hint={`${count(m.purchases.records)} product purchase record${m.purchases.records === 1 ? '' : 's'}`} />
        <FlowCard icon={Receipt} tone="outflow" label="Expenses" value={rupees(m.expenses.excludingPurchases)} hint="Operating expenses, excluding purchases" />
        <FlowCard icon={HandCoins} highlight label="Net collection" value={rupees(p.netReceived)} hint="Cash + online received, less refunds" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DashSection title="How payment was recorded" description="Cash, online and credit for this period." padded>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <MiniStat icon={Banknote} tone="cash" label="Cash sale" value={rupees(p.cash)} />
            <MiniStat icon={Landmark} tone="online" label="Online sale" value={rupees(p.online)} sub={`eSewa ${money(p.esewaPhonePay)} · Bank ${money(p.bankQr)}`} />
            <MiniStat icon={UserRound} tone="ledger" label="Credit sale" value={rupees(r.creditSales)} sub="Billed, not yet received" />
          </div>
          <div className="my-5 border-t border-stone-100" />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <MiniStat icon={Banknote} tone="cash" label="Credit collection (cash)" value={rupees(p.creditCollectionsCash)} />
            <MiniStat icon={Landmark} tone="online" label="Credit collection (online)" value={rupees(p.creditCollectionsOnline)} />
            <MiniStat icon={Wallet} tone="cash" label="Net cash collection" value={rupees(p.netCash)} sub="Cash sales + cash collections − cash refunds" />
            <MiniStat icon={Landmark} tone="online" label="Net online collection" value={rupees(p.netOnline)} sub="Online sales + online collections − online refunds" />
          </div>
        </DashSection>
        <DashSection title="Where sales came from" description="Finalized bills by how the customer arrived." padded>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            {a.sources.map((source) => (
              <MiniStat key={source.key} icon={sourceIcon[source.key]} tone={sourceTone[source.key]} label={source.label} value={rupees(source.total)} sub={`${count(source.bills)} bills · ${source.share}%`} />
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
