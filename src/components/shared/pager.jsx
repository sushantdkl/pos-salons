'use client';

/**
 * Numbered pager: « Prev 1 2 3 4 5 … 12 Next »  with an optional rows-per-page picker.
 * Pages are 1-based. Server-paged lists pass `total`; the pager never slices data itself.
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';

function pageList(current, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
  const set = new Set([1, pages, current, current - 1, current + 1]);
  if (current <= 3) [2, 3, 4, 5].forEach((value) => set.add(value));
  if (current >= pages - 2) [pages - 1, pages - 2, pages - 3, pages - 4].forEach((value) => set.add(value));
  const sorted = [...set].filter((value) => value >= 1 && value <= pages).sort((a, b) => a - b);
  const out = [];
  sorted.forEach((value, index) => {
    if (index > 0 && value - sorted[index - 1] > 1) out.push(`gap-${value}`);
    out.push(value);
  });
  return out;
}

const BTN = 'inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg border px-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40';

export function Pager({ page, pages, total, pageSize, onPage, onPageSize, sizes = [25, 50, 100], label = 'records' }) {
  const current = Math.min(Math.max(1, page), Math.max(1, pages));
  const first = total ? (current - 1) * pageSize + 1 : 0;
  const last = Math.min(total, current * pageSize);
  return (
    <nav aria-label="Pages" className="flex flex-col gap-3 border-t border-stone-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-stone-500">{total ? `${first}–${last} of ${total} ${label}` : `No ${label}`}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {onPageSize ? (
          <label className="mr-2 flex items-center gap-1.5 text-xs text-stone-500">Rows
            <select value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))} className="h-9 rounded-lg border border-stone-300 bg-white px-2 text-sm text-stone-800">
              {sizes.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
        ) : null}
        <button type="button" className={`${BTN} border-stone-200 bg-white text-stone-700 hover:bg-stone-50`} disabled={current <= 1} onClick={() => onPage(current - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /><span className="hidden sm:inline">Prev</span></button>
        {pageList(current, Math.max(1, pages)).map((item) => (typeof item === 'string'
          ? <span key={item} className="px-1 text-stone-400">…</span>
          : (
            <button key={item} type="button" onClick={() => onPage(item)} aria-current={item === current ? 'page' : undefined}
              className={`${BTN} ${item === current ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'}`}>
              {item}
            </button>
          )))}
        <button type="button" className={`${BTN} border-stone-200 bg-white text-stone-700 hover:bg-stone-50`} disabled={current >= pages} onClick={() => onPage(current + 1)} aria-label="Next page"><span className="hidden sm:inline">Next</span><ChevronRight className="h-4 w-4" /></button>
      </div>
    </nav>
  );
}
