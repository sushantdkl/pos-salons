'use client';

/**
 * Business Day history table. Tapping a day (or View) opens the full day report popup; the
 * arrow beside the date expands its store sessions inline (persisted close snapshots and
 * counted note breakdown). Used by Opening & Closing and Business Day History.
 */

import { fmtDate } from '@/lib/dates/display';
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { CASH_DENOMINATIONS } from '@/lib/business-day/denominations';
import { FinancialTable, money, StatusBadge } from '@/components/erp';
import { BusinessDayReport } from '@/components/store/business-day-report';

export function formatBusinessDate(iso) {
  if (!iso) return '—';
  return fmtDate(String(iso).slice(0, 10));
}

export function formatNepalTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-US', { timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit' });
}

function differenceState(value) {
  const amount = Number(value || 0);
  return amount === 0 ? 'MATCHED' : amount < 0 ? 'SHORT' : 'OVER';
}

const formatDate = formatBusinessDate;
const formatTime = formatNepalTime;

function DenominationList({ denominations }) {
  if (!denominations) return <p className="text-[11px] text-stone-400">Note breakdown not recorded for this close.</p>;
  const rows = CASH_DENOMINATIONS.map((value) => ({ value, quantity: Number(denominations[String(value)] || 0) })).filter((row) => row.quantity > 0);
  if (!rows.length) return <p className="text-[11px] text-stone-400">Drawer counted as empty.</p>;
  return (
    <ul className="mt-1 grid grid-cols-2 gap-x-3 text-[11.5px] text-stone-600">
      {rows.map((row) => (
        <li key={row.value} className="flex justify-between tabular-nums">
          <span>Rs {row.value.toLocaleString('en-IN')} × {row.quantity}</span>
          <span className="font-semibold text-stone-800">{money(row.value * row.quantity)}</span>
        </li>
      ))}
    </ul>
  );
}

function DayDetail({ day }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {day.sessionDetails.length === 0 ? <p className="text-xs text-stone-500">No sessions recorded.</p> : day.sessionDetails.map((session) => (
        <div key={session.id} className="rounded-xl border border-stone-200 bg-white px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-bold text-stone-900">Session {session.sessionNumber}</p>
            {session.status === 'OPEN' ? <StatusBadge status="OPEN" /> : <StatusBadge status={differenceState(session.difference)} label={`${differenceState(session.difference)}${session.difference ? ` ${money(Math.abs(session.difference))}` : ''}`} />}
          </div>
          <p className="mt-0.5 text-[11px] text-stone-500">
            {formatTime(session.openedAt)} → {session.closedAt ? formatTime(session.closedAt) : 'still open'}
            {session.openedBy ? ` · opened by ${session.openedBy}` : ''}{session.closedBy ? ` · closed by ${session.closedBy}` : ''}
            {session.forceClosed ? ` · force closed${session.forceCloseReason ? `: ${session.forceCloseReason}` : ''}` : ''}
          </p>
          <div className="mt-1.5 grid grid-cols-3 gap-2 text-[11.5px]">
            {[['Starting', session.startingCash], ['Expected', session.status === 'OPEN' ? null : session.expectedCash], ['Counted', session.status === 'OPEN' ? null : session.countedCash]].map(([label, value]) => (
              <div key={label}>
                <p className="text-[10px] uppercase text-stone-400">{label}</p>
                <p className="font-semibold tabular-nums text-stone-800">{value === null ? '—' : money(value)}</p>
              </div>
            ))}
          </div>
          {session.status === 'CLOSED' ? <div className="mt-2 border-t border-stone-100 pt-1.5"><DenominationList denominations={session.denominations} /></div> : null}
          {session.closingNote ? <p className="mt-1.5 text-[11px] italic text-stone-500">“{session.closingNote}”</p> : null}
        </div>
      ))}
    </div>
  );
}

export default function BusinessDayHistory({ days }) {
  const [expanded, setExpanded] = useState(null);
  const [reportDay, setReportDay] = useState(null);
  const columns = [
    {
      key: 'date', label: 'Business date', render: (day) => (
        <button type="button" onClick={(event) => { event.stopPropagation(); setExpanded(expanded === day.id ? null : day.id); }} className="inline-flex items-center gap-1 font-semibold text-stone-900" aria-expanded={expanded === day.id} title="Show store sessions">
          {expanded === day.id ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
          {formatDate(day.businessDate)}
        </button>
      ),
    },
    { key: 'opened', label: 'Opened', render: (day) => formatTime(day.openedAt) },
    { key: 'closed', label: 'Closed', render: (day) => (day.status === 'OPEN' ? '—' : formatTime(day.closedAt || day.sessionDetails.at(-1)?.closedAt)) },
    { key: 'openedBy', label: 'Opened by', render: (day) => day.openedBy || '—' },
    { key: 'closedBy', label: 'Closed by', render: (day) => day.closedBy || day.sessionDetails.at(-1)?.closedBy || '—' },
    { key: 'opening', label: 'Opening cash', align: 'right', render: (day) => money(day.startingCash) },
    { key: 'expected', label: 'Expected', align: 'right', render: (day) => (day.finalExpectedCash === null ? '—' : money(day.finalExpectedCash)) },
    { key: 'counted', label: 'Counted', align: 'right', render: (day) => (day.finalCountedCash === null ? '—' : money(day.finalCountedCash)) },
    {
      key: 'difference', label: 'Difference', align: 'right', render: (day) => (day.finalCountedCash === null ? '—' : (
        <span className={day.difference === 0 ? 'text-emerald-700' : day.difference < 0 ? 'font-semibold text-rose-700' : 'font-semibold text-amber-700'}>
          {day.difference > 0 ? '+' : ''}{money(day.difference)}
        </span>
      )),
    },
    { key: 'sales', label: 'Net sales', align: 'right', render: (day) => <span className="font-semibold text-stone-900">{money(day.netSales)}</span> },
    { key: 'status', label: 'Status', render: (day) => <StatusBadge status={day.status === 'OPEN' ? 'OPEN' : 'CLOSED'} /> },
    {
      key: 'actions', label: '', render: (day) => (
        <button type="button" onClick={(event) => { event.stopPropagation(); setReportDay(day.id); }} className="text-xs font-bold text-indigo-700 hover:underline">
          View
        </button>
      ),
    },
  ];
  const open = days.find((day) => day.id === expanded);
  return (
    <div className="space-y-2">
      <FinancialTable columns={columns} rows={days} empty="No business days recorded yet." caption="Business day history" onRowClick={(day) => setReportDay(day.id)} />
      {open ? (
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.05em] text-stone-500">
            {formatDate(open.businessDate)} · store sessions — each session reconciles on its own; balances are never added together
          </p>
          <DayDetail day={open} />
        </div>
      ) : null}
      {reportDay ? <BusinessDayReport dayId={reportDay} onClose={() => setReportDay(null)} /> : null}
    </div>
  );
}

