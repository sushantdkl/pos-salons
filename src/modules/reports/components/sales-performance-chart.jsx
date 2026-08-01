'use client';

import { useId, useMemo, useState } from 'react';
import { formatCurrency } from '@/lib/currency';

/**
 * Sales trend chart, drawn as inline SVG.
 *
 * The project has no charting dependency and this needs one series with a gradient fill and a
 * hover tooltip, so a hand-drawn SVG is smaller and faster than pulling in a chart library.
 *
 * The series is server-calculated (getSalesSeries) and already zero-filled, so the number of
 * points is exactly the number of calendar buckets in the period.
 */

const VIEW_WIDTH = 760;
const VIEW_HEIGHT = 260;
const PADDING = { top: 16, right: 16, bottom: 34, left: 62 };

// Design tokens (Hair Cut POS redesign spec).
const ACCENT = '#6B46E5';
const GRID = '#F0ECE6';
const AXIS_TEXT = '#A69E94';
const LABEL_TEXT = '#8A837B';
const INK = '#17140F';
const CHART_FONT = "'IBM Plex Sans', system-ui, sans-serif";

function niceCeiling(value) {
  if (value <= 0) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function compactRs(value) {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 100000) return `${Math.round(amount / 1000)}k`;
  if (Math.abs(amount) >= 1000) return `${(amount / 1000).toFixed(1)}k`;
  return String(Math.round(amount));
}

function ChartSkeleton() {
  return (
    <div className="mt-3.5 h-[250px] animate-pulse rounded-xl" style={{ background: '#EDE9E4' }} aria-hidden="true" />
  );
}

