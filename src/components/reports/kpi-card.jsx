'use client';

import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { tone, toNum } from '@/components/erp';

/**
 * KPI with a comparison to the previous equal-length period. The change is only arithmetic on
 * two server figures; with a zero baseline the percentage is shown as "new" instead of ∞.
 */
export function KpiCard({ label, value, format, tone: toneName = 'neutral', emphasis = false, previous, lowerIsBetter = false, compareLabel = 'vs previous period', hint }) {
  const t = tone(toneName);
  const current = toNum(value);
  const hasPrevious = previous !== undefined && previous !== null;
  const prev = toNum(previous);
  const diff = current - prev;
  let change = null;
  if (hasPrevious) {
    if (diff === 0) change = { text: 'No change', icon: Minus, good: null };
    else if (prev === 0) change = { text: 'New this period', icon: ArrowUpRight, good: lowerIsBetter ? false : true };
    else {
      const pct = (diff / Math.abs(prev)) * 100;
      const up = diff > 0;
      change = { text: `${up ? '+' : ''}${pct.toFixed(Math.abs(pct) >= 100 ? 0 : 1)}%`, icon: up ? ArrowUpRight : ArrowDownRight, good: lowerIsBetter ? !up : up };
    }
  }
  const changeClass = change?.good === null ? 'bg-stone-100 text-stone-600' : change?.good ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700';
  const Icon = change?.icon;
  return (
    <div className={`relative min-w-0 overflow-hidden rounded-xl border bg-white px-4 pb-3 pt-3.5 ${emphasis ? t.border : 'border-stone-200'}`}>
      <span className={`absolute inset-x-0 top-0 h-1 ${t.dot}`} aria-hidden="true" />
      <p className="truncate text-[11px] font-bold uppercase tracking-[0.06em] text-stone-500">{label}</p>
      <p className={`mt-1 truncate font-[family-name:var(--font-dashboard-heading)] text-[22px] font-extrabold tabular-nums ${emphasis ? t.strong : 'text-stone-900'}`}>{format(value)}</p>
      {change ? (
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[11.5px]" title={`Previous period: ${format(previous)}`}>
          <span className={`inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 font-bold tabular-nums ${changeClass}`}>
            <Icon className="h-3 w-3" aria-hidden="true" />{change.text}
          </span>
          <span className="truncate text-stone-400">{compareLabel}</span>
        </p>
      ) : hint ? <p className="mt-1 truncate text-[11.5px] text-stone-400">{hint}</p> : null}
    </div>
  );
}
