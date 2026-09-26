'use client';

/**
 * Chart primitives on recharts. Every chart:
 *   - renders only server-aggregated rows (no maths beyond display),
 *   - handles zero rows, a single point and very large values,
 *   - resizes with its container (ResponsiveContainer) so it never overflows the page.
 */

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { CHART_SERIES, count, money, moneyShort, toNum } from './tokens';

const AXIS = { fontSize: 11, fill: '#78716c' };

function hasValues(rows, keys) {
  return rows.some((row) => keys.some((key) => toNum(row[key]) !== 0));
}

function EmptyChart({ message = 'No data for this period.' }) {
  return <div className="flex h-full items-center justify-center text-sm text-stone-400">{message}</div>;
}

function MoneyTooltip({ active, payload, label, format = money }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs shadow-sm">
      {label !== undefined ? <p className="mb-1 font-bold text-stone-800">{label}</p> : null}
      {payload.map((item) => (
        <p key={item.dataKey || item.name} className="flex items-center gap-2 text-stone-600">
          <span className="h-2 w-2 rounded-full" style={{ background: item.color || item.payload?.fill }} />
          <span>{item.name}</span>
          <span className="ml-auto font-semibold tabular-nums text-stone-900">{format(item.value)}</span>
        </p>
      ))}
    </div>
  );
}

/**
 * Trend over time. series: [{ key, label, color }]. One point renders as a bar chart, because
 * an area with a single point draws nothing meaningful.
 */
export function TrendChart({ rows = [], series, format = money, axisFormat = moneyShort, xKey = 'label' }) {
  const keys = series.map((item) => item.key);
  if (!rows.length || !hasValues(rows, keys)) return <EmptyChart />;
  if (rows.length === 1) {
    return <GroupedBarChart rows={rows} series={series} format={format} axisFormat={axisFormat} xKey={xKey} />;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          {series.map((item) => (
            <linearGradient key={item.key} id={`grad-${item.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={item.color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={item.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke="#f0ece6" vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} minTickGap={16} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={64} tickFormatter={axisFormat} />
        <Tooltip content={<MoneyTooltip format={format} />} />
        {series.length > 1 ? <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} /> : null}
        {series.map((item) => (
          <Area
            key={item.key}
            type="monotone"
            dataKey={item.key}
            name={item.label}
            stroke={item.color}
            strokeWidth={2}
            fill={`url(#grad-${item.key})`}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function GroupedBarChart({ rows = [], series, format = money, axisFormat = moneyShort, xKey = 'label', stacked = false }) {
  const keys = series.map((item) => item.key);
  if (!rows.length || !hasValues(rows, keys)) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#f0ece6" vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} minTickGap={8} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={64} tickFormatter={axisFormat} />
        <Tooltip content={<MoneyTooltip format={format} />} cursor={{ fill: '#f5f5f4' }} />
        {series.length > 1 ? <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} /> : null}
        {series.map((item) => (
          <Bar
            key={item.key}
            dataKey={item.key}
            name={item.label}
            fill={item.color}
            stackId={stacked ? 'stack' : undefined}
            radius={stacked ? 0 : [4, 4, 0, 0]}
            maxBarSize={42}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Ranked horizontal bars for category/top-N breakdowns. rows: [{ label, value }]. */
export function HorizontalBarChart({ rows = [], format = money, axisFormat = moneyShort, color = CHART_SERIES[0], name = 'Value' }) {
  const data = rows.filter((row) => toNum(row.value) !== 0);
  if (!data.length) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
        <CartesianGrid stroke="#f0ece6" horizontal={false} />
        <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={axisFormat} />
        <YAxis type="category" dataKey="label" tick={AXIS} tickLine={false} axisLine={false} width={110} />
        <Tooltip content={<MoneyTooltip format={format} />} cursor={{ fill: '#f5f5f4' }} />
        <Bar dataKey="value" name={name} fill={color} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Donut for part-of-whole (payment mix, customer mix). rows: [{ label, value, color? }]. */
/** stacked: legend under the ring, for narrow cards. */
export function DonutChart({ rows = [], format = money, centerLabel, stacked = false }) {
  const data = rows.filter((row) => toNum(row.value) > 0);
  if (!data.length) return <EmptyChart />;
  const total = data.reduce((sum, row) => sum + toNum(row.value), 0);
  return (
    <div className={`flex h-full min-w-0 flex-col items-center gap-2 ${stacked ? '' : 'sm:flex-row'}`}>
      <div className={`relative w-full ${stacked ? 'min-h-0 flex-1' : 'h-full min-h-[150px] sm:w-1/2'}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="58%" outerRadius="85%" paddingAngle={data.length > 1 ? 2 : 0} isAnimationActive={false}>
              {data.map((row, index) => <Cell key={row.label} fill={row.color || CHART_SERIES[index % CHART_SERIES.length]} />)}
            </Pie>
            <Tooltip content={<MoneyTooltip format={format} />} />
          </PieChart>
        </ResponsiveContainer>
        {centerLabel ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] font-bold uppercase tracking-wide text-stone-400">{centerLabel}</span>
            <span className="text-sm font-extrabold tabular-nums text-stone-900">{format(total)}</span>
          </div>
        ) : null}
      </div>
      <ul className={`w-full space-y-1.5 text-[13px] ${stacked ? '' : 'sm:w-1/2'}`}>
        {data.map((row, index) => (
          <li key={row.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: row.color || CHART_SERIES[index % CHART_SERIES.length] }} />
            <span className="min-w-0 flex-1 truncate text-stone-600">{row.label}</span>
            <span className="font-semibold tabular-nums text-stone-900">{format(row.value)}</span>
            <span className="w-11 text-right text-[11px] tabular-nums text-stone-400">{total > 0 ? `${((toNum(row.value) / total) * 100).toFixed(0)}%` : '—'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const countFormat = count;
