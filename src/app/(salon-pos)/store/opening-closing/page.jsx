'use client';

/**
 * OPENING & CLOSING — store session lifecycle and cash reconciliation.
 *
 * Read-only view of the CURRENT store session plus the day's figures. Every lifecycle
 * action (Open / Reopen / Start Next Business Day / Close) is driven by StoreStatusBar,
 * which is the single implementation of that flow — this page never duplicates it.
 *
 * Admin and cashier both use this page; salary and other management-only figures are not
 * requested here, and the store APIs enforce the same role pair server-side.
 */

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronRight, DoorOpen, Printer, RefreshCw } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import StoreStatusBar from '@/components/store/store-status-bar';

const CARD = 'rounded-2xl border border-[#ece7e1] bg-white shadow-[0_1px_2px_rgba(40,30,20,0.04)]';

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('pos_token')}` };
}

function formatDate(iso) {
  if (!iso) return '—';
  const [year, month, day] = String(iso).slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

function formatTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-US', { timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit' });
}

function Fact({ label, value, strong = false }) {
  return (
    <div className="min-w-0">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#8a837b]">{label}</p>
      <p className={`mt-0.5 truncate text-[13.5px] ${strong ? 'font-extrabold tabular-nums text-[#17140f]' : 'font-semibold text-[#2a251f]'}`}>
        {value}
      </p>
    </div>
  );
}

function Section({ title, subtitle, children, action }) {
  return (
    <section className={`${CARD} break-inside-avoid overflow-hidden`}>
      <div className="flex flex-col gap-1 border-b border-[#f0ece6] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h2 className="text-[13px] font-bold uppercase tracking-[0.05em] text-[#17140f]">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-[#8a837b]">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value, sign = '', tone = 'default', strong = false }) {
  const toneClass = {
    default: 'text-[#2a251f]',
    positive: 'text-[#1f7a52]',
    outflow: 'text-[#b4651a]',
    alert: 'text-[#c0392b]',
    muted: 'text-[#8a837b]',
  }[tone] || 'text-[#2a251f]';
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2 sm:px-5">
      <span className={`text-[13px] ${strong ? 'font-bold text-[#17140f]' : 'font-medium text-[#4a443c]'}`}>{label}</span>
      <span className={`shrink-0 text-[13.5px] font-semibold tabular-nums ${strong ? 'font-extrabold' : ''} ${toneClass}`}>
        {sign}{value}
      </span>
    </div>
  );
}

function TotalRow({ label, value, tone = 'default' }) {
  const toneClass = { default: 'text-[#17140f]', positive: 'text-[#1f7a52]', alert: 'text-[#c0392b]' }[tone] || 'text-[#17140f]';
  return (
    <div className="flex items-baseline justify-between gap-4 border-t-2 border-[#e4ded6] bg-[#fbfaf8] px-4 py-2.5 sm:px-5">
      <span className="text-[13px] font-extrabold text-[#17140f]">{label}</span>
      <span className={`shrink-0 text-[15px] font-extrabold tabular-nums ${toneClass}`}>{value}</span>
    </div>
  );
}

function DiffBadge({ value }) {
  const state = value === 0 ? 'MATCHED' : value < 0 ? 'SHORT' : 'OVER';
  const tone = state === 'MATCHED'
    ? 'bg-[#eaf8ef] text-[#15803d]'
    : state === 'SHORT' ? 'bg-[#fdecec] text-[#dc2626]' : 'bg-[#fef4e6] text-[#b45309]';
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-bold ${tone}`}>
      {state}{value !== 0 ? ` ${formatCurrency(Math.abs(value))}` : ''}
    </span>
  );
}

/* ------------------------------------------------------------ status panel */

