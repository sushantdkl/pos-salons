'use client';

/**
 * Business Day details popup — the salon's closing report. Opens from any row of the Business
 * Day history. Shows the whole day: notes and reasons, sales, payments, every store session's
 * cash reconciliation (persisted close + note breakdown), online / bank reconciliation,
 * outflows, cash in / out and exchanges, services and staff, and every bill, expense and cash
 * entry of the day — each of which opens its own details.
 */

import { useEffect, useState } from 'react';
import { ArrowLeftRight, Banknote, CalendarDays, ChevronDown, ClipboardList, FileText, Printer, Receipt, Scissors, ShieldAlert, Wallet, X } from 'lucide-react';
import { StatusBadge, money } from '@/components/erp';
import { erpFetch } from '@/components/erp/use-report';
import { fmtDate, fmtDateTime, fmtTime } from '@/lib/dates/display';
import { CASH_DENOMINATIONS } from '@/lib/business-day/denominations';
import { BillDetailDrawer } from '@/components/bills/bill-detail';
import { ExpenseDetailPanel } from '@/components/expenses/expense-detail';
import { MovementDetailPanel } from '@/components/cash/movement-workspace';

const METHOD = { cash: 'Cash', online: 'Online / QR', credit: 'Credit', split: 'Split', bank_transfer: 'Bank', mixed: 'Cash + online' };
const MOVEMENT_TYPE = { CASH_IN: 'Cash In', CASH_OUT: 'Cash Out', EXCHANGE: 'Exchange' };

function Heading({ icon: Icon, children, note }) {
  return (
    <div className="mb-2.5">
      <h3 className="flex items-center gap-2 text-sm font-extrabold text-stone-900"><Icon className="h-4 w-4 text-stone-500" aria-hidden="true" />{children}</h3>
      {note ? <p className="mt-0.5 text-xs text-stone-500">{note}</p> : null}
    </div>
  );
}

function Kpi({ label, value, tone = '' }) {
  return (
    <div className="rounded-lg border border-stone-200 px-3 py-2">
      <p className="text-[11px] font-semibold text-stone-500">{label}</p>
      <p className={`mt-0.5 text-[15px] font-extrabold tabular-nums ${tone || 'text-stone-900'}`}>{value}</p>
    </div>
  );
}

function Line({ label, value, sign, strong = false }) {
  return (
    <div className={`flex justify-between gap-3 py-1 text-sm ${strong ? 'border-t border-white/15 pt-2 font-extrabold' : ''}`}>
      <span className={strong ? '' : 'opacity-80'}>{label}</span>
      <span className="tabular-nums">{sign ? `${sign} ` : ''}{money(value)}</span>
    </div>
  );
}

function Section({ children }) {
  return <section className="border-t border-stone-200 px-5 py-4 sm:px-6">{children}</section>;
}

