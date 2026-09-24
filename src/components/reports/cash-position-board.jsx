'use client';

/**
 * CASH POSITION board — where the money sits now and how the drawer reconciles.
 * Six panels (Money Position · Cash Ledger Balance · Cash In / Cash Out · Drawer Count ·
 * Recorded Cash Movements · Cash in Bank / Online). Every figure comes from the Summary
 * service (cashPosition / onlinePosition, incl. cashPosition.board); nothing is summed here.
 */

import { money } from '@/components/erp';
import { CASH_DENOMINATIONS } from '@/lib/business-day/denominations';

const PANEL = {
  indigo: { head: 'bg-indigo-100/80 text-indigo-900', body: 'bg-indigo-50/40', bar: 'border-l-indigo-500' },
  amber: { head: 'bg-amber-100/80 text-amber-900', body: 'bg-amber-50/40', bar: 'border-l-amber-500' },
  violet: { head: 'bg-violet-100/80 text-violet-900', body: 'bg-violet-50/40', bar: 'border-l-violet-500' },
  stone: { head: 'bg-stone-50 text-stone-900', body: 'bg-white', bar: 'border-l-stone-200' },
  sky: { head: 'bg-sky-100/70 text-sky-900', body: 'bg-white', bar: 'border-l-sky-500' },
};

/** "+ Rs 6,317.50" green, "- Rs 2,820.50" red, plain otherwise. */
function Amount({ value, sign, strong }) {
  if (typeof value === 'string') return <span className="text-stone-400">{value}</span>;
  const n = Number(value || 0);
  const tone = sign === '+' ? 'text-emerald-700' : sign === '-' ? 'text-rose-600' : n < 0 ? 'text-rose-600' : 'text-stone-900';
  const prefix = sign === '+' ? '+ ' : sign === '-' ? '- ' : '';
  return <span className={`whitespace-nowrap tabular-nums ${strong ? 'font-bold' : ''} ${sign || n < 0 ? tone : strong ? 'text-stone-900' : 'text-stone-800'}`}>{prefix}{money(sign ? Math.abs(n) : n)}</span>;
}

function Panel({ title, tone = 'stone', rows, children, note }) {
  const t = PANEL[tone];
  return (
    <section className={`flex min-w-0 flex-col overflow-hidden border border-stone-200 border-l-4 ${t.bar} ${t.body}`}>
      <h3 className={`border-b border-stone-200 px-4 py-2.5 text-[13px] font-bold ${t.head}`}>{title}</h3>
      <div className="flex-1 divide-y divide-stone-200/70 text-[12.5px]">
        {rows.filter(Boolean).map((row, index) => (row.section ? (
          <p key={`s${index}`} className="px-4 pb-1.5 pt-3 text-[10.5px] font-bold uppercase tracking-[0.07em] text-stone-500">{row.section}</p>
        ) : (
          <div key={`${row.label}-${index}`} className={`flex items-center justify-between gap-3 px-4 py-2.5 ${row.strong ? 'bg-white/60' : ''}`}>
            <span className={`min-w-0 ${row.strong ? 'font-bold text-stone-900' : 'text-stone-700'}`}>
              {row.label}{row.hint ? <span className="ml-1.5 text-[10.5px] font-normal text-stone-400">{row.hint}</span> : null}
            </span>
            <Amount value={row.value} sign={row.sign} strong={row.strong} />
          </div>
        )))}
        {children}
      </div>
      {note ? <p className="border-t border-stone-200/70 px-4 py-3 text-[11px] leading-relaxed text-stone-500">{note}</p> : null}
    </section>
  );
}

