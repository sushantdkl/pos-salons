'use client';

/**
 * Analytics kit — the owner dashboard's building blocks. Barber-salon look: warm stone
 * surfaces, charcoal + gold for the headline figure, one meaning-colour per card (the ERP
 * tones). Components only lay out server figures; nothing here does money maths.
 */

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART_SERIES, count, money, moneyShort, tone, toNum } from '@/components/erp';

/** Rupees for big card figures: "Rs 12,05,150" when whole, "Rs 67.50" when not. */
export function rupees(value) {
  const n = toNum(value);
  if (Number.isInteger(Math.round(n * 100) / 100)) {
    return `${n < 0 ? '-' : ''}Rs ${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  }
  return money(n);
}

const ICON_TONES = {
  inflow: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  outflow: 'bg-rose-50 text-rose-600 ring-rose-100',
  cash: 'bg-amber-50 text-amber-600 ring-amber-100',
  online: 'bg-sky-50 text-sky-600 ring-sky-100',
  ledger: 'bg-indigo-50 text-indigo-600 ring-indigo-100',
  hrm: 'bg-violet-50 text-violet-600 ring-violet-100',
  crm: 'bg-pink-50 text-pink-600 ring-pink-100',
  ops: 'bg-teal-50 text-teal-600 ring-teal-100',
  gold: 'bg-[#F6EEDC] text-[#9B742D] ring-[#EBDDBB]',
  neutral: 'bg-stone-100 text-stone-600 ring-stone-200',
};

export function IconBubble({ icon: Icon, tone: toneName = 'neutral', size = 'md' }) {
  const box = size === 'sm' ? 'h-9 w-9' : 'h-11 w-11';
  return (
    <span className={`inline-flex ${box} shrink-0 items-center justify-center rounded-full ring-1 ${ICON_TONES[toneName] || ICON_TONES.neutral}`}>
      {Icon ? <Icon className={size === 'sm' ? 'h-4 w-4' : 'h-[18px] w-[18px]'} aria-hidden="true" /> : null}
    </span>
  );
}

/** A white section card with an optional icon heading (eyebrow / title / description). */
export function DashSection({ icon, tone: toneName = 'gold', eyebrow, title, description, action, children, className = '', padded = true }) {
  return (
    <section className={`min-w-0 overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[0_1px_3px_rgba(28,25,23,0.05)] ${padded ? 'p-4 sm:p-6' : ''} ${className}`}>
      {title ? (
        <div className={`mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between ${padded ? '' : 'px-4 pt-4 sm:px-6 sm:pt-6'}`}>
          <div className="flex min-w-0 items-start gap-3">
            {icon ? <IconBubble icon={icon} tone={toneName} /> : null}
            <div className="min-w-0">
              {eyebrow ? <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-400">{eyebrow}</p> : null}
              <h2 className="mt-0.5 text-lg font-bold text-stone-900">{title}</h2>
              {description ? <p className="mt-1 max-w-3xl text-sm text-stone-500">{description}</p> : null}
            </div>
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Group heading outside cards ("Money flow", "Visual dashboard"). */
export function GroupHeading({ eyebrow, title, description }) {
  return (
    <div className="mb-3">
      {eyebrow ? <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-400">{eyebrow}</p> : null}
      <h2 className="text-[17px] font-bold text-stone-900">{title}</h2>
      {description ? <p className="mt-0.5 text-sm text-stone-500">{description}</p> : null}
    </div>
  );
}

/** Makes a card a link (href) or an in-page action (onClick), with a hover arrow. */
function Clickable({ href, onClick, label, className, children }) {
  const cls = `group relative block text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A55C] ${className}`;
  const arrow = <ArrowUpRight className="absolute right-4 top-4 h-4 w-4 text-stone-300 transition-colors group-hover:text-[#9B742D]" aria-hidden="true" />;
  if (href) return <Link href={href} className={cls} aria-label={`${label} — open details`}>{children}{arrow}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={`${cls} w-full`} aria-label={`${label} — open details`}>{children}{arrow}</button>;
  return <div className={className}>{children}</div>;
}

/** Money-flow card. `highlight` renders the charcoal + gold headline card. */
export function FlowCard({ icon: Icon, tone: toneName = 'neutral', label, value, hint, highlight = false, href, onClick, children }) {
  if (highlight) {
    return (
      <Clickable href={href} onClick={onClick} label={label} className="col-span-2 min-w-0 sm:col-span-1">
      <div className="relative h-full min-w-0 overflow-hidden rounded-2xl bg-[#1C1917] p-5 text-white shadow-[0_8px_24px_rgba(28,25,23,0.25)]">
        {/* A quiet barber-pole stripe in the corner. */}
        <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rotate-12 rounded-2xl opacity-20" style={{ background: 'repeating-linear-gradient(135deg, #D7B56D 0 8px, transparent 8px 16px)' }} aria-hidden="true" />
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-[#E8CC8A] ring-1 ring-white/15">{Icon ? <Icon className="h-[18px] w-[18px]" aria-hidden="true" /> : null}</span>
        <p className="mt-5 text-sm font-semibold text-[#E8CC8A]">{label}</p>
        <p className="mt-0.5 truncate font-[family-name:var(--font-dashboard-heading)] text-[24px] font-extrabold tabular-nums">{value}</p>
        {hint ? <p className="mt-1 text-xs text-white/60">{hint}</p> : null}
        {children}
      </div>
      </Clickable>
    );
  }
  return (
    <Clickable href={href} onClick={onClick} label={label} className="min-w-0">
    <div className={`h-full min-w-0 rounded-2xl border border-stone-200/80 bg-white p-4 shadow-[0_1px_3px_rgba(28,25,23,0.05)] transition-all sm:p-5 ${href || onClick ? 'group-hover:-translate-y-0.5 group-hover:border-[#D9C089] group-hover:shadow-[0_6px_18px_rgba(28,25,23,0.10)]' : ''}`}>
      <IconBubble icon={Icon} tone={toneName} />
      <p className="mt-4 truncate text-[13px] font-medium text-stone-600 sm:mt-5 sm:text-sm">{label}</p>
      <p className="mt-0.5 truncate font-[family-name:var(--font-dashboard-heading)] text-[18px] font-extrabold tabular-nums text-stone-900 sm:text-[22px]">{value}</p>
      {hint ? <p className="mt-1 truncate text-xs text-stone-400" title={hint}>{hint}</p> : null}
      {children}
    </div>
    </Clickable>
  );
}

/** Icon + label + value, for the "How payment was recorded" rows. */
export function MiniStat({ icon, tone: toneName = 'neutral', label, value, sub, href, onClick }) {
  const body = (
    <div className={`flex min-w-0 items-start gap-3 ${href || onClick ? 'rounded-xl p-1.5 -m-1.5 transition-colors group-hover:bg-stone-50' : ''}`}>
      <IconBubble icon={icon} tone={toneName} size="sm" />
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-stone-500">{label}</p>
        <p className="truncate text-lg font-extrabold tabular-nums text-stone-900">{value}</p>
        {sub ? <p className="truncate text-[11px] text-stone-400">{sub}</p> : null}
      </div>
    </div>
  );
  if (!href && !onClick) return body;
  const cls = 'group block min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A55C] rounded-xl';
  return href
    ? <Link href={href} className={cls} title={`${label} — open details`}>{body}</Link>
    : <button type="button" onClick={onClick} className={cls} title={`${label} — open details`}>{body}</button>;
}

/** Money-control step card: label + big coloured value. */
export function StepCard({ label, value, tone: toneName = 'neutral', hint }) {
  const colour = { inflow: 'text-emerald-700', outflow: 'text-rose-700', cash: 'text-amber-700', online: 'text-sky-700', ledger: 'text-indigo-700', neutral: 'text-stone-900' }[toneName] || 'text-stone-900';
  return (
    <div className="min-w-0 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(28,25,23,0.05)]">
      <p className="text-sm font-medium text-stone-600">{label}</p>
      <p className={`mt-2 truncate font-[family-name:var(--font-dashboard-heading)] text-[24px] font-extrabold tabular-nums ${colour}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-stone-400">{hint}</p> : null}
    </div>
  );
}