export default function SalesPerformanceChart({ series, loading, error, onRetry, periodLabel }) {
  const gradientId = useId();
  const [activeIndex, setActiveIndex] = useState(null);

  const points = useMemo(() => (Array.isArray(series) ? series : []), [series]);
  const totalNetSales = useMemo(
    () => points.reduce((sum, point) => sum + Number(point.netSales || 0), 0),
    [points]
  );
  const hasSales = totalNetSales > 0;

  const geometry = useMemo(() => {
    if (points.length === 0) return null;
    const maxValue = niceCeiling(Math.max(...points.map((p) => Number(p.netSales || 0)), 0));
    const innerWidth = VIEW_WIDTH - PADDING.left - PADDING.right;
    const innerHeight = VIEW_HEIGHT - PADDING.top - PADDING.bottom;
    const stepX = points.length > 1 ? innerWidth / (points.length - 1) : 0;

    const coords = points.map((point, index) => {
      const x = points.length > 1 ? PADDING.left + index * stepX : PADDING.left + innerWidth / 2;
      const value = Number(point.netSales || 0);
      const y = PADDING.top + innerHeight - (maxValue > 0 ? (value / maxValue) * innerHeight : 0);
      return { x, y, value, point };
    });

    const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`).join(' ');
    const area = `${line} L ${coords[coords.length - 1].x.toFixed(2)} ${(PADDING.top + innerHeight).toFixed(2)} L ${coords[0].x.toFixed(2)} ${(PADDING.top + innerHeight).toFixed(2)} Z`;

    const gridLines = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
      ratio,
      y: PADDING.top + innerHeight - ratio * innerHeight,
      value: maxValue * ratio,
    }));

    // Thin the x labels so they never collide on a long month.
    const labelStride = Math.max(1, Math.ceil(points.length / 8));

    return { coords, line, area, gridLines, innerHeight, labelStride };
  }, [points]);

  if (loading) return <ChartSkeleton />;

  if (error) {
    return (
      <div
        className="mt-3.5 flex min-h-[250px] flex-1 flex-col items-center justify-center gap-3 px-6 text-center"
        style={{ background: '#FDF1F0', border: '1px solid #F5D6D2', borderRadius: 14 }}
      >
        <p className="text-sm font-medium" style={{ color: '#B23A2E' }}>Unable to load sales performance. Refresh and try again.</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-[9px] px-4 py-2 text-sm font-semibold transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6B46E5]/30"
            style={{ border: '1px solid #E4DED6', background: '#fff', color: '#3A342D' }}
          >
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  if (!points.length || !hasSales) {
    return (
      <div
        className="mt-3.5 flex min-h-[250px] flex-1 flex-col items-center justify-center gap-2 px-6 text-center"
        style={{ background: '#FBFAF8', border: '1px dashed #E2DCD4', borderRadius: 14 }}
      >
        <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px]" style={{ background: '#F1EDE7', color: AXIS_TEXT }} aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 13h12M3.4 13V9.2M7 13V6M10.6 13V10" /></svg>
        </span>
        <p style={{ fontFamily: "'Manrope', system-ui, sans-serif", fontSize: 14, fontWeight: 700, color: '#3A342D' }}>No sales recorded for this period.</p>
        <p className="text-xl font-semibold" style={{ fontFamily: "'Manrope', system-ui, sans-serif", color: INK, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(0)}</p>
        <p className="text-xs" style={{ color: LABEL_TEXT }}>Net Sales</p>
      </div>
    );
  }

  const active = activeIndex !== null ? geometry.coords[activeIndex] : null;

  return (
    <div className="relative">
      {/* Accessible text equivalent of the chart. */}
      <p className="sr-only">
        {`Net sales for ${periodLabel || 'the selected period'} total ${formatCurrency(totalNetSales)} across ${points.length} points. `}
        {points.map((p) => `${p.label}: ${formatCurrency(p.netSales)}`).join('. ')}
      </p>

      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="h-[260px] w-full"
        role="img"
        aria-label={`Net sales trend for ${periodLabel || 'the selected period'}, totalling ${formatCurrency(totalNetSales)}`}
        onMouseLeave={() => setActiveIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity="0.16" />
            <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
          </linearGradient>
        </defs>

        {geometry.gridLines.map((grid) => (
          <g key={grid.ratio}>
            <line
              x1={PADDING.left}
              x2={VIEW_WIDTH - PADDING.right}
              y1={grid.y}
              y2={grid.y}
              stroke={GRID}
              strokeWidth="1"
            />
            <text x={PADDING.left - 10} y={grid.y + 4} textAnchor="end" fill={AXIS_TEXT} style={{ fontSize: 11, fontFamily: CHART_FONT }}>
              {compactRs(grid.value)}
            </text>
          </g>
        ))}

        <path d={geometry.area} fill={`url(#${gradientId})`} />
        <path d={geometry.line} fill="none" stroke={ACCENT} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />

        {geometry.coords.map((coord, index) => (
          <g key={coord.point.bucket}>
            {index % geometry.labelStride === 0 || index === points.length - 1 ? (
              <text
                x={coord.x}
                y={VIEW_HEIGHT - 12}
                textAnchor="middle"
                fill={LABEL_TEXT}
                style={{ fontSize: 11.5, fontFamily: CHART_FONT }}
              >
                {coord.point.label}
              </text>
            ) : null}
            <circle
              cx={coord.x}
              cy={coord.y}
              r={activeIndex === index ? 5 : 3.4}
              fill="#ffffff"
              stroke={ACCENT}
              strokeWidth="2"
            />
            {/* Generous invisible hit area so hover and focus work on touch and keyboard. */}
            <rect
              x={coord.x - 18}
              y={PADDING.top}
              width={36}
              height={geometry.innerHeight}
              fill="transparent"
              tabIndex={0}
              role="button"
              aria-label={`${coord.point.label}: ${formatCurrency(coord.value)} net sales from ${coord.point.bills} bills`}
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onBlur={() => setActiveIndex(null)}
              style={{ cursor: 'pointer' }}
            />
          </g>
        ))}
      </svg>

      {active ? (
        <div
          className="pointer-events-none absolute z-10 min-w-[150px] -translate-x-1/2 px-3 py-2"
          style={{
            left: `${Math.min(88, Math.max(12, (active.x / VIEW_WIDTH) * 100))}%`,
            top: 8,
            background: INK,
            color: '#fff',
            borderRadius: 10,
            boxShadow: '0 10px 24px -14px rgba(0,0,0,.8)',
          }}
        >
          <p className="text-[10.5px] uppercase" style={{ color: '#B8B0A5', letterSpacing: '.05em' }}>{active.point.label}</p>
          <dl className="mt-1 space-y-0.5 text-[11px]">
            <div className="flex items-center justify-between gap-4">
              <dt style={{ color: '#B8B0A5' }}>Net sales</dt>
              <dd className="font-semibold tabular-nums text-white" style={{ fontFamily: "'Manrope', system-ui, sans-serif" }}>{formatCurrency(active.point.netSales)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt style={{ color: '#B8B0A5' }}>Gross</dt>
              <dd className="tabular-nums" style={{ color: '#E7E2DA' }}>{formatCurrency(active.point.grossSales)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt style={{ color: '#B8B0A5' }}>Discounts</dt>
              <dd className="tabular-nums" style={{ color: '#E7E2DA' }}>{formatCurrency(active.point.discounts)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt style={{ color: '#B8B0A5' }}>Bills</dt>
              <dd className="tabular-nums" style={{ color: '#E7E2DA' }}>{active.point.bills}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      <p className="mt-2 text-[11.5px]" style={{ color: '#9A938B' }}>
        {`Net sales by day · low ${formatCurrency(Math.min(...points.map((p) => Number(p.netSales || 0))))}, peak ${formatCurrency(Math.max(...points.map((p) => Number(p.netSales || 0))))}, total ${formatCurrency(totalNetSales)}.`}
      </p>
    </div>
  );
}