function StoreStatusPanel({ status }) {
  if (!status) return null;
  const open = status.state === 'OPEN';
  const session = status.session;
  const previous = status.previousSession;

  return (
    <section className={`${CARD} break-inside-avoid overflow-hidden`}>
      <div className={`flex items-center gap-2 px-4 py-3 sm:px-5 ${open ? 'bg-[#f2fbf5]' : 'bg-[#fdf4f1]'}`}>
        <span className={`h-2.5 w-2.5 rounded-full ${open ? 'bg-[#1f8a5b]' : 'bg-[#dc2626]'}`} />
        <h2 className={`text-[15px] font-extrabold uppercase tracking-[0.04em] ${open ? 'text-[#15803d]' : 'text-[#b91c1c]'}`}>
          {open ? 'Store Open' : 'Store Closed'}
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-4 px-4 py-4 sm:grid-cols-3 sm:px-5 lg:grid-cols-5">
        <Fact label="Business Day" value={formatDate(status.businessDate)} />
        {open ? (
          <>
            <Fact label="Current Session" value={`Session ${session?.sessionNumber || 1}`} />
            <Fact label="Opened" value={formatTime(session?.openedAt)} />
            <Fact label="Opened By" value={session?.openedBy || '—'} />
            <Fact label="Starting Cash" value={formatCurrency(session?.startingCash)} strong />
          </>
        ) : (
          <>
            <Fact label="Sessions Today" value={status.sessionCount ?? 0} />
            <Fact
              label="Last Session"
              value={previous ? `Session ${previous.sessionNumber} · Closed ${formatTime(previous.closedAt)}` : 'None yet'}
            />
            <Fact label="Cash Carried" value={formatCurrency(status.previousClosingCash)} strong />
          </>
        )}
      </div>
      {open && previous ? (
        <p className="border-t border-[#f0ece6] px-4 py-2 text-xs text-[#8a837b] sm:px-5">
          Previous session: Session {previous.sessionNumber} · Closed {formatTime(previous.closedAt)} with {formatCurrency(previous.countedCash)} counted.
          All sessions of {formatDate(status.businessDate)} accumulate into the same business day.
        </p>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------- history */

function HistoryRow({ day, expanded, onToggle, isAdmin }) {
  return (
    <>
      <tr className="align-top hover:bg-[#fbf8ff]">
        <td className="px-4 py-3">
          <button type="button" onClick={onToggle} className="inline-flex items-center gap-1.5 font-semibold text-[#21182f]">
            {expanded ? <ChevronDown className="h-4 w-4 text-[#6b46e5]" /> : <ChevronRight className="h-4 w-4 text-[#8a837b]" />}
            {formatDate(day.businessDate)}
          </button>
        </td>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-xs font-semibold ${day.status === 'OPEN' ? 'bg-[#eaf8ef] text-[#15803d]' : 'bg-[#f1eef6] text-[#5f5570]'}`}>
            {day.status === 'OPEN' ? 'Open' : 'Closed'}
          </span>
        </td>
        <td className="px-4 py-3 text-right tabular-nums">{day.sessions}</td>
        <td className="whitespace-nowrap px-4 py-3 text-[#62576b]">{formatTime(day.openedAt)}</td>
        <td className="whitespace-nowrap px-4 py-3 text-[#62576b]">{formatTime(day.closedAt)}</td>
        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatCurrency(day.startingCash)}</td>
        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
          {day.finalExpectedCash === null ? <span className="text-xs text-[#9a938b]">In progress</span> : formatCurrency(day.finalExpectedCash)}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
          {day.finalCountedCash === null ? <span className="text-xs text-[#9a938b]">—</span> : formatCurrency(day.finalCountedCash)}
        </td>
        <td className="px-4 py-3">
          {day.status === 'OPEN' ? <span className="text-xs text-[#9a938b]">In progress</span> : <DiffBadge value={day.difference} />}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-[#6f3cc3]">{formatCurrency(day.netSales)}</td>
        <td className="px-4 py-3 text-right tabular-nums">{day.bills}</td>
      </tr>
      {expanded ? (
        <tr>
          <td colSpan={11} className="bg-[#fbfaf8] px-4 py-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.05em] text-[#8a837b]">
              Store sessions · balances are per session and are never added together
            </p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {day.sessionDetails.length === 0 ? (
                <p className="text-xs text-[#8a837b]">No sessions recorded.</p>
              ) : day.sessionDetails.map((session) => (
                <div key={session.id} className="rounded-xl border border-[#eee8df] bg-white px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] font-bold text-[#17140f]">Session {session.sessionNumber}</p>
                    {session.status === 'OPEN'
                      ? <span className="rounded-lg bg-[#eaf8ef] px-2 py-0.5 text-[11px] font-bold text-[#15803d]">Open</span>
                      : <DiffBadge value={session.difference} />}
                  </div>
                  <p className="mt-0.5 text-[11px] text-[#8a837b]">
                    {formatTime(session.openedAt)} → {session.closedAt ? formatTime(session.closedAt) : 'still open'}
                    {session.forceClosed ? ' · force closed' : ''}
                  </p>
                  <div className="mt-1.5 grid grid-cols-3 gap-2 text-[11.5px]">
                    <div>
                      <p className="text-[10px] uppercase text-[#9a938b]">Starting</p>
                      <p className="font-semibold tabular-nums text-[#2a251f]">{formatCurrency(session.startingCash)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-[#9a938b]">Expected</p>
                      <p className="font-semibold tabular-nums text-[#2a251f]">{session.status === 'OPEN' ? '—' : formatCurrency(session.expectedCash)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-[#9a938b]">Counted</p>
                      <p className="font-semibold tabular-nums text-[#2a251f]">{session.status === 'OPEN' ? '—' : formatCurrency(session.countedCash)}</p>
                    </div>
                  </div>
                  {isAdmin && session.openedBy ? (
                    <p className="mt-1.5 text-[10.5px] text-[#9a938b]">
                      Opened by {session.openedBy}{session.closedBy ? ` · closed by ${session.closedBy}` : ''}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ page */

export default function OpeningClosingPage() {
  const [status, setStatus] = useState(null);
  const [summary, setSummary] = useState(null);
  const [blockers, setBlockers] = useState([]);
  const [days, setDays] = useState([]);
  const [expandedDay, setExpandedDay] = useState(null);
  const [role, setRole] = useState('cashier');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isAdmin = role === 'admin';

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const user = JSON.parse(localStorage.getItem('pos_user') || '{}');
      const currentRole = String(user.role || '').toLowerCase() === 'admin' ? 'admin' : 'cashier';
      setRole(currentRole);

      // Close-preview summary only exists while a session is open; a 409 is expected then.
      const summaryResponse = await fetch('/api/store/summary', { cache: 'no-store', headers: authHeaders() });
      const summaryPayload = await summaryResponse.json();
      if (summaryResponse.ok && summaryPayload.open) {
        setSummary(summaryPayload.summary);
        setBlockers(summaryPayload.blockers || []);
      } else {
        setSummary(null);
        setBlockers([]);
      }

      if (currentRole === 'admin') {
        const historyResponse = await fetch('/api/store/history?limit=30', { cache: 'no-store', headers: authHeaders() });
        const historyPayload = await historyResponse.json();
        if (historyResponse.ok) setDays(historyPayload.days || []);
      }
    } catch (err) {
      setError(err.message || 'Could not load the store session details.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const expected = summary?.expected;

  return (
    <div className="min-h-screen bg-[#f7f5f2] px-3 py-4 text-[#21182f] sm:px-5 lg:px-7 lg:py-6">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-4 sm:gap-5">
        <header className="flex flex-col gap-3 border-b border-[#e9e3db] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-[-0.02em] text-[#17140f] sm:text-[28px]">
              <DoorOpen className="h-6 w-6 text-[#6b46e5]" /> Opening &amp; Closing
            </h1>
            <p className="mt-1 text-sm text-[#7a736b]">Store session lifecycle and cash reconciliation.</p>
          </div>
          <div className="print-hide flex gap-2">
            <button type="button" onClick={() => window.print()} className="inline-flex h-[38px] items-center gap-2 rounded-[10px] border border-[#e4ded6] bg-white px-3.5 text-sm font-semibold text-[#3a342d] hover:bg-[#f7f5f2]">
              <Printer className="h-4 w-4" /> Print
            </button>
            <button type="button" onClick={loadAll} className="inline-flex h-[38px] items-center gap-2 rounded-[10px] border border-[#e4ded6] bg-white px-3.5 text-sm font-semibold text-[#3a342d] hover:bg-[#f7f5f2]">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>
        </header>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>
        ) : null}

        <StoreStatusPanel status={status} />

        {/* The one and only lifecycle control. */}
        <StoreStatusBar
          variant="actions"
          role={role}
          showOpeningClosingLink={false}
          showManageLink={false}
          onStatus={setStatus}
          onChanged={loadAll}
        />

        {loading && !summary ? (
          <div className={`${CARD} px-4 py-12 text-center`}>
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[#ded3fb] border-t-[#6b46e5]" />
            <p className="text-sm text-[#7a736b]">Loading store session…</p>
          </div>
        ) : null}

        {summary ? (
          <>
            <section aria-label="Day summary" className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#ece7e1] bg-[#ece7e1] lg:grid-cols-6">
              {[
                { label: 'Net Sales', value: formatCurrency(summary.sales.netSales) },
                { label: 'Bills', value: summary.sales.completedBills },
                { label: 'Cash Collected', value: formatCurrency(summary.payments.cash) },
                { label: 'QR Collected', value: formatCurrency(summary.payments.esewaPhonePay + summary.payments.bankQr) },
                { label: 'Expenses', value: formatCurrency(summary.outflows.operatingExpenses) },
                { label: 'Savings', value: formatCurrency(summary.outflows.savingsTransfers) },
              ].map((item) => (
                <div key={item.label} className="bg-white px-4 py-3.5">
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#8a837b]">{item.label}</p>
                  <p className="mt-1 text-[18px] font-extrabold tabular-nums text-[#17140f]">{item.value}</p>
                </div>
              ))}
            </section>

            <div className="grid gap-4 sm:gap-5 xl:grid-cols-2">
              <Section
                title="Cash Reconciliation"
                subtitle="Physical drawer only. QR and online collections never touch this balance."
              >
                <Row label="Starting Cash in Drawer" value={formatCurrency(expected?.startingCash)} />
                <Row label="Cash Collections" value={formatCurrency(expected?.cashCollections)} sign="+ " tone="positive" />
                <Row label="Cash Expenses &amp; Salary" value={formatCurrency(expected?.cashExpenses)} sign="- " tone="outflow" />
                <Row label="Cash Savings / Transfers Out" value={formatCurrency(expected?.cashSavingsOut)} sign="- " tone="outflow" />
                <TotalRow label="Expected Cash in Drawer" value={formatCurrency(expected?.expectedCash)} />
                <p className="border-t border-[#f0ece6] bg-[#fbfaf8] px-4 py-2.5 text-[12px] leading-5 text-[#7a736b] sm:px-5">
                  Counted cash and the SHORT / OVER / MATCHED result are entered on Close Store.
                  QR / online collected this session ({formatCurrency(expected?.qrCollections)}) is excluded from expected cash.
                </p>
              </Section>

              <Section title="Online / QR Position" subtitle="Kept entirely separate from physical drawer cash.">
                <Row label="Esewa / PhonePay" value={formatCurrency(summary.payments.esewaPhonePay)} sign="+ " tone="positive" />
                <Row label="Bank QR" value={formatCurrency(summary.payments.bankQr)} sign="+ " tone="positive" />
                <Row label="Split — QR portion" value={formatCurrency(summary.payments.splitQr)} tone="muted" />
                <TotalRow label="Net Online / Bank Balance" value={formatCurrency(expected?.netOnlineBalance)} />
              </Section>
            </div>

            <div className="grid gap-4 sm:gap-5 xl:grid-cols-2">
              <Section title="Outflows" subtitle="Savings transfers move money between salon accounts and are not expenses.">
                <Row label="Operating Expenses" value={formatCurrency(summary.outflows.operatingExpenses)} tone="outflow" />
                {isAdmin ? <Row label="Salary Paid" value={formatCurrency(summary.outflows.salaryExpenses)} tone="outflow" /> : null}
                <Row label="Savings Transfers" value={formatCurrency(summary.outflows.savingsTransfers)} />
                <Row label="Refunds" value={formatCurrency(summary.outflows.refunds)} tone="muted" />
              </Section>

              <Section title="Tokens &amp; Front Desk" subtitle="Walk-in queue activity for this session.">
                <Row label="Tokens Generated" value={summary.tokens.generated} />
                <Row label="Converted to Bills" value={summary.tokens.converted} tone="positive" />
                <Row label="Cancelled / No-show" value={summary.tokens.cancelledNoShow} tone="alert" />
                <Row label="Digital / Printed" value={`${summary.tokens.digital} / ${summary.tokens.printed}`} tone="muted" />
              </Section>
            </div>

            <Section title="Issues Before Closing" subtitle="Resolve these before the store can be closed normally.">
              {blockers.length === 0 ? (
                <p className="px-4 py-4 text-[13px] font-medium text-[#1f7a52] sm:px-5">Nothing is blocking a normal close.</p>
              ) : (
                <ul className="px-4 py-3 sm:px-5">
                  {blockers.map((blocker) => (
                    <li key={blocker.code} className="py-1 text-[13px] font-medium text-[#b91c1c]">• {blocker.message}</li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        ) : null}

        {!loading && !summary ? (
          <div className={`${CARD} px-4 py-8 text-center`}>
            <p className="text-sm font-semibold text-[#3a342d]">The store is not open.</p>
            <p className="mt-1 text-[13px] text-[#8a837b]">
              Open or reopen the store above to record transactions and see the live cash reconciliation.
            </p>
          </div>
        ) : null}

        {isAdmin ? (
          <Section
            title="Business Day History"
            subtitle="Cash balances are per session; expected and counted cash are the final session's figures, never a sum."
            action={<a href="/dashboard/admin/business-days" className="print-hide text-[11px] font-bold uppercase tracking-[0.05em] text-[#6b46e5]">Full history</a>}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-[#eee8df] bg-[#fbfaf8] text-[11px] font-bold uppercase tracking-[0.04em] text-[#6c6175]">
                    <th className="px-4 py-3">Business Day</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Sessions</th>
                    <th className="px-4 py-3">First Open</th>
                    <th className="px-4 py-3">Final Close</th>
                    <th className="px-4 py-3 text-right">Opening Cash</th>
                    <th className="px-4 py-3 text-right">Final Expected</th>
                    <th className="px-4 py-3 text-right">Final Counted</th>
                    <th className="px-4 py-3">Difference</th>
                    <th className="px-4 py-3 text-right">Net Sales</th>
                    <th className="px-4 py-3 text-right">Bills</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0ebe4]">
                  {days.length === 0 ? (
                    <tr><td colSpan={11} className="px-4 py-8 text-center text-[#8a837b]">No business days recorded yet.</td></tr>
                  ) : days.map((day) => (
                    <HistoryRow
                      key={day.id}
                      day={day}
                      isAdmin={isAdmin}
                      expanded={expandedDay === day.id}
                      onToggle={() => setExpandedDay(expandedDay === day.id ? null : day.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        ) : null}

        <p className="flex items-center gap-2 pb-2 text-xs text-[#8a837b]">
          <CalendarDays className="h-3.5 w-3.5 text-[#6b46e5]" />
          A business day may contain several store sessions. Reopening the store on the same day continues the same business day —
          sales, bills, tokens, expenses and savings are never reset. Only Start Next Business Day begins a new operational day.
        </p>
      </div>
    </div>
  );
}
