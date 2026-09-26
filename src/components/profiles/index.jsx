'use client';

/**
 * Profile building blocks shared by the Supplier and Customer ledgers: header stats, tabs,
 * per-tab CSV / print actions and the credit timeline. Presentation only — every amount,
 * balance and allocation arrives computed from the server.
 */

import { fmtDate, fmtDateTime } from '@/lib/dates/display';
import { useState } from 'react';
import { ChevronDown, CreditCard, Download, PackageCheck, Printer, ReceiptText, RotateCcw, UserRoundPlus, WalletCards } from 'lucide-react';
import { money } from '@/components/erp';

const TZ = 'Asia/Kathmandu';

export function formatDate(value) {
  if (!value) return '—';
  return fmtDate(value);
}

export function formatDateTime(value) {
  if (!value) return '—';
  return fmtDateTime(value);
}

export function ProfileStat({ label, value, tone }) {
  const color = tone === 'red' ? 'text-rose-700' : tone === 'green' ? 'text-emerald-700' : 'text-stone-950';
  return (
    <div className="min-w-0 rounded-xl border border-stone-100 bg-stone-50 px-3 py-2">
      <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-stone-400">{label}</p>
      <p className={`mt-1 truncate font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

export function ProfileTabs({ tabs, value, onChange }) {
  return (
    <nav className="print-hide mt-5 flex gap-2 overflow-x-auto border-b border-stone-200 pb-2" aria-label="Profile sections">
      {tabs.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-current={value === key ? 'page' : undefined}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${value === key ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'}`}
        >
          {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}{label}
        </button>
      ))}
    </nav>
  );
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Export the visible tab as CSV, or print the page. */
export function TabActions({ entity, tab, headers, rows }) {
  const download = () => {
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${entity} - ${tab}.csv`.replace(/[\\/:*?"<>|]/g, '-');
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="print-hide flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-4 py-2.5">
      <p className="text-sm font-semibold text-stone-700">{tab}</p>
      <div className="flex gap-2">
        <button type="button" onClick={download} disabled={!rows.length} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-stone-200 px-3 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-40"><Download className="h-3.5 w-3.5" /> CSV</button>
        <button type="button" onClick={() => window.print()} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-stone-200 px-3 text-xs font-semibold text-stone-700 hover:bg-stone-50"><Printer className="h-3.5 w-3.5" /> Print</button>
      </div>
    </div>
  );
}

/** Plain table for profile tabs. rows: array of cell arrays. */
export function ProfileTable({ headers, rows, empty, onRowClick, align = {} }) {
  if (!rows.length) return <p className="py-14 text-center text-sm text-stone-400">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-stone-100 bg-stone-50 text-[11px] uppercase tracking-wide text-stone-500">
          <tr>{headers.map((header, index) => <th key={header} scope="col" className={`px-4 py-3 font-semibold ${align[index] === 'right' ? 'text-right' : ''}`}>{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {rows.map((row, index) => (
            <tr key={index} onClick={onRowClick ? () => onRowClick(index) : undefined} onKeyDown={onRowClick ? (event) => { if (event.key === 'Enter') onRowClick(index); } : undefined} tabIndex={onRowClick ? 0 : undefined} className={`hover:bg-stone-50 ${onRowClick ? 'cursor-pointer focus:bg-amber-50/60 focus:outline-none' : ''}`}>
              {row.map((cell, cellIndex) => <td key={cellIndex} className={`px-4 py-3 text-stone-700 ${align[cellIndex] === 'right' ? 'text-right tabular-nums' : ''}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STATUS_STYLE = {
  PAID: 'bg-emerald-100 text-emerald-800',
  PARTIAL: 'bg-amber-100 text-amber-800',
  CREDIT: 'bg-rose-100 text-rose-800',
  VOID: 'bg-stone-100 text-stone-500',
  VOIDED: 'bg-stone-100 text-stone-500',
};
const STATUS_LABEL = { PAID: 'Paid', PARTIAL: 'Part paid', CREDIT: 'Credit', VOID: 'Void', VOIDED: 'Void' };

export function PayStatus({ value }) {
  const key = String(value || '').toUpperCase();
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[key] || 'bg-stone-100 text-stone-600'}`}>{STATUS_LABEL[key] || String(value || '').replaceAll('_', ' ').toLowerCase()}</span>;
}

const ICONS = { profile: UserRoundPlus, bill: ReceiptText, purchase: PackageCheck, payment: WalletCards, adjustment: RotateCcw, credit: CreditCard };

function toneClasses(tone) {
  if (tone === 'charge') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (tone === 'payment') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return 'border-stone-200 bg-stone-50 text-stone-600';
}

/**
 * events: [{ id, at, effectiveDate, kind, tone, title, description, meta[], amount, amountLabel,
 *            balance, status, allocations[{label, amount, recordId}], recordId }]
 */
export function CreditTimeline({ events, empty = 'No activity recorded.', onOpenRecord, balanceLabel = 'Balance after', coveredNoun = 'invoice' }) {
  const [expanded, setExpanded] = useState({});
  if (!events.length) return <p className="py-14 text-center text-sm text-stone-400">{empty}</p>;
  return (
    <div className="px-4 py-5 sm:px-6">
      <ol className="relative ml-4 border-l border-stone-200">
        {events.map((event) => {
          const Icon = ICONS[event.kind] || CreditCard;
          const open = event.recordId && onOpenRecord ? () => onOpenRecord(event.recordId) : null;
          const isExpanded = Boolean(expanded[event.id]);
          const void_ = String(event.status || '').toUpperCase().startsWith('VOID');
          return (
            <li key={event.id} className="relative mb-6 ml-7 last:mb-0">
              <span className={`absolute -left-[2.78rem] top-0.5 flex h-8 w-8 items-center justify-center rounded-full border-4 border-white ${toneClasses(event.tone)}`}><Icon className="h-3.5 w-3.5" aria-hidden="true" /></span>
              <time className="mb-1 block text-xs font-semibold text-stone-500">{formatDateTime(event.at)}</time>
              {event.effectiveDate ? <p className="mb-2 text-[11px] text-stone-400">Dated {formatDate(event.effectiveDate)}</p> : null}
              <article className={`rounded-xl border border-stone-200 bg-white p-4 ${open ? 'transition-colors hover:border-stone-300 hover:bg-stone-50' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className={`font-semibold text-stone-950 ${void_ ? 'line-through decoration-stone-400' : ''}`}>{event.title}</h3>
                      {event.status ? <PayStatus value={event.status} /> : null}
                    </div>
                    {event.description ? <p className="mt-1 text-sm leading-6 text-stone-600">{event.description}</p> : null}
                    {event.meta?.length ? <p className="mt-2 text-xs text-stone-400">{event.meta.join(' · ')}</p> : null}
                    {open ? <button type="button" onClick={open} className="mt-2 text-xs font-semibold text-indigo-700 hover:underline">View details</button> : null}
                  </div>
                  {event.amount > 0 ? (
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">{event.amountLabel || 'Amount'}</p>
                      <p className={`mt-0.5 font-bold tabular-nums ${event.tone === 'charge' ? 'text-rose-700' : event.tone === 'payment' ? 'text-emerald-700' : 'text-stone-950'}`}>{money(event.amount)}</p>
                      {event.balance !== null && event.balance !== undefined ? <p className="mt-1 text-xs text-stone-500">{balanceLabel}: <span className="font-semibold tabular-nums text-stone-700">{money(event.balance)}</span></p> : null}
                    </div>
                  ) : null}
                </div>
                {event.allocations?.length ? (
                  <div className="mt-3 border-t border-stone-100 pt-3">
                    <button type="button" onClick={() => setExpanded((current) => ({ ...current, [event.id]: !current[event.id] }))} aria-expanded={isExpanded} className="flex w-full items-center justify-between text-left text-sm font-semibold text-stone-700">
                      <span>{event.allocations.length} {coveredNoun}{event.allocations.length === 1 ? '' : 's'} covered</span>
                      <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                    {isExpanded ? (
                      <div className="mt-2 divide-y divide-stone-100 rounded-lg border border-stone-100 bg-stone-50">
                        {event.allocations.map((allocation, index) => {
                          const openAllocation = allocation.recordId && onOpenRecord ? () => onOpenRecord(allocation.recordId) : null;
                          return (
                            <button key={`${allocation.label}-${index}`} type="button" disabled={!openAllocation} onClick={() => openAllocation?.()} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-white disabled:cursor-default">
                              <span className={`font-medium ${openAllocation ? 'text-indigo-700' : 'text-stone-700'}`}>{allocation.label}</span>
                              <span className="font-semibold tabular-nums text-stone-800">{money(allocation.amount)}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </article>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