export function Step({ number, title, description, children, columns = 4 }) {
  const grid = columns === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-4';
  return (
    <div className="mb-6 last:mb-0">
      <p className="text-sm font-bold text-stone-900">{number}. {title}</p>
      {description ? <p className="mb-3 text-xs text-stone-500">{description}</p> : null}
      <div className={`grid gap-4 ${grid}`}>{children}</div>
    </div>
  );
}

/**
 * Ring donut with an interactive centre: hover, tap or focus a segment (or its legend row)
 * to read its value and share. rows: [{ label, value, sub?, color? }].
 */
export function RingDonut({ rows = [], format = money, centerLabel = 'Total', empty = 'No data for this period.', height = 210, stacked = false }) {
  const data = rows.filter((row) => toNum(row.value) > 0).map((row, index) => ({ ...row, color: row.color || CHART_SERIES[index % CHART_SERIES.length] }));
  const [active, setActive] = useState(null);
  if (!data.length) return <div className="flex items-center justify-center py-12 text-sm text-stone-400">{empty}</div>;
  const total = data.reduce((sum, row) => sum + toNum(row.value), 0);
  const current = active === null ? null : data[active];
  const share = (value) => (total > 0 ? `${((toNum(value) / total) * 100).toFixed(1)}%` : '—');
  return (
    // Side-by-side only when the card itself is wide enough (container query), else stacked.
    <div className="@container min-w-0">
    <div className={`flex min-w-0 flex-col items-center gap-4 ${stacked ? '' : '@[480px]:flex-row'}`}>
      <div className="relative w-full max-w-[220px] shrink-0" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="70%" outerRadius="96%" paddingAngle={data.length > 1 ? 1.5 : 0} stroke="none" isAnimationActive={false}
              onMouseEnter={(_, index) => setActive(index)} onMouseLeave={() => setActive(null)} onClick={(_, index) => setActive(index === active ? null : index)}>
              {data.map((row, index) => <Cell key={row.label} fill={row.color} opacity={active === null || active === index ? 1 : 0.35} style={{ cursor: 'pointer', outline: 'none' }} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <span className="text-[15px] font-extrabold tabular-nums text-stone-900">{(format === money ? rupees : format)(current ? current.value : total)}</span>
          <span className="mt-0.5 line-clamp-2 text-[11px] text-stone-500">{current ? `${current.label} · ${share(current.value)}` : centerLabel}</span>
        </div>
      </div>
      <ul className={`w-full min-w-0 space-y-1 overflow-y-auto pr-1 ${stacked ? 'max-h-[180px]' : 'max-h-[230px]'}`}>
        {data.map((row, index) => (
          <li key={row.label}>
            <button type="button" onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(index)} onBlur={() => setActive(null)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors ${active === index ? 'bg-stone-100' : 'hover:bg-stone-50'}`}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: row.color }} />
              <span className="min-w-0 flex-1 truncate text-[13px] text-stone-700">{row.label}</span>
              <span className="text-right leading-tight">
                <span className="block text-[13px] font-bold tabular-nums text-stone-900">{format(row.value)}</span>
                <span className="block text-[10.5px] tabular-nums text-stone-400">{row.sub ? `${row.sub} · ` : ''}{share(row.value)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
    </div>
  );
}

/** Chart card shell (title + note + body). */
export function ChartPanel({ title, note, children, className = '' }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(28,25,23,0.05)] ${className}`}>
      <h3 className="text-[15px] font-bold text-stone-900">{title}</h3>
      {note ? <p className="text-xs text-stone-500">{note}</p> : <div className="h-1" />}
      <div className="mt-4 min-w-0">{children}</div>
    </section>
  );
}

const AXIS = { fontSize: 11, fill: '#a8a29e' };

function BarTip({ active, payload, label, format }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="mb-0.5 font-bold text-stone-800">{label}</p>
      {payload.map((item) => <p key={item.dataKey} className="text-stone-600">{item.name}: <span className="font-semibold text-stone-900">{format(item.value)}</span></p>)}
    </div>
  );
}

/** Vertical bars (by hour / by weekday). */
export function ColumnBars({ rows = [], dataKey = 'total', xKey = 'label', color = '#44403c', format = money, name = 'Sales', height = 230 }) {
  if (!rows.some((row) => toNum(row[dataKey]) !== 0)) return <div className="flex items-center justify-center py-12 text-sm text-stone-400">No data for this period.</div>;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#f0ece6" vertical={false} />
          <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} minTickGap={4} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={56} tickFormatter={format === money ? moneyShort : count} />
          <Tooltip content={<BarTip format={format} />} cursor={{ fill: '#f5f5f4' }} />
          <Bar dataKey={dataKey} name={name} fill={color} radius={[5, 5, 0, 0]} maxBarSize={44} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Ranked horizontal bars with the value printed at the end of each bar. */
export function RankedBars({ rows = [], color = '#0f766e', format = money, name = 'Revenue' }) {
  const data = rows.filter((row) => toNum(row.value) > 0);
  if (!data.length) return <div className="flex items-center justify-center py-12 text-sm text-stone-400">No data for this period.</div>;
  return (
    <div style={{ height: Math.max(160, data.length * 36 + 30) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 96, left: 4, bottom: 4 }}>
          <CartesianGrid stroke="#f0ece6" horizontal={false} />
          <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={format === money ? moneyShort : count} />
          <YAxis type="category" dataKey="label" tick={{ ...AXIS, fill: '#57534e' }} tickLine={false} axisLine={false} width={120} />
          <Tooltip content={<BarTip format={format} />} cursor={{ fill: '#f5f5f4' }} />
          <Bar dataKey="value" name={name} fill={color} radius={[0, 5, 5, 0]} maxBarSize={20} isAnimationActive={false}>
            <LabelList dataKey="value" position="right" formatter={format === money ? rupees : format} style={{ fontSize: 11, fill: '#57534e', fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Tinted ledger panel ("Money Position", "Cash In / Cash Out"). rows:
 * { section } | { label, value, sign: '+'|'-', strong, sub, muted }.
 */
export function LedgerPanel({ title, tone: toneName = 'ledger', rows = [], footnote, children }) {
  const t = tone(toneName);
  const accent = { ledger: 'border-l-indigo-500', cash: 'border-l-amber-500', online: 'border-l-sky-500', hrm: 'border-l-violet-500', inflow: 'border-l-emerald-500', outflow: 'border-l-rose-500', neutral: 'border-l-stone-400' }[toneName] || 'border-l-stone-400';
  return (
    <section className={`min-w-0 overflow-hidden rounded-2xl border border-stone-200/80 border-l-4 ${accent} bg-white shadow-[0_1px_3px_rgba(28,25,23,0.05)]`}>
      <h3 className={`border-b border-stone-200/70 px-5 py-3 text-sm font-bold ${t.band} ${t.strong}`}>{title}</h3>
      <div className="divide-y divide-stone-100">
        {rows.filter(Boolean).map((row, index) => (row.section ? (
          <p key={`s-${row.section}-${index}`} className="bg-stone-50/60 px-5 pb-1.5 pt-3 text-[11px] font-bold uppercase tracking-[0.08em] text-stone-500">{row.section}</p>
        ) : (
          <div key={`${row.label}-${index}`} className={`flex items-baseline justify-between gap-4 px-5 py-2.5 ${row.strong ? 'bg-stone-50/60' : ''}`}>
            <span className={`min-w-0 text-[13px] ${row.strong ? 'font-bold text-stone-900' : row.muted ? 'text-stone-400' : 'text-stone-700'}`}>
              {row.label}{row.sub ? <span className="ml-1.5 text-[11px] font-normal text-stone-400">{row.sub}</span> : null}
            </span>
            <span className={`shrink-0 text-[13px] tabular-nums ${row.strong ? 'font-extrabold text-stone-900' : 'font-semibold'} ${!row.strong && row.sign === '+' ? 'text-emerald-700' : ''} ${!row.strong && row.sign === '-' ? 'text-rose-700' : ''} ${!row.strong && !row.sign ? (row.muted ? 'text-stone-400' : 'text-stone-800') : ''}`}>
              {row.sign === '+' ? '+ ' : row.sign === '-' ? '− ' : ''}{typeof row.value === 'number' ? money(row.value) : row.value}
            </span>
          </div>
        )))}
      </div>
      {children}
      {footnote ? <p className="border-t border-stone-100 px-5 py-3 text-[11.5px] leading-relaxed text-stone-500">{footnote}</p> : null}
    </section>
  );
}

/** Bottom strip of small icon stats. items: [{ icon, label, value, tone }]. */
export function StatStrip({ items = [] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-2xl border border-stone-200/80 bg-white px-5 py-4 shadow-[0_1px_3px_rgba(28,25,23,0.05)] sm:grid-cols-3 lg:grid-cols-6">
      {items.map((item) => <MiniStat key={item.label} icon={item.icon} tone={item.tone || 'gold'} label={item.label} value={item.value} />)}
    </div>
  );
}

/** Simple money table with a TOTAL row. columns: [{ key, label, align, render, className }]. */
export function PlainTable({ columns, rows, total, rowKey = (row, index) => row.key ?? index, empty = 'No data for this period.', onRowClick, rowTitle = 'Open details' }) {
  return (
    <div className="min-w-0 overflow-x-auto rounded-xl border border-stone-200/80">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 bg-stone-50/80">
            {columns.map((column) => <th key={column.key} scope="col" className={`whitespace-nowrap px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-stone-500 ${column.align === 'right' ? 'text-right' : 'text-left'}`}>{column.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {rows.length === 0 ? <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-stone-400">{empty}</td></tr> : rows.map((row, index) => (
            <tr key={rowKey(row, index)}
              className={onRowClick ? 'cursor-pointer hover:bg-amber-50/60 focus:bg-amber-50/70 focus:outline-none' : 'hover:bg-stone-50/70'}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onRowClick(row); } } : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              title={onRowClick ? rowTitle : undefined}>
              {columns.map((column) => <td key={column.key} className={`whitespace-nowrap px-4 py-3 ${column.align === 'right' ? 'text-right tabular-nums' : ''} ${column.className || 'text-stone-800'}`}>{column.render ? column.render(row) : row[column.key]}</td>)}
            </tr>
          ))}
        </tbody>
        {total ? (
          <tfoot>
            <tr className="border-t-2 border-stone-800 bg-stone-50 font-bold text-stone-900">
              {columns.map((column, index) => <td key={column.key} className={`whitespace-nowrap px-4 py-3 ${column.align === 'right' ? 'text-right tabular-nums' : ''}`}>{index === 0 ? <span className="text-[12px] uppercase tracking-wide">Total</span> : total[column.key] ?? ''}</td>)}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
