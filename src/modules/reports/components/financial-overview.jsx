'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Banknote, HelpCircle, ReceiptText, TrendingUp, Wallet } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import SalesPerformanceChart from '@/modules/reports/components/sales-performance-chart';

/**
 * The single financial section for both dashboards, styled to the "Hair Cut POS — Dashboard
 * redesign" spec (warm neutral canvas, ink emphasis card, Manrope figures, IBM Plex body).
 *
 * This is a presentational layer only. Every figure is server-calculated by
 * getFinancialSummary / getSalesSeries; the one derived value is Total Outflows, a plain sum
 * of three server totals kept here so it can never drift from the rows shown beneath it.
 */

// Design tokens (from the Spec panel of the mockup).
const MANROPE = "'Manrope', system-ui, sans-serif";
const BODY_FONT = "'IBM Plex Sans', system-ui, sans-serif";
const INK = '#17140F';
const CARD_BORDER = '#ECE7E1';
const DIVIDER = '#F3EFE9';
const TEXT = '#3A342D';
const MUTED = '#8A837B';
const MUTED_SOFT = '#7A736B';
const FAINT = '#9A938B';
const PURPLE = '#6B46E5';
const PURPLE_DK = '#5433C9';
const GREEN = '#1F8A5B';
const GREEN_DK = '#1F7A52';
const GREEN_CHIP = '#EAF6F0';
const GREEN_BORDER = '#D5EBE0';
const ORANGE = '#B4651A';
const ORANGE_DOT = '#C4691F';
const QR_LIGHT = '#9E86F0';

const CARD_STYLE = {
  background: '#fff',
  border: `1px solid ${CARD_BORDER}`,
  borderRadius: 16,
  boxShadow: '0 1px 2px rgba(40,30,20,.04)',
};

const EYEBROW = {
  fontSize: 11,
  letterSpacing: '.09em',
  textTransform: 'uppercase',
  fontWeight: 700,
  color: MUTED,
};

const TABULAR = { fontVariantNumeric: 'tabular-nums' };

function num(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function Tip({ text }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        className="ml-1 inline-flex rounded-full text-[#B7AFA4] transition hover:text-[#6A635B] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6B46E5]/40 focus-visible:ring-offset-1"
        aria-label={text}
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {/* display:none while hidden (not opacity) so the off-screen tooltip never widens the page. */}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden w-56 -translate-x-1/2 rounded-lg px-2.5 py-2 text-[11px] font-normal leading-4 text-white shadow-lg group-hover:block group-focus-within:block"
        style={{ background: INK }}
      >
        {text}
      </span>
    </span>
  );
}

const KPI_TONES = {
  revenue: { chipBg: '#F2EEFE', chipFg: PURPLE_DK },
  collection: { chipBg: GREEN_CHIP, chipFg: GREEN_DK },
  outflow: { chipBg: '#FDF0E4', chipFg: ORANGE },
};

function KpiCard({ label, tip, amount, breakdown, footer, icon: Icon, tone, href, dark = false }) {
  const tones = KPI_TONES[tone] || KPI_TONES.revenue;
  const body = (
    <>
      <div className="flex items-center gap-2">
        <span
          className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg"
          style={dark ? { background: 'rgba(255,255,255,.10)', color: '#A8E6C6' } : { background: tones.chipBg, color: tones.chipFg }}
        >
          <Icon className="h-[14px] w-[14px]" strokeWidth={1.7} />
        </span>
        <span style={{ ...EYEBROW, color: dark ? '#A79F94' : MUTED }}>
          {label}
          {tip ? <Tip text={tip} /> : null}
        </span>
      </div>
      <div
        className="mt-2.5"
        style={{
          fontFamily: MANROPE,
          fontWeight: 800,
          fontSize: 30,
          letterSpacing: '-.025em',
          lineHeight: 1,
          color: dark ? '#fff' : INK,
          ...TABULAR,
        }}
      >
        {formatCurrency(amount)}
      </div>
      <div className="mt-2 text-[12px]" style={{ color: dark ? '#B8B0A5' : MUTED_SOFT, ...TABULAR }}>{breakdown}</div>
      {footer ? <div className="mt-1 text-[11.5px]" style={{ color: dark ? '#8E877C' : FAINT }}>{footer}</div> : null}
      {href ? (
        <span className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: PURPLE }}>
          View
          <ArrowRight className="h-3 w-3" />
        </span>
      ) : null}
    </>
  );

  const style = dark
    ? { background: INK, border: `1px solid ${INK}`, borderRadius: 16, boxShadow: '0 10px 26px -18px rgba(23,20,15,.9)' }
    : CARD_STYLE;

  if (href) {
    return (
      <Link
        href={href}
        className="block p-[18px] transition hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6B46E5]/40"
        style={style}
      >
        {body}
      </Link>
    );
  }
  return <div className="p-[18px]" style={style}>{body}</div>;
}