function SessionCard({ session, total, forAdmin }) {
  const [open, setOpen] = useState(false);
  const c = session.calculation;
  const closed = session.status === 'CLOSED';
  const diff = session.difference || 0;
  const rows = CASH_DENOMINATIONS.map((value) => ({ value, count: Number(session.denominations?.[String(value)] || 0) }));
  const counted = rows.reduce((sum, row) => sum + row.value * row.count, 0);
  return (
    <div className="overflow-hidden rounded-xl bg-[#171E2D] text-white">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.06em] text-stone-300">
        <span>Store session {session.sessionNumber} of {total} · cash reconciliation</span>
        <span className="normal-case tracking-normal text-stone-400">{fmtTime(session.openedAt)} → {session.closedAt ? fmtTime(session.closedAt) : 'still open'}{session.openedBy ? ` · opened by ${session.openedBy}` : ''}{session.closedBy ? ` · closed by ${session.closedBy}` : ''}</span>
      </div>
      <div className="grid gap-px bg-white/10 md:grid-cols-2">
        <div className="bg-[#171E2D] p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400">Expected cash</p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums text-[#E9C77B]">{money(session.expectedCash)}</p>
          <button type="button" onClick={() => setOpen(!open)} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-stone-300 hover:text-white" aria-expanded={open}>
            <ChevronDown className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`} />Cash calculation
          </button>
          {open ? (
            <div className="mt-2 text-stone-100">
              <Line label="Starting cash" value={c.startingCash} />
              <Line label="Cash sales" value={c.cashSales} sign="+" />
              <Line label="Credit collected in cash" value={c.creditCollectionsCash} sign="+" />
              <Line label="Cash In (owner / bank / safe)" value={c.ownerCashIn} sign="+" />
              <Line label="Exchange — cash received" value={c.exchangeCashIn} sign="+" />
              {forAdmin ? (
                <>
                  <Line label="Cash expenses" value={c.operatingExpensesCash} sign="−" />
                  <Line label="Salary / advances in cash" value={c.salaryCash} sign="−" />
                </>
              ) : <Line label="Cash expenses & salary" value={c.cashExpenses} sign="−" />}
              <Line label="Cash to savings" value={c.cashSavingsOut} sign="−" />
              <Line label="Cash refunds (voids)" value={c.cashRefunds} sign="−" />
              <Line label="Cash Out (owner / bank / safe)" value={c.ownerCashOut} sign="−" />
              <Line label="Exchange — cash paid out" value={c.exchangeCashOut} sign="−" />
              <Line label={closed ? 'Recalculated now' : 'Expected now'} value={c.expectedCash} strong />
              {closed && Math.abs(c.expectedCash - session.expectedCash) > 0.01 ? <p className="mt-1 text-[11px] text-amber-300">A record in this session changed after it was closed. The saved close ({money(session.expectedCash)}) is what the day reports.</p> : null}
            </div>
          ) : null}
          {session.openingNote ? <p className="mt-3 text-xs italic text-stone-300">Opening note: “{session.openingNote}”</p> : null}
        </div>
        <div className="bg-white p-4 text-stone-900">
          {closed ? (
            <>
              <p className="text-[11px] font-bold uppercase tracking-wide text-stone-500">Counted cash</p>
              <p className="mt-1 text-2xl font-extrabold tabular-nums">{money(session.countedCash)}</p>
              {session.denominations ? (
                <table className="mt-3 w-full text-xs">
                  <thead><tr className="border-b border-stone-200 text-left text-[10px] uppercase tracking-wide text-stone-500"><th className="py-1">Note</th><th className="py-1 text-right">Count</th><th className="py-1 text-right">Amount</th></tr></thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.value} className={row.count ? 'text-stone-900' : 'text-stone-300'}>
                        <td className="py-0.5">Rs {row.value.toLocaleString('en-IN')}</td>
                        <td className="py-0.5 text-right tabular-nums">{row.count}</td>
                        <td className="py-0.5 text-right tabular-nums">{money(row.value * row.count)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-stone-900 font-bold"><td className="py-1">Total</td><td className="py-1 text-right tabular-nums">{rows.reduce((sum, row) => sum + row.count, 0)}</td><td className="py-1 text-right tabular-nums">{money(counted)}</td></tr>
                  </tbody>
                </table>
              ) : <p className="mt-2 text-xs text-stone-400">The note breakdown was not recorded for this close.</p>}
              <div className={`mt-3 rounded-lg border-l-4 px-3 py-2 ${diff === 0 ? 'border-emerald-500 bg-emerald-50' : diff < 0 ? 'border-rose-500 bg-rose-50' : 'border-amber-500 bg-amber-50'}`}>
                <p className="text-[11px] font-bold uppercase tracking-wide text-stone-600">{diff === 0 ? 'Matched' : diff < 0 ? 'Short' : 'Over'}</p>
                <p className={`text-lg font-extrabold tabular-nums ${diff === 0 ? 'text-emerald-700' : diff < 0 ? 'text-rose-700' : 'text-amber-700'}`}>{money(Math.abs(diff))}</p>
              </div>
              {session.closingNote ? <p className="mt-2 text-xs text-stone-600"><strong>Closing note:</strong> {session.closingNote}</p> : null}
              {session.forceClosed ? <p className="mt-1 text-xs text-rose-700"><strong>Force closed:</strong> {session.forceCloseReason || 'no reason recorded'}</p> : null}
            </>
          ) : (
            <div className="grid h-full place-items-center text-center">
              <div><StatusBadge status="OPEN" /><p className="mt-2 text-sm text-stone-500">This session is still open — the cash has not been counted yet.</p></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ClickTable({ columns, rows, onRow, empty }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200">
      <table className="w-full min-w-[560px] text-sm">
        <thead><tr className="bg-stone-50 text-left text-[10.5px] font-bold uppercase tracking-[0.05em] text-stone-500">{columns.map((column) => <th key={column.key} className={`px-3 py-2 ${column.right ? 'text-right' : ''}`}>{column.label}</th>)}</tr></thead>
        <tbody className="divide-y divide-stone-100">
          {rows.length === 0 ? <tr><td colSpan={columns.length} className="px-3 py-5 text-center text-stone-400">{empty}</td></tr> : rows.map((row) => (
            <tr key={row.id} onClick={() => onRow(row)} className="cursor-pointer hover:bg-amber-50/60">
              {columns.map((column) => <td key={column.key} className={`px-3 py-2 ${column.right ? 'text-right tabular-nums' : ''}`}>{column.render ? column.render(row) : row[column.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BusinessDayReport({ dayId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [bill, setBill] = useState(null);
  const [expense, setExpense] = useState(null);
  const [movement, setMovement] = useState(null);

  useEffect(() => {
    let live = true;
    erpFetch(`/api/store/history/${dayId}`).then((json) => { if (live) setData(json); }).catch((loadError) => { if (live) setError(loadError.message); });
    return () => { live = false; };
  }, [dayId]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape' && !bill && !expense && !movement) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, bill, expense, movement]);

  const d = data?.day;
  const s = data?.sales;
  const p = data?.payments;
  const forAdmin = data ? data.outflows.salary !== undefined : false;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-900/50 p-2 sm:p-6" role="dialog" aria-modal="true" aria-label="Business day details" onClick={onClose}>
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl print:max-w-none print:shadow-none" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-3 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-stone-500"><CalendarDays className="h-4 w-4" />Closing report</p>
            <h2 className="mt-1 text-xl font-extrabold text-stone-950">{d ? fmtDate(d.businessDate) : '…'}</h2>
            {d ? <p className="text-sm text-stone-500">{d.status === 'OPEN' ? `Open since ${fmtDateTime(d.openedAt)}` : `Closed ${d.closedAt ? fmtDateTime(d.closedAt) : ''}`}{d.openedBy ? ` · opened by ${d.openedBy}` : ''}{d.closedBy && d.status !== 'OPEN' ? ` · closed by ${d.closedBy}` : ''}</p> : null}
          </div>
          <div className="print-hide flex shrink-0 items-center gap-2">
            {d ? <StatusBadge status={d.status === 'OPEN' ? 'OPEN' : 'CLOSED'} /> : null}
            <button type="button" onClick={() => window.print()} aria-label="Print" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100"><Printer className="h-5 w-5" /></button>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100"><X className="h-5 w-5" /></button>
          </div>
        </header>

        {error ? <p className="mx-6 mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
        {!data && !error ? <p className="py-16 text-center text-sm text-stone-400">Loading the day…</p> : null}

        {data ? (
          <>
            <Section>
              <Heading icon={FileText}>Notes &amp; closing history</Heading>
              {d.notes.length ? (
                <ul className="space-y-1.5 text-sm">
                  {d.notes.map((note, index) => <li key={index} className="rounded-lg bg-stone-50 px-3 py-2"><span className="text-[11px] font-bold uppercase tracking-wide text-stone-500">Session {note.session} · {note.kind}</span><p className="text-stone-800">{note.text}</p></li>)}
                </ul>
              ) : <p className="text-sm text-stone-400">No notes or reasons were written for this day.</p>}
            </Section>

            <Section>
              <Heading icon={Receipt}>Sales summary</Heading>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <Kpi label="Gross billed" value={money(s.grossBilled)} tone="text-emerald-700" />
                <Kpi label="Discounts" value={money(s.discounts)} tone="text-rose-700" />
                <Kpi label="Bills total" value={money(s.finalizedTotal)} />
                <Kpi label="Voided (cancelled)" value={money(s.voidedSales)} tone="text-rose-700" />
                <Kpi label="Net sales" value={money(s.netSales)} tone="text-emerald-700" />
                <Kpi label="Tax / service charge" value={money(s.tax + s.serviceCharge)} />
                <Kpi label="Bills" value={s.bills} />
                <Kpi label="Average bill" value={money(s.averageBill)} />
                <Kpi label="Services done" value={s.servicesSold} />
                <Kpi label="Products sold" value={s.productsSold} />
                <Kpi label="On credit" value={money(s.creditSales)} tone="text-amber-700" />
                <Kpi label="Loyalty rewards" value={money(s.loyaltyDiscounts)} />
              </div>
              <p className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-stone-600">
                <span>Walk-in tokens <strong className="text-stone-900">{money(s.visits.walkIn.amount)}</strong> <span className="text-xs text-stone-400">({s.visits.walkIn.bills})</span></span>
                <span>Appointments <strong className="text-stone-900">{money(s.visits.appointment.amount)}</strong> <span className="text-xs text-stone-400">({s.visits.appointment.bills})</span></span>
                <span>Direct at counter <strong className="text-stone-900">{money(s.visits.direct.amount)}</strong> <span className="text-xs text-stone-400">({s.visits.direct.bills})</span></span>
              </p>
            </Section>

            <Section>
              <Heading icon={Wallet} note="Whole business-day totals across all store sessions.">Payment collection summary</Heading>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                <Kpi label="Cash collected" value={money(p.cash)} tone="text-emerald-700" />
                <Kpi label="Online / QR collected" value={money(p.online)} tone="text-sky-700" />
                <Kpi label="Credit sales (not cash)" value={money(p.creditSales)} tone="text-amber-700" />
                <Kpi label="Credit collected" value={money(p.creditCollectionsCash + p.creditCollectionsOnline)} />
                <Kpi label="Total money collected" value={money(p.totalCollected)} />
                <Kpi label="Refunds returned" value={money(p.cashRefunds + p.onlineRefunds)} tone="text-rose-700" />
                <Kpi label="Net money retained" value={money(p.netRetained)} tone="text-emerald-700" />
                <Kpi label="eSewa / PhonePay · Bank QR" value={`${money(p.esewaPhonePay)} · ${money(p.bankQr)}`} />
              </div>
            </Section>

            <Section>
              <div className="space-y-3">
                {data.sessions.length === 0 ? <p className="text-sm text-stone-400">No store session was opened on this day.</p> : data.sessions.map((session) => <SessionCard key={session.id} session={session} total={data.sessions.length} forAdmin={forAdmin} />)}
              </div>
            </Section>

            <Section>
              <Heading icon={Banknote} note="Online / QR and bank money. Never part of the physical drawer.">Online &amp; bank reconciliation</Heading>
              <p className="mb-2 flex flex-wrap gap-x-5 text-sm font-semibold"><span className="text-emerald-700">In {money(data.online.in)}</span><span className="text-rose-700">Out {money(data.online.out)}</span><span className="text-stone-900">Net {money(data.online.net)}</span></p>
              <div className="grid gap-x-8 sm:grid-cols-2">
                {data.online.lines.filter((line) => line.value).map((line) => <div key={line.label} className="flex justify-between border-b border-stone-100 py-1 text-sm"><span className="text-stone-600">{line.label}</span><span className="tabular-nums">{line.sign} {money(line.value)}</span></div>)}
              </div>
            </Section>

            <Section>
              <Heading icon={Receipt}>Outflows</Heading>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                <Kpi label="Operating expenses" value={money(data.outflows.operatingExpenses)} tone="text-rose-700" />
                <Kpi label="Cash expenses" value={money(data.outflows.operatingExpensesCash)} tone="text-rose-700" />
                <Kpi label="Online expenses" value={money(data.outflows.operatingExpensesOnline)} tone="text-rose-700" />
                {forAdmin ? <Kpi label="Salary & advances" value={money(data.outflows.salary)} tone="text-violet-700" /> : null}
                <Kpi label="To savings" value={money(data.outflows.savings)} />
                <Kpi label="Refunds returned" value={money(data.outflows.refunds)} tone="text-rose-700" />
              </div>
            </Section>

            <Section>
              <Heading icon={ArrowLeftRight} note="Not sales and not expenses — they only move business cash and online money.">Cash In / Out &amp; exchanges</Heading>
              <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                <Kpi label="Cash In" value={money(data.cashMovements.ownerCashIn)} tone="text-emerald-700" />
                <Kpi label="Cash Out" value={money(data.cashMovements.ownerCashOut)} tone="text-rose-700" />
                <Kpi label="Exchange cash in / out" value={`${money(data.cashMovements.exchangeCashIn)} / ${money(data.cashMovements.exchangeCashOut)}`} />
                <Kpi label="Exchange online in / out" value={`${money(data.cashMovements.exchangeOnlineIn)} / ${money(data.cashMovements.exchangeOnlineOut)}`} />
                <Kpi label="Exchange charges earned" value={money(data.cashMovements.exchangeFees)} tone="text-amber-700" />
              </div>
              {data.cashMovements.rows.length ? (
                <ClickTable
                  rows={data.cashMovements.rows}
                  onRow={(row) => setMovement(row.id)}
                  empty=""
                  columns={[
                    { key: 'time', label: 'Time', render: (row) => fmtTime(row.createdAt) },
                    { key: 'type', label: 'Type', render: (row) => <span><strong>{MOVEMENT_TYPE[row.type]}</strong> <span className="text-stone-500">· {row.reasonLabel}</span>{row.status === 'REVERSAL' ? <span className="ml-1 text-xs text-amber-700">(correction)</span> : row.status === 'REVERSED' ? <span className="ml-1 text-xs text-stone-400">(reversed)</span> : null}</span> },
                    { key: 'by', label: 'By', render: (row) => row.createdBy || '—' },
                    { key: 'amount', label: 'Amount', right: true, render: (row) => money(row.amount) },
                  ]}
                />
              ) : null}
            </Section>

            <Section>
              <Heading icon={Scissors}>Services, staff &amp; queue</Heading>
              <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Kpi label="Tokens issued" value={data.services.tokens.generated} />
                <Kpi label="Tokens billed" value={data.services.tokens.billed} tone="text-emerald-700" />
                <Kpi label="Cancelled / no-show" value={data.services.tokens.cancelled} tone="text-rose-700" />
                <Kpi label="Left waiting" value={data.services.tokens.waiting} tone="text-amber-700" />
              </div>
              {data.services.topServices.length ? (
                <p className="mb-3 text-sm"><span className="mr-2 text-[11px] font-bold uppercase tracking-wide text-stone-500">Top services</span>{data.services.topServices.map((row) => <span key={row.name} className="mr-4 inline-block"><strong>{row.name}</strong> <span className="text-stone-500">{row.quantity}×</span></span>)}</p>
              ) : null}
              {data.services.staff.length ? (
                <div className="overflow-x-auto rounded-lg border border-stone-200">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-stone-50 text-left text-[10.5px] font-bold uppercase tracking-[0.05em] text-stone-500"><th className="px-3 py-2">Staff</th><th className="px-3 py-2 text-right">Services</th><th className="px-3 py-2 text-right">Customers</th><th className="px-3 py-2 text-right">Revenue</th>{forAdmin ? <th className="px-3 py-2 text-right">Commission</th> : null}</tr></thead>
                    <tbody className="divide-y divide-stone-100">
                      {data.services.staff.map((row) => <tr key={row.staff}><td className="px-3 py-2 font-semibold">{row.staff}</td><td className="px-3 py-2 text-right tabular-nums">{row.services}</td><td className="px-3 py-2 text-right tabular-nums">{row.customers}</td><td className="px-3 py-2 text-right tabular-nums">{money(row.revenue)}</td>{forAdmin ? <td className="px-3 py-2 text-right tabular-nums text-violet-700">{money(row.commission)}</td> : null}</tr>)}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-sm text-stone-400">No services recorded.</p>}
            </Section>

            <Section>
              <Heading icon={ClipboardList} note="Tap a bill for its full details, reprint or corrections.">Bills ({data.bills.length})</Heading>
              <ClickTable
                rows={data.bills}
                onRow={(row) => setBill(row.id)}
                empty="No bills on this day."
                columns={[
                  { key: 'bill', label: 'Bill', render: (row) => <div><span className="font-bold text-indigo-700">{row.billNumber}</span><p className="max-w-56 truncate text-xs text-stone-500">{row.items}</p></div> },
                  { key: 'time', label: 'Time', render: (row) => fmtTime(row.time) },
                  { key: 'customer', label: 'Customer' },
                  { key: 'staff', label: 'Staff', render: (row) => row.staff || '—' },
                  { key: 'method', label: 'Paid by', render: (row) => METHOD[row.paymentMethod] || row.paymentMethod },
                  { key: 'status', label: 'Status', render: (row) => <StatusBadge status={String(row.status).toLowerCase() === 'cancelled' ? 'CANCELLED' : 'PAID'} /> },
                  { key: 'total', label: 'Total', right: true, render: (row) => money(row.total) },
                ]}
              />
            </Section>

            <Section>
              <Heading icon={Receipt} note="Tap an expense for its details.">Expenses ({data.expenses.length})</Heading>
              <ClickTable
                rows={data.expenses}
                onRow={(row) => setExpense(row.id)}
                empty="No expenses on this day."
                columns={[
                  { key: 'time', label: 'Time', render: (row) => fmtTime(row.createdAt) },
                  { key: 'title', label: 'Expense', render: (row) => <strong>{row.title}</strong> },
                  { key: 'category', label: 'Category' },
                  { key: 'method', label: 'Paid with', render: (row) => METHOD[row.paymentMethod] || row.paymentMethod },
                  { key: 'by', label: 'By', render: (row) => row.createdBy || '—' },
                  { key: 'amount', label: 'Amount', right: true, render: (row) => money(row.amount) },
                ]}
              />
            </Section>

            {data.voids.length ? (
              <Section>
                <Heading icon={ShieldAlert}>Cancelled bills</Heading>
                <ClickTable
                  rows={data.voids}
                  onRow={(row) => setBill(row.billId)}
                  empty=""
                  columns={[
                    { key: 'bill', label: 'Bill', render: (row) => <span className="font-bold text-indigo-700">{row.billNumber}</span> },
                    { key: 'reason', label: 'Reason' },
                    { key: 'by', label: 'By' },
                    { key: 'amount', label: 'Amount', right: true, render: (row) => money(row.amount) },
                  ]}
                />
              </Section>
            ) : null}

            <Section>
              <Heading icon={ShieldAlert}>Issues before closing</Heading>
              {data.issues.length ? (
                <ul className="space-y-1.5">{data.issues.map((issue, index) => <li key={index} className={`rounded-lg px-3 py-2 text-sm ${issue.tone === 'outflow' ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-900'}`}>{issue.text}</li>)}</ul>
              ) : <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">No unresolved issues — the drawer matched and nothing was left pending.</p>}
            </Section>
          </>
        ) : null}
      </div>
      <div onClick={(event) => event.stopPropagation()}>
        {bill ? <BillDetailDrawer billId={bill} onClose={() => setBill(null)} /> : null}
        {expense ? <ExpenseDetailPanel id={expense} onClose={() => setExpense(null)} /> : null}
        {movement ? <MovementDetailPanel id={movement} canReverse={false} onClose={() => setMovement(null)} /> : null}
      </div>
    </div>
  );
}
