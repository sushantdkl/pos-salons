'use client';

/** Shared HRM presentation: status badges and codes, Nepal time formatting, modal, permissions hook. */

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { StatusBadge } from '@/components/erp';
import { erpFetch } from '@/components/erp/use-report';

export const ATTENDANCE_STATUS = {
  PRESENT: { label: 'Present', code: 'P', tone: 'inflow', cell: 'bg-emerald-100 text-emerald-800' },
  LATE: { label: 'Late', code: 'L', tone: 'cash', cell: 'bg-amber-100 text-amber-800' },
  HALF_DAY: { label: 'Half day', code: 'HD', tone: 'ops', cell: 'bg-lime-100 text-lime-800' },
  ABSENT: { label: 'Absent', code: 'A', tone: 'outflow', cell: 'bg-rose-100 text-rose-800' },
  MISSING_PUNCH: { label: 'Missing punch', code: 'MP', tone: 'outflow', cell: 'bg-rose-50 text-rose-700 ring-1 ring-rose-300' },
  ON_LEAVE: { label: 'On leave', code: 'LV', tone: 'online', cell: 'bg-sky-100 text-sky-800' },
  HOLIDAY: { label: 'Holiday', code: 'H', tone: 'ledger', cell: 'bg-indigo-100 text-indigo-800' },
  OFF_DAY: { label: 'Off day', code: 'O', tone: 'neutral', cell: 'bg-stone-100 text-stone-500' },
  NOT_STARTED: { label: 'Not in yet', code: '·', tone: 'neutral', cell: 'bg-white text-stone-400' },
  UNSCHEDULED: { label: 'No shift', code: '–', tone: 'neutral', cell: 'bg-white text-stone-300' },
};

export function AttendanceBadge({ status }) {
  const meta = ATTENDANCE_STATUS[status] || { label: status, tone: 'neutral' };
  return <StatusBadge status={status} label={meta.label} tone={meta.tone} />;
}

const TZ = 'Asia/Kathmandu';

export function nepalToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

export function fmtTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(value));
}

/** A punch time, with the date when it falls on a different day than the attendance date. */
export function fmtPunch(value, attendanceDate) {
  if (!value) return '—';
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(value));
  const time = fmtTime(value);
  if (!attendanceDate || day === attendanceDate) return time;
  return `${time} (${new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: '2-digit', month: 'short' }).format(new Date(value))})`;
}

export function fmtDate(date) {
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${date}T00:00:00Z`));
}

export function fmtMinutes(minutes) {
  const value = Math.max(0, Math.round(Number(minutes) || 0));
  if (!value) return '—';
  const h = Math.floor(value / 60);
  const m = value % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** A datetime-local input value (Nepal wall clock) ⇄ ISO instant with the +05:45 offset. */
export function toLocalInput(value) {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date(value)).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`;
}
export function fromLocalInput(value) {
  return value ? `${value}:00+05:45` : null;
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const FIELD = 'mt-1 block h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900 focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-200';
export const LABEL = 'block text-xs font-bold uppercase tracking-[0.04em] text-stone-500';

export function Modal({ title, subtitle, onClose, children, footer, wide = false }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}>
        <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-5 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-stone-950">{title}</h2>
            {subtitle ? <p className="truncate text-xs text-stone-500">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-stone-200 px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

/** The viewer's HR permissions (admin: all true). */
export function useHrmPermissions() {
  const [perms, setPerms] = useState(null);
  useEffect(() => {
    let alive = true;
    erpFetch('/api/hrm/me').then((data) => { if (alive) setPerms(data.permissions || {}); }).catch(() => { if (alive) setPerms({}); });
    return () => { alive = false; };
  }, []);
  return perms;
}
