'use client';

import Link from 'next/link';
import {
  AlertCircle, Banknote, Briefcase, CircleDollarSign, HandCoins, Landmark, Layers, PiggyBank, ReceiptText, Scale, ShoppingCart,
  TrendingUp, Truck, Wallet,
} from 'lucide-react';
import { count, money, TONES } from '@/components/erp';
import { TrendChart } from '@/components/erp/charts';
import { ReportTable } from '@/components/reports/report-table';
import { CASH_DENOMINATIONS } from '@/lib/business-day/denominations';
import { ChartPanel, ColumnBars, DashSection, GroupHeading, LedgerPanel, MiniStat, PlainTable, RingDonut, Step, StepCard, rupees } from './kit';
import { SOURCE_COLOURS } from './overview-tab';

const RECORD_COLUMNS = {
  base: [
    { key: 'time', label: 'Date / time', type: 'datetime' },
    { key: 'bill_number', label: 'Bill', type: 'bill', idKey: 'id' },
    { key: 'customer', label: 'Customer', type: 'text' },
  ],
  cash: [{ key: 'total', label: 'Amount', type: 'money', tone: 'cash', strong: true }],
  online: [{ key: 'total', label: 'Amount', type: 'money', tone: 'online', strong: true }],
  split: [
    { key: 'cash', label: 'Cash', type: 'money', tone: 'cash' },
    { key: 'online', label: 'Online / bank', type: 'money', tone: 'online' },
    { key: 'total', label: 'Amount', type: 'money', tone: 'inflow', strong: true },
  ],
  credit: [
    { key: 'cash', label: 'Paid cash', type: 'money', tone: 'cash' },
    { key: 'online', label: 'Paid online', type: 'money', tone: 'online' },
    { key: 'credit', label: 'On credit', type: 'money', tone: 'ledger' },
    { key: 'total', label: 'Bill total', type: 'money', strong: true },
  ],
};

function DrawerCountPanel({ c }) {
  const counts = c.denominations;
  const rows = counts ? CASH_DENOMINATIONS.map((note) => ({ note, n: Number(counts[note] ?? counts[String(note)] ?? 0) })) : [];
  const counted = c.countedCash ?? c.lastCountedCash;
  return (
    <LedgerPanel
      title={`Drawer count${c.lastCountedDate ? ` · ${c.lastCountedDate}` : ''}`}
      tone="hrm"
      rows={[
        { label: 'Expected drawer cash', value: c.expectedCash ?? '—', sub: c.expectedCashSource === 'live' ? 'live' : 'at close' },
        { label: 'Physically counted cash', value: counted ?? 'Not counted yet' },
        c.cashDifference !== null && c.cashDifference !== undefined
          ? { label: c.cashDifference < 0 ? 'Drawer cash short' : c.cashDifference > 0 ? 'Drawer cash over' : 'Drawer matched', value: c.cashDifference, strong: true, sign: c.cashDifference < 0 ? '-' : c.cashDifference > 0 ? '+' : '' }
          : null,
      ]}
    >
      {counts ? (
        <table className="w-full border-t border-stone-100 text-[12.5px]">
          <thead><tr className="text-[10.5px] font-bold uppercase tracking-wide text-stone-500"><th className="px-5 py-2 text-left">Note</th><th className="px-3 py-2 text-right">Count</th><th className="px-5 py-2 text-right">Calculation</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.note} className={`border-t border-stone-100 ${row.n ? 'text-stone-800' : 'text-stone-300'}`}>
                <td className="px-5 py-1.5 font-semibold">{row.note.toLocaleString('en-IN')}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{row.n}</td>
                <td className="px-5 py-1.5 text-right tabular-nums">{row.note.toLocaleString('en-IN')} × {row.n} = {money(row.note * row.n)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t-2 border-stone-800 font-bold text-stone-900"><td className="px-5 py-2">Total</td><td className="px-3 py-2 text-right tabular-nums">{rows.reduce((sum, row) => sum + row.n, 0)}</td><td className="px-5 py-2 text-right tabular-nums">{money(counted)}</td></tr></tfoot>
        </table>
      ) : <p className="border-t border-stone-100 px-5 py-4 text-xs text-stone-500">No note breakdown was recorded. Count notes at Close Store and the breakdown appears here.</p>}
    </LedgerPanel>
  );
}

