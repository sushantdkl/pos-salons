'use client';

/**
 * Shared ERP primitives. Every report / dashboard page builds from these so headers, period
 * filters, cards, tables, badges and empty/loading/error states look and behave the same.
 * Components format and lay out values; they never derive financial figures.
 */

import { DateInput } from '@/components/shared/calendar-date-input';
import { useId } from 'react';
import { AlertTriangle, CircleAlert, Info, Inbox, Loader2, Printer, RefreshCw } from 'lucide-react';
import { DASHBOARD_PERIOD_OPTIONS } from '@/lib/reports/dashboard-period';
import { money, STATUS, tone } from './tokens';

export * from './tokens';

/* ------------------------------------------------------------------ layout */

export function ErpPage({ children, narrow = false, className = '' }) {
  return (
    <main className={`mx-auto w-full min-w-0 px-4 py-5 sm:px-6 lg:px-8 ${narrow ? 'max-w-5xl' : 'max-w-7xl'} ${className}`}>
      {children}
    </main>
  );
}

export function PageHeader({ icon: Icon, title, subtitle, meta, actions, iconTone = 'neutral' }) {
  const t = tone(iconTone);
  return (
    <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${t.soft} ${t.text}`}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="font-[family-name:var(--font-dashboard-heading)] text-xl font-extrabold tracking-tight text-stone-900 sm:text-2xl">{title}</h1>
          {subtitle ? <p className="mt-0.5 max-w-2xl text-sm text-stone-500">{subtitle}</p> : null}
          {meta ? <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">{meta}</div> : null}
        </div>
      </div>
      {actions ? <div className="print-hide flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function ErpButton({ children, variant = 'secondary', icon: Icon, className = '', ...props }) {
  const styles = {
    primary: 'bg-stone-900 text-white hover:bg-stone-800 border-stone-900',
    secondary: 'bg-white text-stone-700 hover:bg-stone-50 border-stone-300',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 border-rose-600',
    ghost: 'bg-transparent text-stone-600 hover:bg-stone-100 border-transparent',
  }[variant];
  return (
    <button
      type="button"
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900/30 disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
      {...props}
    >
      {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function RefreshButton({ loading, onClick }) {
  return (
    <ErpButton icon={RefreshCw} onClick={onClick} disabled={loading} className={loading ? '[&>svg]:animate-spin' : ''}>
      Refresh
    </ErpButton>
  );
}

export function PrintButton() {
  return <ErpButton icon={Printer} onClick={() => window.print()}>Print</ErpButton>;
}

/* ----------------------------------------------------------- period filter */

/**
 * The one period control. Values come from the shared period vocabulary; custom ranges are
 * applied only when both ends are set (the caller decides when to fetch).
 */
export function PeriodFilter({
  value, onChange, startDate = '', endDate = '', onRangeChange, onApplyRange,
  options = DASHBOARD_PERIOD_OPTIONS, className = '',
}) {
  const id = useId();
  return (
    <div className={`print-hide flex flex-col gap-2 ${className}`}>
      <div role="tablist" aria-label="Report period" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(option.value)}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900/30 ${
                active ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {value === 'custom' ? (
        <div className="flex flex-wrap items-end gap-2">
          <label htmlFor={`${id}-from`} className="text-xs font-semibold text-stone-500">
            From
            <DateInput
              id={`${id}-from`}
              value={startDate}
              max={endDate || undefined}
              onChange={(event) => onRangeChange?.(event.target.value, endDate)}
              className="mt-1 block h-10 rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900"
            />
          </label>
          <label htmlFor={`${id}-to`} className="text-xs font-semibold text-stone-500">
            To
            <DateInput
              id={`${id}-to`}
              value={endDate}
              min={startDate || undefined}
              onChange={(event) => onRangeChange?.(startDate, event.target.value)}
              className="mt-1 block h-10 rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900"
            />
          </label>
          {onApplyRange ? (
            <ErpButton variant="primary" onClick={onApplyRange} disabled={!startDate || !endDate || startDate > endDate}>
              Apply
            </ErpButton>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- metrics */

export function MetricCard({ label, value, tone: toneName = 'neutral', hint, sub, emphasis = false }) {
  const t = tone(toneName);
  return (
    <div className={`min-w-0 rounded-xl border bg-white px-4 py-3 ${emphasis ? `${t.border} ${t.soft}` : 'border-stone-200'}`}>
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-stone-500">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.dot}`} aria-hidden="true" />
        <span className="truncate">{label}</span>
      </p>
      <p className={`mt-1 truncate font-[family-name:var(--font-dashboard-heading)] text-xl font-extrabold tabular-nums ${emphasis ? t.strong : 'text-stone-900'}`}>
        {value}
      </p>
      {sub ? <p className="mt-0.5 truncate text-xs text-stone-500">{sub}</p> : null}
      {hint ? <p className="mt-1 text-[11px] leading-snug text-stone-400">{hint}</p> : null}
    </div>
  );
}

