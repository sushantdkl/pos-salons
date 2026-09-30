'use client';

/**
 * The one right-hand detail / form panel (same shell as the Bill details drawer).
 * The body scrolls; `footer` stays pinned to the bottom so Save is always visible.
 *
 *   <SidePanel open title="Expense" eyebrow="Expense details" icon={Receipt} onClose={…} footer={…}>…</SidePanel>
 */

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export function SidePanel({
  open = true, title, eyebrow, icon: Icon, subtitle, badge, onClose, children, footer, width = 'max-w-lg', label,
}) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const onKey = (event) => { if (event.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (previous && typeof previous.focus === 'function') previous.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label={label || (typeof title === 'string' ? title : eyebrow)} onClick={onClose}>
      <aside ref={panelRef} tabIndex={-1} className={`flex h-full w-full ${width} flex-col bg-white shadow-2xl outline-none`} onClick={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-3 border-b border-stone-200 px-5 py-4">
          <div className="min-w-0">
            {eyebrow ? <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-stone-500">{Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}{eyebrow}</p> : null}
            <h2 className="mt-1 truncate text-xl font-bold text-stone-950">{title}</h2>
            {subtitle ? <p className="text-sm text-stone-500">{subtitle}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {badge}
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100"><X className="h-5 w-5" /></button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <footer className="border-t border-stone-200 bg-white px-5 py-3 shadow-[0_-6px_16px_rgba(0,0,0,0.04)]">{footer}</footer> : null}
      </aside>
    </div>
  );
}

/** Label / value row used inside detail panels. */
export function DetailRow({ label, value, strong = false, tone = '' }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <dt className="text-stone-500">{label}</dt>
      <dd className={`text-right tabular-nums ${strong ? 'text-base font-bold text-stone-950' : 'font-medium text-stone-800'} ${tone}`}>{value ?? '—'}</dd>
    </div>
  );
}

export function DetailCard({ title, children, className = '' }) {
  return (
    <section className={`rounded-xl border border-stone-200 p-3 ${className}`}>
      {title ? <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-stone-500">{title}</h3> : null}
      <dl className="divide-y divide-stone-100">{children}</dl>
    </section>
  );
}
