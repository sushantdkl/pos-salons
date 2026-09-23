'use client';

import { useId } from 'react';
import { CASH_DENOMINATIONS, denominationTotal } from '@/lib/business-day/denominations';
import { money } from '@/components/erp/tokens';

/**
 * Note-by-note cash counter: quantity × denomination = subtotal, total auto-calculated.
 * The cashier only types how many notes they hold — never adds anything up.
 */
export function DenominationCounter({ counts, onChange, disabled = false }) {
  const id = useId();
  const setCount = (value, raw) => {
    const cleaned = String(raw).replace(/[^\d]/g, '').slice(0, 6);
    onChange({ ...counts, [String(value)]: cleaned });
  };

  return (
    <div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {CASH_DENOMINATIONS.map((value) => {
          const quantity = Number(counts[String(value)] || 0);
          const subtotal = quantity * value;
          const inputId = `${id}-${value}`;
          return (
            <div key={value} className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 ${quantity > 0 ? 'border-amber-300 bg-amber-50/60' : 'border-stone-200 bg-white'}`}>
              <label htmlFor={inputId} className="w-[68px] shrink-0 text-[13px] font-bold tabular-nums text-stone-800">
                Rs {value.toLocaleString('en-IN')}
              </label>
              <span className="text-xs text-stone-400" aria-hidden="true">×</span>
              <input
                id={inputId}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                disabled={disabled}
                value={counts[String(value)] ?? ''}
                onChange={(event) => setCount(value, event.target.value)}
                onFocus={(event) => event.target.select()}
                placeholder="0"
                aria-label={`Number of Rs ${value} notes`}
                className="h-10 min-w-0 flex-1 rounded-md border border-stone-200 bg-white px-2 text-center text-base font-semibold tabular-nums text-stone-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200 disabled:bg-stone-50"
              />
              <span className="w-[92px] shrink-0 text-right text-[12.5px] tabular-nums text-stone-500">
                = <span className={subtotal > 0 ? 'font-semibold text-stone-900' : ''}>{money(subtotal)}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { denominationTotal };