export function MetricGroup({ children, columns = 4 }) {
  const grid = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-2 lg:grid-cols-4',
    5: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-5',
    6: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6',
  }[columns] || 'grid-cols-2 lg:grid-cols-4';
  return <div className={`grid gap-3 ${grid}`}>{children}</div>;
}

/* ---------------------------------------------------------- report blocks */

/** A tinted band grouping related report sections (Money In, Money Out, ...). */
export function ReportGroup({ title, note, tone: toneName = 'neutral', children, className = '' }) {
  const t = tone(toneName);
  return (
    <section className={`break-inside-avoid rounded-2xl border ${t.border} ${t.band} p-3 sm:p-4 ${className}`}>
      <div className="mb-3 flex items-baseline gap-2 px-1">
        <span className={`h-2.5 w-2.5 shrink-0 translate-y-[-1px] rounded-full ${t.dot}`} aria-hidden="true" />
        <div className="min-w-0">
          <h2 className={`text-[13px] font-extrabold uppercase tracking-[0.08em] ${t.strong}`}>{title}</h2>
          {note ? <p className="text-xs text-stone-600">{note}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

/**
 * A report card of labelled lines. Each line: { label, value, sign, tone, strong, muted,
 * note, indent }. `value` is a number (formatted as money) or a preformatted string.
 */
export function ReportSection({ title, note, lines = [], children, footnote, className = '' }) {
  return (
    <section className={`min-w-0 break-inside-avoid overflow-hidden rounded-xl border border-stone-200 bg-white ${className}`}>
      {title ? (
        <div className="border-b border-stone-100 px-4 py-2.5">
          <h3 className="text-[12.5px] font-bold uppercase tracking-[0.05em] text-stone-800">{title}</h3>
          {note ? <p className="mt-0.5 text-xs leading-snug text-stone-500">{note}</p> : null}
        </div>
      ) : null}
      {lines.length ? (
        <dl className="divide-y divide-stone-100">
          {lines.filter(Boolean).map((line, index) => <ReportLine key={`${line.label}-${index}`} {...line} />)}
        </dl>
      ) : null}
      {children}
      {footnote ? <p className="border-t border-stone-100 px-4 py-2 text-[11px] leading-snug text-stone-500">{footnote}</p> : null}
    </section>
  );
}

export function ReportLine({ label, value, sign = '', tone: toneName, strong = false, muted = false, note, indent = false }) {
  const t = toneName ? tone(toneName) : null;
  const display = typeof value === 'number' || value === null || value === undefined ? money(value) : value;
  return (
    <div className={`flex items-baseline justify-between gap-4 px-4 ${strong ? 'bg-stone-50/80 py-2.5' : 'py-2'} ${strong ? 'border-t-2 border-stone-200' : ''}`}>
      <dt className={`min-w-0 text-[13px] ${indent ? 'pl-3' : ''} ${strong ? 'font-bold text-stone-900' : muted ? 'text-stone-400' : 'font-medium text-stone-600'}`}>
        {label}
        {note ? <span className="block text-[11px] font-normal leading-snug text-stone-400">{note}</span> : null}
      </dt>
      <dd className={`shrink-0 text-right text-[13.5px] tabular-nums ${strong ? 'font-extrabold' : 'font-semibold'} ${t ? t.text : strong ? 'text-stone-900' : muted ? 'text-stone-400' : 'text-stone-800'}`}>
        {sign ? <span className="mr-0.5">{sign}</span> : null}
        {display}
      </dd>
    </div>
  );
}

export const line = (label, value, options = {}) => ({ label, value, ...options });

export function SectionHeading({ title, note, action }) {
  return (
    <div className="mb-2 mt-6 flex flex-wrap items-end justify-between gap-2 first:mt-0">
      <div>
        <h2 className="text-sm font-extrabold uppercase tracking-[0.06em] text-stone-800">{title}</h2>
        {note ? <p className="text-xs text-stone-500">{note}</p> : null}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ tables */

/**
 * columns: [{ key, label, align, render(row), className }]. Wide tables scroll inside their
 * own container, never the page.
 */
export function FinancialTable({ columns, rows, rowKey = (row, index) => row.id ?? index, empty = 'No records for this period.', footer, caption, onRowClick }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-stone-200 bg-white">
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-max border-collapse text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`whitespace-nowrap px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.05em] text-stone-500 ${column.align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-sm text-stone-400">{empty}</td>
              </tr>
            ) : rows.map((row, index) => (
              <tr
                key={rowKey(row, index)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={onRowClick ? 'cursor-pointer hover:bg-stone-50' : ''}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`whitespace-nowrap px-3 py-2.5 ${column.align === 'right' ? 'text-right tabular-nums' : ''} ${column.className || 'text-stone-700'}`}
                  >
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer ? <tfoot className="border-t-2 border-stone-200 bg-stone-50 font-bold">{footer}</tfoot> : null}
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ status */

export function StatusBadge({ status, label, tone: toneName }) {
  const known = STATUS[String(status || '').toUpperCase()];
  const t = tone(toneName || known?.tone || 'neutral');
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11.5px] font-bold ${t.border} ${t.soft} ${t.strong}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} aria-hidden="true" />
      {label || known?.label || status}
    </span>
  );
}

export function EmptyState({ title = 'Nothing here yet', message, icon: Icon = Inbox, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center">
      <Icon className="h-8 w-8 text-stone-300" aria-hidden="true" />
      <p className="mt-2 text-sm font-semibold text-stone-700">{title}</p>
      {message ? <p className="mt-1 max-w-sm text-xs text-stone-500">{message}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function AlertBanner({ tone: toneName = 'cash', title, children, action }) {
  const t = tone(toneName);
  const Icon = toneName === 'outflow' ? CircleAlert : toneName === 'online' ? Info : AlertTriangle;
  return (
    <div role={toneName === 'outflow' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${t.border} ${t.soft}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${t.text}`} aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm">
        {title ? <p className={`font-bold ${t.strong}`}>{title}</p> : null}
        {children ? <div className="text-stone-700">{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-stone-500" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <AlertBanner tone="outflow" title="Could not load this report" action={onRetry ? <ErpButton onClick={onRetry}>Retry</ErpButton> : null}>
      {message}
    </AlertBanner>
  );
}

/* ------------------------------------------------------------ chart shells */

export function ChartCard({ title, note, children, action, height = 260, empty = false, emptyMessage = 'No data for this period.' }) {
  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-stone-200 bg-white">
      <div className="flex items-start justify-between gap-2 border-b border-stone-100 px-4 py-2.5">
        <div className="min-w-0">
          <h3 className="text-[12.5px] font-bold uppercase tracking-[0.05em] text-stone-800">{title}</h3>
          {note ? <p className="text-xs text-stone-500">{note}</p> : null}
        </div>
        {action}
      </div>
      <div className="min-w-0 p-3" style={{ height }}>
        {empty ? <div className="flex h-full items-center justify-center text-sm text-stone-400">{emptyMessage}</div> : children}
      </div>
    </section>
  );
}

/**
 * Ranked horizontal bars (category mix, top services). rows: [{ label, value, sub }].
 * Works without a chart library and prints cleanly.
 */
export function BreakdownCard({ title, note, rows = [], format = money, tone: toneName = 'ops', empty = 'No data for this period.', limit }) {
  const t = tone(toneName);
  const visible = limit ? rows.slice(0, limit) : rows;
  const max = Math.max(0, ...visible.map((row) => Number(row.value) || 0));
  return (
    <ReportSection title={title} note={note}>
      {visible.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-stone-400">{empty}</p>
      ) : (
        <ul className="space-y-2.5 px-4 py-3">
          {visible.map((row) => {
            const width = max > 0 ? Math.max(2, (Number(row.value) / max) * 100) : 0;
            return (
              <li key={row.label}>
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="min-w-0 truncate font-medium text-stone-700">{row.label}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-stone-900">{format(row.value)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
                  <div className={`h-full rounded-full ${t.dot}`} style={{ width: `${width}%` }} />
                </div>
                {row.sub ? <p className="mt-0.5 text-[11px] text-stone-400">{row.sub}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </ReportSection>
  );
}

/* ------------------------------------------------------------------- print */

export function PrintHeader({ salonName = 'The Hair Cut', title, period, generatedAt, context }) {
  return (
    <div className="print-only mb-4 border-b-2 border-stone-900 pb-2">
      <p className="text-lg font-extrabold">{salonName}</p>
      <p className="text-sm font-bold">{title}</p>
      <p className="text-xs">Period: {period}</p>
      {context ? <p className="text-xs">{context}</p> : null}
      {generatedAt ? <p className="text-xs">Generated: {generatedAt}</p> : null}
    </div>
  );
}
