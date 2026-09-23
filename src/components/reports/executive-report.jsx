'use client';

/**
 * Shared Executive Summary report chrome.
 *
 * The Admin and Cashier Executive Summaries are the SAME report rendered from the same
 * primitives — only the set of cards differs by role. Keeping the sheet, header, controls,
 * cards and rows here is what stops the two reports drifting into different designs.
 */

import { Printer, RefreshCw } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';

export const PERIOD_TABS = [
  { value: 'today', label: 'Today' },
  { value: '3days', label: 'Last 3 Days' },
  { value: '7days', label: 'Last 7 Days' },
  { value: 'month', label: 'This Month' },
  { value: 'custom', label: 'Custom Range' },
];

/* Report palette — restrained on purpose: labels grey, amounts muted red, totals amber. */
export const LABEL = '#5b6068';
export const AMOUNT = '#9b3b3b';
export const TOTAL = '#b45309';
export const POSITIVE = '#1f7a52';
export const HEADING = '#1f2328';
export const BORDER = '#e3e1dd';
export const ACCENT = '#6b46e5';
export const MUTED = '#a39d95';

export function num(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getTodayIso() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kathmandu', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export function isValidRange(start, end) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(start || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(end || ''))) return false;
  return start <= end;
}

export function formatGenerated(value) {
  if (!value) return '';
  const text = new Date(value).toLocaleString('en-GB', {
    timeZone: 'Asia/Kathmandu',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
  return `${text.replace(',', '').replace(' at', ',')} NPT`;
}

export function formatReportDate(iso) {
  if (!iso) return '—';
  const [year, month, day] = String(iso).slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

/* --------------------------------------------------------------- primitives */

/** One bordered accounting card: small title, hairline divider, then rows. */
export function Card({ title, children, className = '' }) {
  return (
    <section
      className={`break-inside-avoid rounded-[8px] border bg-white px-3.5 pb-3 pt-2.5 sm:px-4 ${className}`}
      style={{ borderColor: BORDER }}
    >
      <h2 className="pb-2 text-[11.5px] font-bold" style={{ color: HEADING, borderBottom: `1px solid ${BORDER}` }}>
        {title}
      </h2>
      <div className="pt-1.5">{children}</div>
    </section>
  );
}

/** Label left, amount right. `tone` only ever marks a total, a positive or a muted line. */
export function Row({ label, value, tone = 'amount', sign = '', muted = false }) {
  const color = tone === 'total' ? TOTAL : tone === 'positive' ? POSITIVE : tone === 'muted' ? MUTED : AMOUNT;
  const isTotal = tone === 'total';
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px]">
      <span
        className={`text-[11.5px] ${isTotal ? 'font-bold' : ''}`}
        style={{ color: isTotal ? HEADING : muted ? MUTED : LABEL }}
      >
        {label}
      </span>
      <span className={`shrink-0 text-[11.5px] tabular-nums ${isTotal ? 'font-bold' : 'font-medium'}`} style={{ color }}>
        {sign}{value}
      </span>
    </div>
  );
}

/** Total line, separated from the rows above it. */
export function Total({ label, value, tone = 'total' }) {
  return (
    <div className="mt-1.5 pt-1.5" style={{ borderTop: `1px solid ${BORDER}` }}>
      <Row label={label} value={value} tone={tone === 'positive' ? 'positive' : 'total'} />
    </div>
  );
}

export function Note({ children }) {
  return <p className="mt-2 text-[10px] leading-4" style={{ color: MUTED }}>{children}</p>;
}

export function Empty({ children }) {
  return <p className="py-1 text-[11px]" style={{ color: MUTED }}>{children}</p>;
}

/** Category line: name, then a small quantity/amount sub-line. */
export function CategoryRow({ name, quantity, amount, quantityLabel = 'Qty' }) {
  return (
    <div className="py-[3px]">
      <p className="text-[11.5px] font-semibold" style={{ color: HEADING }}>{name}</p>
      <p className="text-[10px]" style={{ color: ACCENT }}>
        {quantityLabel}: {quantity} <span style={{ color: '#c9c4bd' }}>|</span> <span style={{ color: AMOUNT }}>{formatCurrency(amount)}</span>
      </p>
    </div>
  );
}

/** Centred emphasis card ("TOTAL IMPACT" style). */
export function ImpactBlock({ caption, value, footnote, positive = true }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[6px] py-4" style={{ background: '#f7f6f3' }}>
      <p className="text-[9.5px] font-bold uppercase tracking-[0.1em]" style={{ color: MUTED }}>{caption}</p>
      <p className="mt-1 text-[22px] font-bold tabular-nums" style={{ color: positive ? POSITIVE : AMOUNT }}>{value}</p>
      {footnote ? <p className="mt-0.5 text-center text-[9.5px]" style={{ color: MUTED }}>{footnote}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------- controls */

export function ReportControls({
  period, onChangePeriod, customRange, onCustomChange, onApplyCustom,
  todayIso, onPrint, onRefresh, refreshing, error, allowPrint = true,
}) {
  return (
    <div className="print-hide mx-auto mb-4 flex max-w-[940px] flex-col gap-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="tablist"
          aria-label="Executive summary period"
          className="grid grid-cols-2 gap-1 rounded-xl bg-[#e9e5df] p-1 sm:inline-grid sm:grid-cols-5"
        >
          {PERIOD_TABS.map((option) => {
            const active = period === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onChangePeriod(option.value)}
                className={`h-9 rounded-[9px] px-3 text-[12.5px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#b7a4fa] ${
                  active ? 'bg-white text-[#17140f] shadow-[0_1px_2px_rgba(30,20,10,0.10)]' : 'text-[#6a635b] hover:text-[#1a1714]'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          {allowPrint ? (
            <button
              type="button"
              onClick={onPrint}
              className="inline-flex h-[38px] items-center gap-2 rounded-[10px] border border-[#6b46e5] bg-[#6b46e5] px-3.5 text-sm font-semibold text-white hover:bg-[#5a38d0]"
            >
              <Printer className="h-4 w-4" /> Print
            </button>
          ) : null}
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex h-[38px] items-center gap-2 rounded-[10px] border border-[#e4ded6] bg-white px-3.5 text-sm font-semibold text-[#3a342d] hover:bg-[#f7f5f2] disabled:opacity-60"
          >
            <RefreshCw className="h-4 w-4" /> {refreshing ? 'Refreshing' : 'Refresh'}
          </button>
        </div>
      </div>

      {period === 'custom' ? (
        <form
          onSubmit={(event) => { event.preventDefault(); onApplyCustom(); }}
          className="flex flex-col gap-2 rounded-xl border border-[#e3e1dd] bg-white p-3 sm:flex-row sm:items-end"
        >
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8a837b]">
            From
            <input
              type="date"
              required
              max={customRange.end || todayIso}
              value={customRange.start}
              onChange={(event) => onCustomChange({ ...customRange, start: event.target.value })}
              className="h-9 rounded-lg border border-[#e4ded6] bg-white px-3 text-sm font-medium text-[#3a342d] focus:border-[#b7a4fa] focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8a837b]">
            To
            <input
              type="date"
              required
              min={customRange.start || undefined}
              max={todayIso}
              value={customRange.end}
              onChange={(event) => onCustomChange({ ...customRange, end: event.target.value })}
              className="h-9 rounded-lg border border-[#e4ded6] bg-white px-3 text-sm font-medium text-[#3a342d] focus:border-[#b7a4fa] focus:outline-none"
            />
          </label>
          <button type="submit" className="inline-flex h-[38px] items-center rounded-[10px] border border-[#6b46e5] bg-[#6b46e5] px-3.5 text-sm font-semibold text-white hover:bg-[#5a38d0]">
            Apply Range
          </button>
        </form>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- sheet */

/** The centred white report sheet, its centred masthead, and the two-column card grid. */
export function ReportSheet({ title, summary, loading, children }) {
  const businessDay = summary?.businessDay;
  return (
    <div
      className="exec-sheet mx-auto max-w-[940px] rounded-[10px] border bg-white px-3 py-5 sm:px-6 sm:py-7"
      style={{ borderColor: BORDER }}
    >
      <header className="mb-4 text-center">
        <p className="text-[12.5px] font-bold">
          <span style={{ color: ACCENT }}>The Hair Cut</span> <span style={{ color: HEADING }}>Salon</span>
        </p>
        <h1 className="mt-0.5 text-[19px] font-bold tracking-[-0.01em]" style={{ color: HEADING }}>{title}</h1>
        <p className="mt-0.5 text-[11px]" style={{ color: LABEL }}>{summary?.period?.displayRange || '—'}</p>
        <p className="mt-0.5 text-[9.5px]" style={{ color: ACCENT }}>{formatGenerated(summary?.generatedAt)}</p>
        {businessDay?.scoped && businessDay?.date ? (
          <p className="mt-0.5 text-[9.5px]" style={{ color: MUTED }}>
            Business Day {formatReportDate(businessDay.date)} · {businessDay.sessions} session{businessDay.sessions === 1 ? '' : 's'}
            {businessDay.openSessions > 0 ? ' · store open' : ''}
          </p>
        ) : null}
      </header>

      {loading && !summary ? (
        <div className="py-16 text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[#ded3fb] border-t-[#6b46e5]" />
          <p className="text-[12px]" style={{ color: LABEL }}>Preparing the report…</p>
        </div>
      ) : null}

      {summary ? <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2">{children}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------- shared sections */

/**
 * Cards whose figures BOTH roles are allowed to see, rendered from the identical fields of
 * the identical payload. Sharing the render is a second guarantee, on top of the shared SQL,
 * that admin and cashier can never display a common metric differently.
 */
export function PaymentReceivedCard({ payments }) {
  return (
    <Card title="Payment Received">
      <Row label="Cash Received" value={formatCurrency(payments.grossCashCollected)} />
      <Row label="QR / Online Received" value={formatCurrency(payments.grossQrCollected)} />
      <Row label="Esewa / PhonePay" value={formatCurrency(payments.esewaPhonePay)} muted />
      <Row label="Bank QR" value={formatCurrency(payments.bankQr)} muted />
      <Row label="Split — cash portion" value={formatCurrency(payments.splitCash)} muted />
      <Row label="Split — QR portion" value={formatCurrency(payments.splitQr)} muted />
      <Total label="Total Received" value={formatCurrency(payments.grossTotalCollected)} />
      <Note>Split payments are counted once: the cash portion inside Cash, the QR portion inside QR.</Note>
    </Card>
  );
}

/** Drawer reconciliation. `showSalaryLine` itemises payroll cash for admin only. */
export function CashInHandCard({ cash, showSalaryLine = false }) {
  const openingAdjustment = num(cash.cashAdded) - num(cash.cashRemoved);
  return (
    <Card title="Cash in Hand">
      <Row label="Starting Cash in Drawer" value={formatCurrency(cash.startingCash)} />
      {openingAdjustment !== 0 ? (
        <Row
          label="Opening Adjustment"
          value={formatCurrency(Math.abs(openingAdjustment))}
          sign={openingAdjustment > 0 ? '+ ' : '- '}
        />
      ) : null}
      <Row label="Cash Collections" value={formatCurrency(cash.cashCollected)} sign="+ " />
      {showSalaryLine ? (
        <>
          <Row label="Cash Expenses" value={formatCurrency(cash.cashExpenses)} sign="- " />
          <Row label="Salary Paid" value={formatCurrency(cash.cashSalary)} sign="- " />
        </>
      ) : (
        <Row label="Cash Paid Out" value={formatCurrency(cash.cashPaidOut)} sign="- " />
      )}
      <Row label="Savings / Deposit from Cash" value={formatCurrency(cash.cashSavings)} sign="- " />
      <Row label="Refunds" value={formatCurrency(cash.cashRefunds)} sign="- " muted />
      <Total label="Expected Cash in Drawer" value={formatCurrency(cash.expectedCash)} />
      {cash.countedCash !== null ? (
        <>
          <Row label="Counted Cash" value={formatCurrency(cash.countedCash)} />
          <Row
            label={`Difference · ${cash.reconciliationState}`}
            value={formatCurrency(Math.abs(num(cash.cashDifference)))}
            tone={num(cash.cashDifference) === 0 ? 'positive' : 'amount'}
          />
          <Note>
            {cash.expectedCashSource === 'snapshot'
              ? `Reconciled at Close Store${cash.closedBy ? ` by ${cash.closedBy}` : ''}${cash.finalSessionNumber ? ` (Session ${cash.finalSessionNumber})` : ''}. These are the persisted closing figures, so this record cannot change later.`
              : 'Live figures — the session is not fully closed yet.'}
          </Note>
        </>
      ) : (
        <Note>
          {cash.hasSessionData
            ? 'A store session is still open — counted cash is recorded at Close Store.'
            : 'No store session covers this period, so the drawer float is unknown. The figure above is the net cash movement only.'}
        </Note>
      )}
    </Card>
  );
}

export function ServiceCategoryCard({ categories }) {
  return (
    <Card title="Service Category">
      {categories.length === 0 ? <Empty>No service sales for this period</Empty> : categories.map((row) => (
        <CategoryRow key={row.category} name={row.category} quantity={row.quantity} amount={row.revenue} />
      ))}
    </Card>
  );
}

export function ProductCategoryCard({ categories }) {
  return (
    <Card title="Product Category">
      {categories.length === 0 ? <Empty>No product sales for this period</Empty> : categories.map((row) => (
        <CategoryRow key={row.category} name={row.category} quantity={row.quantity} amount={row.revenue} />
      ))}
    </Card>
  );
}

export function TokenCard({ tokens, directBills }) {
  return (
    <Card title="Token &amp; Front Desk">
      <Row label="Tokens Generated" value={tokens.generated} />
      <Row label="Digital / Printed Tokens" value={`${tokens.digitalTokens} / ${tokens.printedTokens}`} />
      <Row label="Converted to Bills" value={tokens.converted} />
      <Row label="Cancelled / No-show" value={tokens.cancelledNoShow} />
      <Row label="Waiting Now" value={tokens.waitingNow} />
      <Row label="Digital / Printed Bills" value={`${tokens.digitalBills} / ${tokens.printedBills}`} muted />
      <Row label="Direct Bills — no token" value={directBills} muted />
      <Total
        label="Conversion Rate"
        value={tokens.generated > 0 ? `${Math.round((tokens.converted / tokens.generated) * 1000) / 10}%` : '—'}
      />
    </Card>
  );
}

export function SavingsCard({ savings }) {
  return (
    <Card title="Savings / Deposits">
      <Row label="From Cash" value={formatCurrency(savings.fromCash)} />
      <Row label="From Online / QR" value={formatCurrency(savings.fromOnline)} />
      <Row label="Bank Deposit" value={formatCurrency(savings.bankDeposits)} muted />
      <Row label="Sahakari Deposit" value={formatCurrency(savings.sahakariDeposits)} muted />
      <Total label="Total Saved" value={formatCurrency(savings.total)} />
      <Note>Transfers to savings are cash movements, not business expenses.</Note>
    </Card>
  );
}