function MetricRow({ label, value, tip, strong = false, muted = false, indent = false, dot, valueColor }) {
  return (
    <div className="flex items-center gap-2" style={{ padding: '9px 0', borderBottom: `1px solid ${DIVIDER}` }}>
      {dot ? <span className="flex-none rounded-[3px]" style={{ width: 9, height: 9, background: dot }} /> : null}
      <span
        className={indent ? 'text-[12px]' : 'text-[12.5px]'}
        style={{ color: muted ? MUTED : TEXT, fontWeight: strong ? 700 : 400, paddingLeft: indent && !dot ? 17 : 0 }}
      >
        {label}
        {tip ? <Tip text={tip} /> : null}
      </span>
      <span
        className="ml-auto whitespace-nowrap text-right"
        style={{
          fontFamily: strong ? MANROPE : BODY_FONT,
          fontSize: strong ? 13 : 12.5,
          fontWeight: strong ? 700 : 600,
          color: valueColor || (muted ? '#5C554D' : INK),
          ...TABULAR,
        }}
      >
        {formatCurrency(value)}
      </span>
    </div>
  );
}

function Panel({ title, subtitle, action, children, style: extra }) {
  return (
    <section style={{ ...CARD_STYLE, padding: '18px 20px', ...extra }}>
      <div className="flex items-start gap-3">
        <div>
          <h3 style={{ margin: 0, fontFamily: MANROPE, fontSize: 15, fontWeight: 700, color: INK, letterSpacing: '-.01em' }}>{title}</h3>
          {subtitle ? <p className="mt-[3px] text-[12px]" style={{ margin: '3px 0 0', color: MUTED }}>{subtitle}</p> : null}
        </div>
        {action ? <div className="ml-auto flex items-center gap-3">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function PaymentMix({ financial }) {
  const cash = num(financial.grossCashCollected);
  const qr = num(financial.grossQrCollected);
  const esewa = num(financial.esewaPhonePayCollected);
  const bankQr = num(financial.bankQrCollected);
  const otherQr = Math.max(0, qr - esewa - bankQr);
  const total = cash + qr;
  const pct = (v) => (total > 0 ? `${((v / total) * 100).toFixed(1)}%` : '0%');

  return (
    <div className="mt-4 flex flex-col gap-3.5">
      <div
        className="flex overflow-hidden"
        style={{ height: 14, borderRadius: 8, background: '#F1EDE7' }}
        role="img"
        aria-label={total > 0
          ? `Cash ${pct(cash)}, Esewa or PhonePay ${pct(esewa)}, Bank QR ${pct(bankQr)} of ${formatCurrency(total)} collected.`
          : 'No payments collected.'}
      >
        <span style={{ width: pct(cash), background: GREEN }} />
        <span style={{ width: pct(esewa), background: PURPLE }} />
        <span style={{ width: pct(bankQr), background: QR_LIGHT }} />
        <span style={{ width: pct(otherQr), background: '#BCACF5' }} />
      </div>

      <div className="flex flex-col">
        <MetricRow label="Gross Cash Collected" value={cash} dot={GREEN} />
        <MetricRow label="Gross QR Collected" value={qr} dot={PURPLE} />
        <MetricRow label="— Esewa / PhonePay" value={esewa} indent muted />
        <MetricRow label="— Bank QR" value={bankQr} indent muted />
        <MetricRow
          label={<>Split Cash <span style={{ fontSize: 10.5, color: '#A69E94' }}>(incl. above)</span></>}
          value={num(financial.splitCash)}
          indent
          muted
        />
        <MetricRow
          label={<>Split QR <span style={{ fontSize: 10.5, color: '#A69E94' }}>(incl. above)</span></>}
          value={num(financial.splitQr)}
          indent
          muted
        />
        <MetricRow label="Total Online Collection" value={qr} />
        <div className="flex items-center gap-2" style={{ padding: '11px 0 2px' }}>
          <span className="text-[12.5px]" style={{ fontWeight: 700, color: INK }}>Gross Total Collected</span>
          <span className="ml-auto" style={{ fontFamily: MANROPE, fontSize: 15, fontWeight: 800, color: INK, ...TABULAR }}>
            {formatCurrency(total)}
          </span>
        </div>
      </div>

      <p
        className="mt-auto text-[11px] leading-[1.5]"
        style={{ margin: 'auto 0 0', color: MUTED, background: '#FAF8F5', border: `1px solid #F0ECE6`, borderRadius: 10, padding: '8px 10px', textWrap: 'pretty' }}
      >
        Split cash and split QR are already counted inside gross cash and gross QR — they are shown for reference only.
      </p>
    </div>
  );
}

function OutflowSummary({ financial, showSalary }) {
  const operating = num(financial.operatingExpenses);
  const salary = showSalary ? num(financial.salaryExpenses) : 0;
  const savings = num(financial.savingsTransfers);
  const cashOut = num(financial.operatingExpensesCash) + (showSalary ? num(financial.salaryExpensesCash) : 0) + num(financial.savingsFromCash);
  const onlineOut = num(financial.operatingExpensesOnline) + (showSalary ? num(financial.salaryExpensesOnline) : 0) + num(financial.savingsFromOnline);
  const total = operating + salary + savings;

  return (
    <>
      <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-2" style={{ columnGap: 28 }}>
        <MetricRow label="Operating Expenses" value={operating} dot={ORANGE_DOT} valueColor={ORANGE} />
        <MetricRow label="Total Cash Outflow" value={cashOut} valueColor="#2A251F" />
        {showSalary ? (
          <MetricRow
            label={<>Salary Expenses <span style={{ fontSize: 10.5, color: '#A69E94' }}>Admin only</span></>}
            value={salary}
            dot={ORANGE_DOT}
            valueColor={ORANGE}
          />
        ) : null}
        <MetricRow label="Total Online Outflow" value={onlineOut} valueColor="#2A251F" />
        <MetricRow
          label="Savings Transfers"
          value={savings}
          dot={GREEN}
          valueColor={GREEN_DK}
          tip="Savings transfers move money to the salon's own bank or Sahakari account. They reduce available balances but are not operating expenses."
        />
        <MetricRow label="Refunds" value={0} valueColor="#2A251F" />
      </div>
      <div
        className="mt-3.5 flex items-center gap-3"
        style={{ padding: '12px 14px', background: '#FAF8F5', border: '1px solid #F0ECE6', borderRadius: 12 }}
      >
        <span style={EYEBROW}>Total Outflows</span>
        <span className="ml-auto" style={{ fontFamily: MANROPE, fontSize: 18, fontWeight: 800, color: INK, ...TABULAR }}>
          {formatCurrency(total)}
        </span>
      </div>
    </>
  );
}

function AvailableBalance({ financial }) {
  return (
    <div className="mt-1.5 flex flex-col">
      <div className="flex items-center" style={{ padding: '12px 0', borderBottom: `1px solid ${DIVIDER}` }}>
        <span className="text-[12.5px]" style={{ color: TEXT }}>
          Net Cash in Hand
          <Tip text="Physical cash: gross cash collected, less cash expenses, cash salary payments and cash savings transfers. Online outflows never reduce it." />
        </span>
        <span className="ml-auto" style={{ fontFamily: MANROPE, fontSize: 14, fontWeight: 700, color: INK, ...TABULAR }}>
          {formatCurrency(financial.netCashInHand)}
        </span>
      </div>
      <div className="flex items-center" style={{ padding: '12px 0', borderBottom: `1px solid ${DIVIDER}` }}>
        <span className="text-[12.5px]" style={{ color: TEXT }}>
          Net Online Balance
          <Tip text="QR and online money: gross QR collected, less online expenses, online salary payments and online savings transfers." />
        </span>
        <span className="ml-auto" style={{ fontFamily: MANROPE, fontSize: 14, fontWeight: 700, color: INK, ...TABULAR }}>
          {formatCurrency(financial.netOnlineBalance)}
        </span>
      </div>
      <div className="mt-3.5" style={{ padding: 16, borderRadius: 14, background: GREEN_CHIP, border: `1px solid ${GREEN_BORDER}` }}>
        <div style={{ ...EYEBROW, color: GREEN_DK }}>
          Net Available Balance
          <Tip text="Net Cash in Hand plus Net Online Balance — everything the salon still holds for this period." />
        </div>
        <div className="mt-1" style={{ fontFamily: MANROPE, fontSize: 24, fontWeight: 800, color: '#125C3C', letterSpacing: '-.02em', ...TABULAR }}>
          {formatCurrency(financial.netAvailableBalance)}
        </div>
      </div>
    </div>
  );
}

export default function FinancialOverview({
  financial,
  salesSeries,
  loading = false,
  error = '',
  onRetry,
  period,
  transactionsHref,
  reportsHref,
  showSalary = true,
  updatedAt,
  showHeader = true,
}) {
  const [showSecondary, setShowSecondary] = useState(false);

  const totals = useMemo(() => {
    if (!financial) return null;
    const outflows =
      num(financial.operatingExpenses)
      + (showSalary ? num(financial.salaryExpenses) : 0)
      + num(financial.savingsTransfers);
    const grossCollected = num(financial.grossTotalCollected);
    return {
      netSales: num(financial.netSalesAfterDiscount),
      grossCollected,
      outflows,
      available: num(financial.netAvailableBalance),
      outflowRatio: grossCollected > 0 ? `${Math.round((outflows / grossCollected) * 100)}%` : '0%',
    };
  }, [financial, showSalary]);

  const periodMeta = financial?.period || {};
  const periodLabel = periodMeta.label || '';

  if (!financial && !loading) {
    return (
      <section
        className="mb-6 p-6 text-center text-sm"
        style={{ borderRadius: 16, border: `1px dashed #E2DCD4`, background: '#fff', color: MUTED }}
      >
        Financial summary is unavailable. Refresh and try again.
      </section>
    );
  }

  return (
    <section className={showHeader ? 'mb-8' : ''} aria-label="Financial overview" style={{ fontFamily: BODY_FONT }}>
      {/* 1. Header */}
      {showHeader ? (
        <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 style={{ margin: 0, fontFamily: MANROPE, fontSize: 20, fontWeight: 800, letterSpacing: '-.02em', color: INK }}>
              Financial Overview
            </h2>
            <p className="mt-1 text-[13px]" style={{ color: MUTED_SOFT }}>
              {periodLabel}
              {periodMeta.displayRange ? ` · ${periodMeta.displayRange}` : ''}
              {updatedAt ? ` · Updated at ${updatedAt}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {transactionsHref ? (
              <Link
                href={transactionsHref}
                className="inline-flex h-[38px] items-center gap-1.5 px-4 text-[13px] font-bold text-white transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                style={{ fontFamily: MANROPE, background: PURPLE, borderRadius: 10, boxShadow: '0 6px 14px -8px rgba(107,70,229,.9)' }}
              >
                View All Transactions
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : null}
            {reportsHref ? (
              <Link
                href={reportsHref}
                className="inline-flex h-[38px] items-center gap-1.5 px-4 text-[13px] font-semibold transition hover:bg-[#F7F5F2] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6B46E5]/40 focus-visible:ring-offset-2"
                style={{ color: TEXT, background: '#fff', border: `1px solid #E4DED6`, borderRadius: 10 }}
              >
                Full Reports
              </Link>
            ) : null}
          </div>
        </header>
      ) : null}

      {/* 2. Primary KPIs */}
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading || !totals ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="animate-pulse" style={{ height: 132, borderRadius: 16, background: '#EDE9E4' }} />
          ))
        ) : (
          <>
            <KpiCard
              label="Net Sales"
              tip="Gross sales before discount, less total discounts, plus any tax or service charge."
              amount={totals.netSales}
              breakdown={`Gross ${formatCurrency(financial.grossSalesBeforeDiscount)} · Discount ${formatCurrency(financial.totalDiscounts)}`}
              footer="No comparison available for this period"
              icon={TrendingUp}
              tone="revenue"
              href={transactionsHref}
            />
            <KpiCard
              label="Gross Collected"
              tip="Cash actually collected plus QR/online actually collected. Split payments are counted once."
              amount={totals.grossCollected}
              breakdown={`Cash ${formatCurrency(financial.grossCashCollected)} · QR ${formatCurrency(financial.grossQrCollected)}`}
              icon={Banknote}
              tone="collection"
            />
            <KpiCard
              label="Total Outflows"
              tip="Operating expenses plus salary payments plus savings transfers. Savings are transfers, not costs."
              amount={totals.outflows}
              breakdown={`Expenses ${formatCurrency(num(financial.operatingExpenses) + (showSalary ? num(financial.salaryExpenses) : 0))} · Savings ${formatCurrency(financial.savingsTransfers)}`}
              footer={`${totals.outflowRatio} of gross collected`}
              icon={ReceiptText}
              tone="outflow"
            />
            <KpiCard
              label="Net Available"
              tip="Net cash in hand plus net online balance — what the salon still holds."
              amount={totals.available}
              breakdown={`Cash in Hand ${formatCurrency(financial.netCashInHand)} · Online ${formatCurrency(financial.netOnlineBalance)}`}
              footer="After expenses and savings transfers"
              icon={Wallet}
              dark
            />
          </>
        )}
      </div>

      {/* 3 + 4. Sales performance and payment mix */}
      <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
        <Panel
          title="Sales Performance"
          subtitle={`Daily net sales · ${periodMeta.displayRange || periodLabel}`}
          action={
            <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: '#5C554D' }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: PURPLE }} />
              Net Sales
            </span>
          }
          style={{ display: 'flex', flexDirection: 'column', minHeight: 334 }}
        >
          <SalesPerformanceChart
            series={salesSeries}
            loading={loading}
            error={error}
            onRetry={onRetry}
            periodLabel={periodLabel}
          />
        </Panel>

        <Panel title="Payment Mix" subtitle="Share of gross collected" style={{ display: 'flex', flexDirection: 'column' }}>
          {loading || !financial ? (
            <div className="mt-4 animate-pulse" style={{ height: 260, borderRadius: 12, background: '#EDE9E4' }} />
          ) : (
            <PaymentMix financial={financial} />
          )}
        </Panel>
      </div>

      {/* 5. Outflows and available balance */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
        <Panel
          title="Outflow Summary"
          action={
            <>
              <span
                title="Savings transfers reduce available balances but are not operating expenses."
                className="cursor-help text-[10.5px] font-bold uppercase"
                style={{ letterSpacing: '.06em', color: GREEN_DK, background: GREEN_CHIP, border: `1px solid ${GREEN_BORDER}`, padding: '4px 8px', borderRadius: 7 }}
              >
                Savings ≠ expenses ⓘ
              </span>
              <button
                type="button"
                onClick={() => setShowSecondary((open) => !open)}
                aria-expanded={showSecondary}
                className="text-[12.5px] font-semibold focus:outline-none focus-visible:underline"
                style={{ color: PURPLE }}
              >
                {showSecondary ? 'Hide detailed figures' : 'Show detailed figures →'}
              </button>
            </>
          }
        >
          {loading || !financial ? (
            <div className="mt-3.5 animate-pulse" style={{ height: 168, borderRadius: 12, background: '#EDE9E4' }} />
          ) : (
            <OutflowSummary financial={financial} showSalary={showSalary} />
          )}
        </Panel>

        <Panel title="Available Balance">
          {loading || !financial ? (
            <div className="mt-1.5 animate-pulse" style={{ height: 168, borderRadius: 12, background: '#EDE9E4' }} />
          ) : (
            <AvailableBalance financial={financial} />
          )}
        </Panel>
      </div>

      {/* 6. Detailed figures, toggled from the Outflow Summary header. */}
      {financial && showSecondary ? (
        <dl className="mt-4 grid grid-cols-1 gap-x-8 sm:grid-cols-2 xl:grid-cols-4" style={{ ...CARD_STYLE, padding: '6px 20px' }}>
          <MetricRow label="Gross Sales Before Discount" value={financial.grossSalesBeforeDiscount} />
          <MetricRow label="Total Discounts" value={financial.totalDiscounts} />
          <MetricRow label="Gross Cash Collected" value={financial.grossCashCollected} />
          <MetricRow label="Gross QR Collected" value={financial.grossQrCollected} />
          <MetricRow label="Operating Expenses" value={financial.operatingExpenses} />
          {showSalary ? <MetricRow label="Salary Expenses" value={financial.salaryExpenses} /> : null}
          <MetricRow label="Savings Transfers" value={financial.savingsTransfers} />
          <MetricRow label="Net Cash in Hand" value={financial.netCashInHand} />
          <MetricRow label="Net Online Balance" value={financial.netOnlineBalance} />
        </dl>
      ) : null}
    </section>
  );
}