export function CashPositionBoard({ cash: c, online: o, isAdmin = true }) {
  if (!c) return null;
  const b = c.board || {};
  const counted = c.countedCash ?? c.lastCountedCash;
  const counts = c.denominations;
  const notes = counts ? CASH_DENOMINATIONS.map((note) => ({ note, n: Number(counts[note] ?? counts[String(note)] ?? 0) })) : [];
  const diff = c.cashDifference;
  const gap = b.ledgerGap;

  return (
    <section className="min-w-0">
      <div className="mb-3 border-l-4 border-amber-500 pl-3">
        <h2 className="text-[15px] font-bold text-stone-900">Cash Position</h2>
        <p className="text-xs text-stone-500">Where the money sits now, and how the drawer reconciles.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title="Money Position"
          tone="indigo"
          rows={[
            { section: 'Cash drawer' },
            { label: 'Total Cash In', value: b.totalIn, sign: '+' },
            { label: 'Total Cash Out', value: b.totalOut, sign: '-' },
            { label: 'Cash Ledger Balance', hint: 'accounting record', value: b.ledgerBalance, strong: true },
            { label: 'Expected Drawer Cash', hint: c.expectedCashSource === 'live' ? 'live drawer' : 'last drawer close', value: c.expectedCash ?? '—', strong: true },
            gap !== null && gap !== undefined ? { label: 'Ledger-to-Drawer Gap', hint: gap < 0 ? 'drawer is higher' : gap > 0 ? 'drawer is lower' : 'matched', value: gap, sign: gap < 0 ? '-' : gap > 0 ? '+' : '' } : null,
            { section: 'Online' },
            { label: 'Online Salon Sales', hint: 'services & products', value: o.totalOnlineIn },
            { label: 'Credit Collected Online', value: o.creditCollectionsOnline },
            { label: 'Total Online Received', value: o.salesAndCollections, strong: true },
            { section: 'Online balance' },
            { label: 'Online in Bank / Wallets', hint: 'online receipts less online payments', value: o.netOnlineBalance, strong: true },
          ]}
          note="Cash Ledger Balance is the accounting account for the selected period. Expected Drawer Cash is the last physical drawer calculation (opening drawer cash + movements of that store session), so they differ by any count shortage or overage. Every non-cash payment is recorded in the single Online balance."
        />
        <Panel
          title="Cash Ledger Balance"
          tone="amber"
          rows={[
            { label: 'Opening Balance', value: c.startingCash },
            { label: 'Opening Adjustment', value: b.openingAdjustment, sign: b.openingAdjustment > 0 ? '+' : b.openingAdjustment < 0 ? '-' : '' },
            { label: 'Sales & Collections', value: b.salesAndCollections, sign: '+' },
            { label: 'Refunds', value: c.cashRefunds, sign: '-' },
            isAdmin
              ? { label: 'Purchases, Expenses & Suppliers', value: c.cashExpenses, sign: '-' }
              : { label: 'Expenses, Suppliers & Wages', value: c.cashPaidOut, sign: '-' },
            isAdmin ? { label: 'Salary & Advances', value: c.cashSalary ?? 0, sign: '-' } : null,
            { label: 'Savings', value: c.cashSavings, sign: '-' },
            { label: 'Closing Cash', value: b.ledgerBalance, strong: true },
          ]}
        />
        <Panel
          title="Cash In / Cash Out"
          tone="amber"
          rows={[
            { label: 'Opening Cash', value: c.startingCash },
            { section: 'Cash in' },
            { label: 'Sales settled in cash', value: c.cashCollected, sign: '+' },
            c.creditCollectionsCash ? { label: 'Credit collected in cash', value: c.creditCollectionsCash, sign: '+' } : null,
            c.cashAdded ? { label: 'Float added at store open', value: c.cashAdded, sign: '+' } : null,
            { label: 'Total In', value: b.totalIn, strong: true },
            { section: 'Cash out' },
            { label: isAdmin ? 'Operating expenses & purchases' : 'Expenses & wages paid', value: isAdmin ? c.cashExpenses : c.cashPaidOut, sign: '-' },
            isAdmin && c.cashSalary ? { label: 'Salary & advances', value: c.cashSalary, sign: '-' } : null,
            { label: 'Moved to savings', value: c.cashSavings, sign: '-' },
            c.cashRefunds ? { label: 'Refunds', value: c.cashRefunds, sign: '-' } : null,
            c.cashRemoved ? { label: 'Float removed at store open', value: c.cashRemoved, sign: '-' } : null,
            c.sessionDifferences ? { label: c.sessionDifferences < 0 ? 'Cash short at close' : 'Cash over at close', value: Math.abs(c.sessionDifferences), sign: c.sessionDifferences < 0 ? '-' : '+' } : null,
            { label: 'Total Out', value: b.totalOutWithCounts, strong: true },
            { label: 'Closing Cash', value: b.drawerClosing, strong: true },
          ]}
        />

        <Panel
          title={`Drawer Count · ${b.closedSessions || 0} count${b.closedSessions === 1 ? '' : 's'}`}
          tone="violet"
          rows={[
            { label: 'Expected Drawer Cash', value: c.expectedCash ?? '—' },
            { label: 'Physically Counted Drawer Cash', hint: c.expectedCashSource === 'live' && counted !== null && counted !== undefined ? `last close ${c.lastCountedDate || ''}` : '', value: counted ?? 'Counted at close' },
            diff !== null && diff !== undefined ? { label: diff < 0 ? 'Drawer Cash Short' : diff > 0 ? 'Drawer Cash Over' : 'Drawer Matched', value: Math.abs(diff), sign: diff < 0 ? '-' : diff > 0 ? '+' : '', strong: true } : null,
          ]}
        >
          {counts ? (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-stone-500">
                  <th className="px-4 pb-1.5 pt-3 text-left">Note</th><th className="px-2 pb-1.5 pt-3 text-right">Count</th><th className="px-4 pb-1.5 pt-3 text-right">Calculation</th>
                </tr>
              </thead>
              <tbody>
                {notes.map((row) => (
                  <tr key={row.note} className={`border-t border-stone-200/70 ${row.n ? 'text-stone-800' : 'text-stone-300'}`}>
                    <td className="px-4 py-1.5">{row.note.toLocaleString('en-IN')}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{row.n}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums">{row.note.toLocaleString('en-IN')} × {row.n} = {money(row.note * row.n)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-stone-800 font-bold text-stone-900">
                  <td className="px-4 py-2">TOTAL</td>
                  <td className="px-2 py-2 text-right tabular-nums">{notes.reduce((sum, row) => sum + row.n, 0)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(counted)}</td>
                </tr>
              </tfoot>
            </table>
          ) : <p className="px-4 py-3 text-[11.5px] text-stone-500">No note breakdown yet. Count notes at Close Store and the breakdown appears here{c.expectedCashSource === 'live' ? ' (the store is open now)' : ''}.</p>}
        </Panel>
        <Panel
          title="Recorded Cash Movements"
          tone="stone"
          rows={[
            { label: 'Cash In', hint: 'float added', value: c.cashAdded, sign: c.cashAdded ? '+' : '' },
            { label: 'Cash Out', hint: 'float removed', value: c.cashRemoved, sign: c.cashRemoved ? '-' : '' },
            { label: 'Savings Deposit', value: c.cashSavings, strong: true },
          ]}
          note="Drawer floats and savings deposits are the salon moving its own money. They are not salon sales or operating expenses."
        />
        <Panel
          title="Cash in Bank / Online"
          tone="sky"
          rows={[
            { label: 'Opening Balance', value: 'Not tracked' },
            { label: 'Sales & Collections', value: o.salesAndCollections, sign: '+' },
            { label: 'Refunds', value: o.onlineRefunds, sign: '-' },
            { label: 'Purchases, Expenses & Suppliers', value: o.onlineExpenses, sign: '-' },
            isAdmin ? { label: 'Salary & Advances', value: o.onlineSalary ?? 0, sign: '-' } : null,
            { label: 'Savings', value: o.onlineSavings, sign: '-' },
            { label: 'Closing Balance', hint: 'this period', value: o.netOnlineBalance, strong: true },
          ]}
        />
      </div>
    </section>
  );
}