export function MoneyTab({ a, calendarSystem }) {
  const m = a.money;
  const r = m.revenue;
  const p = m.payments;
  const c = m.cashPosition;
  const o = m.onlinePosition;
  const f = m.cashFlow;
  const ps = a.paymentSummary;
  const pl = m.profitLoss;
  const records = a.paymentRecords.records;
  const byMethod = (method) => records.filter((row) => row.method === method);

  return (
    <div className="space-y-5">
      <DashSection icon={CircleDollarSign} tone="inflow" eyebrow="Money control" title="Sales, collections and revenue mix" description="One owner overview for the selected Nepal reporting period. Deeper drill-downs live in Reports.">
        <Step number={1} title="What customers were billed" description="Start with service and product prices, then take off discounts (loyalty rewards included)." columns={3}>
          <StepCard label="Total service & product sales" value={rupees(r.grossSales)} tone="inflow" />
          <StepCard label="Less: discounts" value={rupees(r.discounts)} tone="outflow" hint={Number(r.loyaltyDiscounts) ? `of which loyalty rewards ${money(r.loyaltyDiscounts)}` : undefined} />
          <StepCard label="Bill total" value={rupees(r.finalizedTotal)} tone="inflow" hint={`${count(a.kpis.bills)} bills`} />
        </Step>
        <Step number={2} title="What the salon kept" description="Tax is shown separately; voids are taken off on the day they are processed; refunds are the money returned.">
          <StepCard label="Tax collected" value={rupees(r.tax)} tone="neutral" />
          <StepCard label="Voids processed" value={rupees(r.voids)} tone="outflow" hint={`${count(r.voidCount)} bills`} />
          <StepCard label="Refunds paid" value={rupees(p.refunds)} tone="outflow" hint="Cash and online returned" />
          <StepCard label="Net revenue after voids" value={rupees(r.netSales)} tone="inflow" />
        </Step>
        <Step number={3} title="How those bills were settled" description="Cash and online are received. Credit is not received yet; credit collections are money received against earlier credit.">
          <StepCard label="Cash received" value={rupees(p.cash)} tone="cash" />
          <StepCard label="Online received" value={rupees(p.online)} tone="online" />
          <StepCard label="Sold on credit (not received)" value={rupees(r.creditSales)} tone="ledger" />
          <StepCard label="Credit collections" value={rupees(a.payments.creditCollected)} tone="inflow" hint={`Cash ${money(p.creditCollectionsCash)} · Online ${money(p.creditCollectionsOnline)}`} />
        </Step>
        <Step number={4} title="What remains open" description="Receivables are the live all-time balance; the queue and upcoming bookings are not sales yet.">
          <StepCard label="Still owed to you (all time)" value={rupees(m.receivables)} tone="ledger" />
          <StepCard label="Waiting in queue now" value={count(a.tokens.waitingNow)} hint="Tokens not billed yet" />
          <StepCard label="Upcoming appointments" value={count((a.appointments?.pending || 0) + (a.appointments?.confirmed || 0))} hint="Pending + confirmed in this period" />
          <StepCard label="Average bill" value={rupees(a.kpis.averageBill)} />
        </Step>
      </DashSection>

      <DashSection eyebrow="Payment reconciliation" title="Payment summary" description={`${a.period?.displayRange || ''} · Split bills are shown once, separately from cash and online bills.`}
        action={<span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{count(ps.receivedBills + ps.credit.bills)} bills</span>}>
        <PlainTable
          rowKey={(row) => row.label}
          columns={[
            { key: 'label', label: 'Payment method', render: (row) => <span className="inline-flex items-center gap-2 font-medium text-stone-800"><row.icon className={`h-4 w-4 ${row.iconClass}`} aria-hidden="true" />{row.label}</span> },
            { key: 'amount', label: 'Amount', align: 'right', className: 'font-semibold text-stone-900', render: (row) => money(row.amount) },
            { key: 'bills', label: 'Bills / entries', align: 'right', render: (row) => (row.bills === null ? <span className="text-stone-300">—</span> : count(row.bills)) },
          ]}
          rows={[
            { label: 'Cash bills', icon: Banknote, iconClass: 'text-amber-600', amount: ps.cash.total, bills: ps.cash.bills },
            { label: 'Online / bank bills', icon: Landmark, iconClass: 'text-sky-600', amount: ps.online.total, bills: ps.online.bills },
            { label: 'Split payment bills', icon: Layers, iconClass: 'text-violet-600', amount: ps.split.total, bills: ps.split.bills },
            { label: 'Credit collected in cash', icon: HandCoins, iconClass: 'text-stone-400', amount: p.creditCollectionsCash, bills: null },
            { label: 'Credit collected online', icon: HandCoins, iconClass: 'text-stone-400', amount: p.creditCollectionsOnline, bills: null },
          ]}
          total={{ amount: <span className="text-emerald-700">{money(m.totalReceived)}</span>, bills: count(ps.receivedBills) }}
        />
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-stone-500"><AlertCircle className="h-3.5 w-3.5 text-amber-500" />Sold on credit and not received: {money(r.creditSales)} across {count(ps.credit.bills)} bill{ps.credit.bills === 1 ? '' : 's'} — not counted as money received.</p>
      </DashSection>

      <DashSection eyebrow="Where bills came from" title="Sales by source" padded>
        <PlainTable
          rowKey={(row) => row.key}
          columns={[
            { key: 'label', label: 'Source', render: (row) => <span className="inline-flex items-center gap-2 font-semibold text-stone-800"><span className="h-2.5 w-2.5 rounded-full" style={{ background: SOURCE_COLOURS[row.key] }} />{row.label}<span className="text-xs font-normal text-stone-400">{row.share}%</span></span> },
            { key: 'bills', label: 'Bills', align: 'right', render: (row) => count(row.bills) },
            { key: 'services', label: 'Services done', align: 'right', render: (row) => count(row.services) },
            { key: 'gross', label: 'Sales before discount', align: 'right', render: (row) => money(row.gross) },
            { key: 'total', label: 'Billed total', align: 'right', className: 'font-bold text-stone-900', render: (row) => money(row.total) },
          ]}
          rows={a.sources}
          total={{ bills: count(a.sourceTotals.bills), services: count(a.sourceTotals.services), gross: money(a.sourceTotals.gross), total: money(a.sourceTotals.total) }}
        />
        <p className="mt-3 text-xs text-stone-500">A bill counts as Appointment when it was raised from a checked-in booking, as Token when it closed a queue token, otherwise as a direct walk-in bill. Voids are not deducted here (see step 2).</p>
      </DashSection>

      <div>
        <GroupHeading title="Cash position" description="Where the money sits now, and how the drawer reconciles." />
        <div className="grid gap-4 lg:grid-cols-3">
          <LedgerPanel title="Money position" tone="ledger" rows={[
            { section: 'Cash drawer' },
            { label: 'Total cash in', value: f.cashIn, sign: '+' },
            { label: 'Total cash out', value: f.cashOut, sign: '-' },
            { label: 'Net cash movement', value: c.netCashMovement, strong: true, sub: 'this period' },
            { label: 'Cash in hand', value: c.netCashInHand, strong: true, sub: c.expectedCashSource === 'live' ? 'live drawer' : 'at last close' },
            { section: 'Online' },
            { label: 'Online salon sales', value: o.totalOnlineIn, sub: `eSewa ${money(o.esewaPhonePay)} · Bank ${money(o.bankQr)}` },
            { label: 'Credit collected online', value: o.creditCollectionsOnline },
            { label: 'Total online received', value: f.onlineIn, strong: true },
            { section: 'Online balance' },
            { label: 'Net online movement', value: o.netOnlineBalance, strong: true, sub: 'online in less online out' },
          ]} footnote="Cash in hand is the drawer the cashier reconciles (live while the store is open, otherwise the last close). Net cash movement is what trading added over the period; floats and count differences make the two differ." />
          <LedgerPanel title="Cash in / cash out" tone="cash" rows={[
            { label: 'Opening cash', value: c.startingCash, sub: 'first opening in the period' },
            { section: 'Cash in' },
            { label: 'Sales settled in cash', value: c.cashCollected, sign: '+' },
            { label: 'Credit collected in cash', value: c.creditCollectionsCash, sign: '+' },
            c.cashAdded ? { label: 'Float added at store open', value: c.cashAdded, sign: '+' } : null,
            { label: 'Total in', value: f.cashIn, strong: true },
            { section: 'Cash out' },
            { label: 'Operating expenses & purchases', value: c.cashExpenses, sign: '-' },
            c.cashSalary ? { label: 'Salary & advances', value: c.cashSalary, sign: '-' } : null,
            { label: 'Moved to savings', value: c.cashSavings, sign: '-' },
            { label: 'Refunds', value: c.cashRefunds, sign: '-' },
            c.cashRemoved ? { label: 'Float removed at store open', value: c.cashRemoved, sign: '-' } : null,
            { label: 'Total out', value: f.cashOut, strong: true },
            c.sessionDifferences ? { label: c.sessionDifferences < 0 ? 'Cash short at closes' : 'Cash over at closes', value: Math.abs(c.sessionDifferences), sign: c.sessionDifferences < 0 ? '-' : '+' } : null,
            { label: 'Closing cash (drawer)', value: c.expectedCash ?? c.netCashInHand, strong: true },
          ]} />
          <LedgerPanel title="Cash in bank / online" tone="online" rows={[
            { label: 'Opening balance', value: 'Not tracked', muted: true },
            { label: 'Online sales', value: o.totalOnlineIn, sign: '+' },
            { label: 'Credit collected online', value: o.creditCollectionsOnline, sign: '+' },
            { label: 'Refunds', value: o.onlineRefunds, sign: '-' },
            { label: 'Expenses & purchases', value: o.onlineExpenses, sign: '-' },
            o.onlineSalary ? { label: 'Salary & advances', value: o.onlineSalary, sign: '-' } : null,
            { label: 'Moved to savings', value: o.onlineSavings, sign: '-' },
            { label: 'Net online movement', value: o.netOnlineBalance, strong: true },
          ]} footnote="The POS does not hold a bank opening balance, so this is the period's online movement." />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <DrawerCountPanel c={c} />
          <LedgerPanel title="Recorded cash movements" tone="neutral" rows={[
            { label: 'Float added at store open', value: c.cashAdded, sign: c.cashAdded ? '+' : '' },
            { label: 'Float removed at store open', value: c.cashRemoved, sign: c.cashRemoved ? '-' : '' },
            { label: 'Savings deposits (cash)', value: m.savings.fromCash, strong: true },
            { label: 'Savings deposits (online)', value: m.savings.fromOnline },
          ]} footnote="Drawer transfers and savings move the salon's own money. They are not sales and not operating expenses." />
          <LedgerPanel title="Sessions & closes" tone="neutral" rows={[
            { label: 'Store sessions', value: count(a.controls.sessions) },
            { label: 'Same-day reopens', value: count(a.controls.reopenedSessions) },
            { label: 'Short closes', value: `${count(a.controls.shortages)} · ${money(a.controls.shortageTotal)}` },
            { label: 'Over closes', value: `${count(a.controls.overages)} · ${money(a.controls.overageTotal)}` },
            { label: 'Force-closed sessions', value: count(a.controls.forceClosed) },
            { label: 'Last close by', value: c.closedBy || '—' },
          ]} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel title="Net sales trend" note="After discounts and voids">
          <div className="h-[230px]"><TrendChart rows={a.salesTrend} series={[{ key: 'netSales', label: 'Net sales', color: TONES.online.hex }]} /></div>
        </ChartPanel>
        <ChartPanel title="By hour" note="Billed value by Nepal hour"><ColumnBars rows={a.byHour} color="#44403c" /></ChartPanel>
        <ChartPanel title="By day of week" note="Billed value by weekday"><ColumnBars rows={a.byWeekday} color={TONES.ledger.hex} /></ChartPanel>
        <ChartPanel title="Money received by method">
          <RingDonut centerLabel="Received" rows={[
            { label: 'Cash', value: p.cash, color: '#1C1917' },
            { label: 'eSewa / PhonePay', value: p.esewaPhonePay, color: TONES.inflow.hex },
            { label: 'Bank QR', value: p.bankQr, color: TONES.online.hex },
            { label: 'Credit collected', value: a.payments.creditCollected, color: TONES.ledger.hex },
          ]} />
        </ChartPanel>
        <ChartPanel title="By group" note="Line value before bill discounts">
          <RingDonut centerLabel="Sales" rows={[{ label: 'Services', value: r.serviceRevenue, color: TONES.ops.hex }, { label: 'Retail products', value: r.productRevenue, color: '#C9A55C' }]} />
        </ChartPanel>
        <ChartPanel title="By service category">
          <RingDonut centerLabel="Service sales" rows={a.services.categories.map((row) => ({ label: row.category, value: row.revenue, sub: `${count(row.quantity)} done` }))} />
        </ChartPanel>
      </div>

      <div className="grid grid-cols-1 gap-5 rounded-2xl border border-stone-200/80 bg-white px-5 py-5 shadow-[0_1px_3px_rgba(28,25,23,0.05)] sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat icon={TrendingUp} tone="inflow" label="Gross profit" value={rupees(pl?.grossProfit)} />
        <MiniStat icon={ReceiptText} tone="outflow" label="Operating expenses" value={rupees(pl?.operatingExpenses)} />
        <MiniStat icon={Scale} tone="ledger" label="Operating profit" value={rupees(pl?.operatingResult)} />
        <MiniStat icon={Wallet} tone="cash" label="Cash in hand" value={rupees(c.netCashInHand)} />
        <MiniStat icon={Landmark} tone="online" label="Bank / online" value={rupees(o.netOnlineBalance)} />
        <MiniStat icon={HandCoins} tone="ledger" label="Receivables" value={rupees(m.receivables)} />
        <MiniStat icon={Truck} tone="outflow" label="Payables" value={rupees(m.payables)} />
        <MiniStat icon={ShoppingCart} tone="cash" label="Purchases" value={rupees(m.purchases.total)} />
      </div>
      <div className="-mt-2 flex flex-wrap gap-2">
        <Link href="/admin/executive-summary" className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"><Briefcase className="h-4 w-4" />View P&amp;L in Summary</Link>
        <Link href="/admin/reports" className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"><PiggyBank className="h-4 w-4" />Full finance reports</Link>
      </div>

      <DashSection eyebrow="Payment records" title="Bill-level payment details" description="Every bill in the period by how it was paid. Click a bill number to open it.">
        {a.paymentRecords.truncated ? <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Showing the latest 2,000 bills — use Reports → Sales & Invoices for the full list.</p> : null}
        <div className="space-y-4">
          <ReportTable title={`Cash bills (${count(ps.cash.bills)})`} columns={[...RECORD_COLUMNS.base, ...RECORD_COLUMNS.cash]} rows={byMethod('cash')} totals={{ total: ps.cash.total }} calendarSystem={calendarSystem} defaultPageSize={25} exportName="Cash bills" />
          <ReportTable title={`Online / bank bills (${count(ps.online.bills)})`} columns={[...RECORD_COLUMNS.base, ...RECORD_COLUMNS.online]} rows={byMethod('online')} totals={{ total: ps.online.total }} calendarSystem={calendarSystem} defaultPageSize={25} exportName="Online bills" />
          <ReportTable title={`Split payment bills (${count(ps.split.bills)})`} columns={[...RECORD_COLUMNS.base, ...RECORD_COLUMNS.split]} rows={byMethod('split')} totals={{ cash: ps.split.cash, online: ps.split.online, total: ps.split.total }} calendarSystem={calendarSystem} defaultPageSize={25} exportName="Split bills" />
          <ReportTable title={`Credit / due bills (${count(ps.credit.bills)})`} columns={[...RECORD_COLUMNS.base, ...RECORD_COLUMNS.credit]} rows={byMethod('credit')} totals={{ cash: ps.credit.cash, online: ps.credit.online, credit: ps.credit.credit, total: ps.credit.total }} calendarSystem={calendarSystem} defaultPageSize={25} exportName="Credit bills" empty="No credit bills in this period." />
        </div>
      </DashSection>
    </div>
  );
}
