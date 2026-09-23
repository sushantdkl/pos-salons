'use client';

/**
 * APPOINTMENTS — front-desk calendar (admin + cashier).
 * Every rule (conflicts, working hours, transitions, overrides, one bill per appointment) is
 * enforced by /api/appointments; this page only presents and submits.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock, CalendarPlus, ChevronLeft, ChevronRight, Clock, ListPlus, Receipt, Search, Settings2, X,
} from 'lucide-react';
import {
  AlertBanner, EmptyState, ErpButton, ErpPage, ErrorState, FinancialTable, LoadingState, MetricCard, MetricGroup,
  money, PageHeader, RefreshButton, SectionHeading, StatusBadge,
} from '@/components/erp';
import { erpFetch } from '@/components/erp/use-report';

const STATUS_META = {
  PENDING: { label: 'Pending', tone: 'cash', block: 'border-amber-300 bg-amber-50 text-amber-900' },
  CONFIRMED: { label: 'Confirmed', tone: 'online', block: 'border-sky-300 bg-sky-50 text-sky-900' },
  CHECKED_IN: { label: 'Checked in', tone: 'ledger', block: 'border-indigo-300 bg-indigo-50 text-indigo-900' },
  IN_SERVICE: { label: 'In service', tone: 'hrm', block: 'border-violet-300 bg-violet-50 text-violet-900' },
  COMPLETED: { label: 'Completed', tone: 'inflow', block: 'border-emerald-300 bg-emerald-50 text-emerald-900' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', block: 'border-stone-300 bg-stone-100 text-stone-500 line-through' },
  NO_SHOW: { label: 'No show', tone: 'outflow', block: 'border-rose-300 bg-rose-50 text-rose-800' },
};
const SOURCES = [['PHONE', 'Phone'], ['WALK_IN', 'Walk-in'], ['WHATSAPP', 'WhatsApp'], ['STAFF', 'Staff entry'], ['REBOOKING', 'Rebooking'], ['WEBSITE', 'Website']];
const ACTIONS = {
  PENDING: ['confirm', 'check_in', 'cancel', 'no_show'],
  CONFIRMED: ['check_in', 'cancel', 'no_show'],
  CHECKED_IN: ['start', 'complete', 'cancel'],
  IN_SERVICE: ['complete'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};
const ACTION_LABEL = { confirm: 'Confirm', check_in: 'Check in', start: 'Start service', complete: 'Complete', cancel: 'Cancel', no_show: 'No show' };
const HOUR_PX = 64;

function nepalToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());
}
function addDays(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function weekStart(iso) {
  return addDays(iso, -new Date(`${iso}T00:00:00Z`).getUTCDay());
}
function dateLabel(iso, options = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}
function toMinutes(value) {
  const [hours, minutes] = String(value || '0:0').split(':').map(Number);
  return hours * 60 + minutes;
}
function user() {
  try { return JSON.parse(localStorage.getItem('pos_user') || '{}'); } catch { return {}; }
}

/* ------------------------------------------------------------ calendar views */

function DayView({ date, appointments, staff, openTime, closeTime, onSelect }) {
  const open = Math.floor(toMinutes(openTime) / 60) * 60;
  const close = Math.ceil(toMinutes(closeTime) / 60) * 60;
  const hours = [];
  for (let minute = open; minute < close; minute += 60) hours.push(minute);
  const columns = [...staff.map((member) => ({ id: String(member.id), name: member.full_name })), { id: 'none', name: 'Unassigned' }]
    .filter((column) => column.id !== 'none' || appointments.some((item) => !item.staffId));
  const height = ((close - open) / 60) * HOUR_PX;

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <div className="overflow-x-auto">
        <div className="grid min-w-max" style={{ gridTemplateColumns: `56px repeat(${columns.length}, minmax(150px, 1fr))` }}>
          <div className="sticky left-0 z-10 border-b border-r border-stone-200 bg-stone-50" />
          {columns.map((column) => (
            <div key={column.id} className="truncate border-b border-r border-stone-200 bg-stone-50 px-2 py-2 text-xs font-bold text-stone-700 last:border-r-0">
              {column.name}
            </div>
          ))}
          <div className="sticky left-0 z-10 border-r border-stone-200 bg-white" style={{ height }}>
            {hours.map((minute) => (
              <div key={minute} className="border-b border-stone-100 pr-1 text-right text-[10.5px] tabular-nums text-stone-400" style={{ height: HOUR_PX }}>
                {String(Math.floor(minute / 60)).padStart(2, '0')}:00
              </div>
            ))}
          </div>
          {columns.map((column) => (
            <div key={column.id} className="relative border-r border-stone-100 last:border-r-0" style={{ height }}>
              {hours.map((minute) => <div key={minute} className="border-b border-stone-100" style={{ height: HOUR_PX }} />)}
              {appointments
                .filter((item) => item.date === date && (column.id === 'none' ? !item.staffId : String(item.staffId) === column.id))
                .map((item) => {
                  const top = ((toMinutes(item.startTime) - open) / 60) * HOUR_PX;
                  const blockHeight = Math.max(26, (item.durationMinutes / 60) * HOUR_PX - 2);
                  const meta = STATUS_META[item.status];
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelect(item.id)}
                      className={`absolute left-1 right-1 overflow-hidden rounded-md border px-1.5 py-1 text-left text-[11.5px] leading-tight shadow-sm hover:ring-2 hover:ring-stone-900/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900/40 ${meta.block}`}
                      style={{ top: Math.max(0, top), height: blockHeight }}
                    >
                      <span className="block truncate font-bold">{item.startTime} {item.customerName}</span>
                      <span className="block truncate opacity-80">{item.services.map((service) => service.name).join(', ') || item.requestedServiceText}</span>
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WeekView({ start, appointments, onSelect, onPickDay }) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const today = nepalToday();
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7">
      {days.map((day) => {
        const items = appointments.filter((item) => item.date === day);
        return (
          <section key={day} className={`min-w-0 rounded-xl border bg-white ${day === today ? 'border-stone-900' : 'border-stone-200'}`}>
            <button type="button" onClick={() => onPickDay(day)} className="flex w-full items-center justify-between border-b border-stone-100 px-3 py-2 text-left">
              <span className="text-xs font-bold text-stone-800">{dateLabel(day)}</span>
              <span className="text-[11px] tabular-nums text-stone-400">{items.filter((item) => !['CANCELLED', 'NO_SHOW'].includes(item.status)).length}</span>
            </button>
            <ul className="space-y-1 p-2">
              {items.length === 0 ? <li className="px-1 py-2 text-[11px] text-stone-400">No appointments</li> : items.map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => onSelect(item.id)} className={`w-full truncate rounded-md border px-2 py-1 text-left text-[11.5px] ${STATUS_META[item.status].block}`}>
                    <span className="font-bold tabular-nums">{item.startTime}</span> {item.customerName}
                    {item.staffName ? <span className="opacity-70"> · {item.staffName}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function AgendaView({ appointments, onSelect }) {
  return (
    <FinancialTable
      caption="Appointments"
      rows={appointments}
      empty="No appointments in this range."
      onRowClick={(row) => onSelect(row.id)}
      columns={[
        { key: 'when', label: 'When', render: (row) => <span className="font-semibold text-stone-900">{dateLabel(row.date)} · {row.startTime}–{row.endTime}</span> },
        { key: 'number', label: 'No.', render: (row) => <span className="text-stone-500">{row.number}</span> },
        { key: 'customer', label: 'Customer', render: (row) => <span>{row.customerName}<span className="block text-[11px] text-stone-400">{row.customerPhone || ''}</span></span> },
        { key: 'services', label: 'Services', render: (row) => row.services.map((service) => service.name).join(', ') || row.requestedServiceText || '—' },
        { key: 'staff', label: 'Staff', render: (row) => row.staffName || <span className="text-stone-400">Unassigned</span> },
        { key: 'source', label: 'Source', render: (row) => <span className="capitalize">{row.source.toLowerCase().replace('_', ' ')}</span> },
        { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} label={STATUS_META[row.status].label} tone={STATUS_META[row.status].tone} /> },
      ]}
    />
  );
}

/* ------------------------------------------------------------ dialogs */

function Dialog({ title, subtitle, onClose, children, footer, wide = false }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-xl'}`}>
        <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-stone-900">{title}</h2>
            {subtitle ? <p className="text-xs text-stone-500">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        {footer ? <div className="border-t border-stone-200 px-4 py-3 sm:px-5">{footer}</div> : null}
      </div>
    </div>
  );
}

const FIELD = 'mt-1 block h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900 focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-200';
const LABEL = 'block text-xs font-bold uppercase tracking-[0.04em] text-stone-500';

function AppointmentForm({ initial, services, staff, isAdmin, onSaved, onClose }) {
  const editing = Boolean(initial?.id);
  const [form, setForm] = useState(() => ({
    customerName: initial?.customerName || '',
    customerPhone: initial?.customerPhone || '',
    date: initial?.date || nepalToday(),
    startTime: initial?.startTime || '',
    staffId: initial?.staffId ? String(initial.staffId) : '',
    serviceIds: initial?.services?.map((service) => String(service.serviceId)).filter(Boolean) || (initial?.serviceId ? [String(initial.serviceId)] : []),
    status: 'CONFIRMED',
    source: initial?.source && initial.source !== 'WEBSITE' ? initial.source : 'PHONE',
    notes: initial?.notes || '',
  }));
  const [slots, setSlots] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(null);
  const [overrideReason, setOverrideReason] = useState('');
  const set = (key, value) => { setForm((current) => ({ ...current, [key]: value })); setConflict(null); setError(''); };

  const duration = form.serviceIds.reduce((sum, id) => sum + (Number(services.find((service) => String(service.id) === id)?.duration_minutes) || 30), 0);

  useEffect(() => {
    if (!form.date) return;
    const params = new URLSearchParams({ date: form.date, services: form.serviceIds.join(',') });
    if (form.staffId) params.set('staffId', form.staffId);
    let cancelled = false;
    erpFetch(`/api/appointments/availability?${params}`)
      .then((payload) => { if (!cancelled) setSlots(payload.availability); })
      .catch(() => { if (!cancelled) setSlots(null); });
    return () => { cancelled = true; };
  }, [form.date, form.staffId, form.serviceIds.join(',')]);

  const freeSlots = form.staffId
    ? slots?.staff?.find((member) => String(member.id) === form.staffId)?.slots || []
    : slots?.anyStaff || [];

  const submit = async (withOverride = false) => {
    setBusy(true);
    setError('');
    const body = {
      customerName: form.customerName,
      customerPhone: form.customerPhone,
      date: form.date,
      startTime: form.startTime,
      staffId: form.staffId || null,
      services: form.serviceIds.map(Number),
      notes: form.notes,
      source: form.source,
      status: form.status,
      waitlistId: initial?.waitlistId,
      ...(withOverride ? { override: { apply: true, reason: overrideReason } } : {}),
    };
    try {
      const payload = editing
        ? await erpFetch(`/api/appointments/${initial.id}`, { method: 'PATCH', body })
        : await erpFetch('/api/appointments', { method: 'POST', body, headers: { 'Idempotency-Key': initial?.idempotencyKey || crypto.randomUUID() } });
      onSaved(payload.appointment);
    } catch (saveError) {
      if (saveError.code === 'SCHEDULE_CONFLICT') setConflict(saveError.data);
      else setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={editing ? `Edit ${initial.number}` : 'New appointment'}
      subtitle={editing ? 'Change the time, staff or services. The history keeps the previous slot.' : 'Book a planned visit. Walk-ins without a booking use Tokens.'}
      onClose={onClose}
      wide
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <ErpButton onClick={onClose} disabled={busy}>Cancel</ErpButton>
          <ErpButton variant="primary" onClick={() => submit(false)} disabled={busy || !form.customerName || !form.startTime || !form.serviceIds.length}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Book appointment'}
          </ErpButton>
        </div>
      )}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>Customer name *<input className={FIELD} value={form.customerName} onChange={(event) => set('customerName', event.target.value)} autoComplete="off" /></label>
        <label className={LABEL}>Phone<input className={FIELD} inputMode="tel" value={form.customerPhone} onChange={(event) => set('customerPhone', event.target.value)} autoComplete="off" /></label>
        <fieldset className="sm:col-span-2">
          <legend className={LABEL}>Services * <span className="font-normal normal-case text-stone-400">{duration ? `· ${duration} min total` : ''}</span></legend>
          <div className="mt-1 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-stone-200 p-2">
            {services.map((service) => {
              const checked = form.serviceIds.includes(String(service.id));
              return (
                <button
                  key={service.id}
                  type="button"
                  aria-pressed={checked}
                  onClick={() => set('serviceIds', checked ? form.serviceIds.filter((id) => id !== String(service.id)) : [...form.serviceIds, String(service.id)])}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${checked ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'}`}
                >
                  {service.name} <span className="opacity-60">{service.duration_minutes || 30}m</span>
                </button>
              );
            })}
          </div>
        </fieldset>
        <label className={LABEL}>Staff
          <select className={FIELD} value={form.staffId} onChange={(event) => set('staffId', event.target.value)}>
            <option value="">Any staff (assign later)</option>
            {staff.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}
          </select>
        </label>
        <label className={LABEL}>Date *<input type="date" className={FIELD} value={form.date} min={editing ? undefined : nepalToday()} onChange={(event) => set('date', event.target.value)} /></label>
        <div className="sm:col-span-2">
          <label className={LABEL}>Start time *<input type="time" step="300" className={FIELD} value={form.startTime} onChange={(event) => set('startTime', event.target.value)} /></label>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-stone-500">
            Free times {form.staffId ? 'for this staff member' : 'for any staff'} ({duration || 30} min)
          </p>
          <div className="mt-1 flex max-h-28 flex-wrap gap-1 overflow-y-auto">
            {slots === null ? <span className="text-xs text-stone-400">Loading…</span> : freeSlots.length === 0
              ? <span className="text-xs text-stone-400">No free slot for this choice — pick another day or staff.</span>
              : freeSlots.map((slot) => (
                <button key={slot} type="button" onClick={() => set('startTime', slot)} className={`rounded-md border px-2 py-1 text-xs tabular-nums ${form.startTime === slot ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 hover:bg-stone-50'}`}>
                  {slot}
                </button>
              ))}
          </div>
        </div>
        {!editing ? (
          <>
            <label className={LABEL}>Status
              <select className={FIELD} value={form.status} onChange={(event) => set('status', event.target.value)}>
                <option value="CONFIRMED">Confirmed</option>
                <option value="PENDING">Pending (tentative)</option>
              </select>
            </label>
            <label className={LABEL}>Source
              <select className={FIELD} value={form.source} onChange={(event) => set('source', event.target.value)}>
                {SOURCES.filter(([value]) => value !== 'WEBSITE').map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </>
        ) : null}
        <label className={`${LABEL} sm:col-span-2`}>Notes<textarea className={`${FIELD} h-20 py-2`} value={form.notes} onChange={(event) => set('notes', event.target.value)} /></label>
      </div>

      {conflict ? (
        <div className="mt-3 space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
          <p className="text-sm font-bold text-rose-800">This slot is not free</p>
          <ul className="list-disc pl-5 text-sm text-rose-800">{(conflict.issues || []).map((issue) => <li key={issue.message}>{issue.message}</li>)}</ul>
          {conflict.overridable && isAdmin ? (
            <div className="space-y-2 border-t border-rose-200 pt-2">
              <label className={LABEL}>Admin override reason (required)
                <input className={FIELD} value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} placeholder="e.g. Customer agreed to wait; stylist confirmed" />
              </label>
              <ErpButton variant="danger" disabled={busy || !overrideReason.trim()} onClick={() => submit(true)}>Book anyway (logged)</ErpButton>
            </div>
          ) : <p className="text-xs text-rose-700">Pick a free time, or ask an admin to override.</p>}
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
    </Dialog>
  );
}

function AppointmentDetail({ id, isAdmin, onClose, onChanged, onEdit, onWaitlistMatches }) {
  const [appointment, setAppointment] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [reasonFor, setReasonFor] = useState(null);
  const [reason, setReason] = useState('');
  const [createToken, setCreateToken] = useState(true);
  const [conflict, setConflict] = useState(null);
  const [overrideReason, setOverrideReason] = useState('');

  const load = useCallback(async () => {
    try { setAppointment((await erpFetch(`/api/appointments/${id}`)).appointment); } catch (loadError) { setError(loadError.message); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const act = async (action, extra = {}) => {
    setBusy(action);
    setError('');
    try {
      const payload = await erpFetch(`/api/appointments/${id}`, { method: 'POST', body: { action, ...extra } });
      setAppointment(payload.appointment);
      setReasonFor(null);
      setReason('');
      setConflict(null);
      onChanged();
      if (payload.waitlistMatches?.length) onWaitlistMatches(payload.waitlistMatches, payload.appointment);
    } catch (actionError) {
      if (actionError.code === 'SCHEDULE_CONFLICT') setConflict({ ...actionError.data, action });
      else setError(actionError.message);
    } finally {
      setBusy('');
    }
  };

  if (!appointment) {
    return <Dialog title="Appointment" onClose={onClose}>{error ? <ErrorState message={error} /> : <LoadingState />}</Dialog>;
  }
  const meta = STATUS_META[appointment.status];
  const actions = ACTIONS[appointment.status] || [];
  const billable = ['CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'CONFIRMED', 'PENDING'].includes(appointment.status) && !appointment.billId;

  return (
    <Dialog
      title={`${appointment.number} · ${appointment.customerName}`}
      subtitle={`${dateLabel(appointment.date, { weekday: 'long', day: 'numeric', month: 'long' })} · ${appointment.startTime}–${appointment.endTime}`}
      onClose={onClose}
      wide
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={appointment.status} label={meta.label} tone={meta.tone} />
          <span className="text-xs text-stone-500">Source: {appointment.source.toLowerCase().replace('_', ' ')}</span>
          {appointment.tokenNumber ? <span className="rounded-md bg-teal-50 px-2 py-0.5 text-xs font-bold text-teal-800">Token {appointment.tokenNumber}</span> : null}
          {appointment.billNumber ? <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800">Bill {appointment.billNumber} · {money(appointment.billTotal)}</span> : null}
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-[11px] uppercase text-stone-400">Customer</dt><dd className="font-semibold">{appointment.customerName}</dd></div>
          <div><dt className="text-[11px] uppercase text-stone-400">Phone</dt><dd>{appointment.customerPhone || '—'}</dd></div>
          <div><dt className="text-[11px] uppercase text-stone-400">Staff</dt><dd>{appointment.staffName || <span className="text-amber-700">Unassigned</span>}</dd></div>
          <div><dt className="text-[11px] uppercase text-stone-400">Duration</dt><dd>{appointment.durationMinutes} min</dd></div>
        </dl>

        <div>
          <p className="text-[11px] font-bold uppercase text-stone-400">Services</p>
          <ul className="mt-1 divide-y divide-stone-100 rounded-lg border border-stone-200">
            {appointment.services.length ? appointment.services.map((service, index) => (
              <li key={`${service.serviceId}-${index}`} className="flex justify-between px-3 py-2 text-sm">
                <span>{service.name} <span className="text-stone-400">· {service.duration} min</span></span>
                <span className="tabular-nums text-stone-600">{money(service.price)}</span>
              </li>
            )) : <li className="px-3 py-2 text-sm text-amber-700">Requested: {appointment.requestedServiceText || '—'} (match a service when editing)</li>}
          </ul>
          {appointment.requestedStaffText ? <p className="mt-1 text-xs text-stone-500">Asked for: {appointment.requestedStaffText}</p> : null}
          {appointment.notes ? <p className="mt-2 rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-700">{appointment.notes}</p> : null}
          {appointment.overrideReason ? <p className="mt-2 text-xs text-rose-700">Conflict override: {appointment.overrideReason}</p> : null}
          {appointment.cancelReason ? <p className="mt-2 text-xs text-stone-500">Cancelled: {appointment.cancelReason}</p> : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {['PENDING', 'CONFIRMED'].includes(appointment.status) ? <ErpButton onClick={() => onEdit(appointment)}>Edit / reschedule</ErpButton> : null}
          {actions.map((action) => (
            action === 'cancel' || action === 'no_show' ? (
              <ErpButton key={action} variant={action === 'cancel' ? 'danger' : 'secondary'} disabled={Boolean(busy)} onClick={() => (action === 'cancel' ? setReasonFor('cancel') : act('no_show'))}>
                {ACTION_LABEL[action]}
              </ErpButton>
            ) : (
              <ErpButton key={action} variant="primary" disabled={Boolean(busy)} onClick={() => act(action, action === 'check_in' ? { createToken } : {})}>
                {busy === action ? 'Working…' : ACTION_LABEL[action]}
              </ErpButton>
            )
          ))}
          {billable ? (
            <Link href={`/admin/billing?appointmentId=${appointment.id}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-emerald-600 bg-emerald-600 px-3.5 text-sm font-semibold text-white hover:bg-emerald-700">
              <Receipt className="h-4 w-4" aria-hidden="true" /> Bill appointment
            </Link>
          ) : null}
        </div>
        {actions.includes('check_in') ? (
          <label className="flex items-center gap-2 text-xs text-stone-600">
            <input type="checkbox" checked={createToken} onChange={(event) => setCreateToken(event.target.checked)} />
            Issue a queue token on check-in (store must be open)
          </label>
        ) : null}

        {reasonFor === 'cancel' ? (
          <div className="space-y-2 rounded-xl border border-stone-200 p-3">
            <label className={LABEL}>Cancellation reason (required)<input className={FIELD} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
            <div className="flex gap-2">
              <ErpButton onClick={() => setReasonFor(null)}>Back</ErpButton>
              <ErpButton variant="danger" disabled={!reason.trim() || Boolean(busy)} onClick={() => act('cancel', { reason })}>Cancel appointment</ErpButton>
            </div>
          </div>
        ) : null}

        {conflict ? (
          <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
            <p className="text-sm font-bold text-rose-800">Cannot confirm this slot</p>
            <ul className="list-disc pl-5 text-sm text-rose-800">{(conflict.issues || []).map((issue) => <li key={issue.message}>{issue.message}</li>)}</ul>
            {conflict.overridable && isAdmin ? (
              <>
                <label className={LABEL}>Admin override reason (required)<input className={FIELD} value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} /></label>
                <ErpButton variant="danger" disabled={!overrideReason.trim()} onClick={() => act(conflict.action, { override: { apply: true, reason: overrideReason } })}>Confirm anyway (logged)</ErpButton>
              </>
            ) : <p className="text-xs text-rose-700">Reschedule, or ask an admin to override.</p>}
          </div>
        ) : null}
        {error ? <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

        <div>
          <p className="text-[11px] font-bold uppercase text-stone-400">History</p>
          <ol className="mt-1 space-y-1.5 border-l-2 border-stone-200 pl-3">
            {(appointment.events || []).map((event) => (
              <li key={event.id} className="text-xs text-stone-600">
                <span className="font-semibold capitalize text-stone-800">{event.type.replaceAll('_', ' ')}</span>
                {event.to && event.from !== event.to ? <span> → {STATUS_META[event.to]?.label || event.to}</span> : null}
                <span className="text-stone-400"> · {event.actor} · {new Date(event.at).toLocaleString('en-GB', { timeZone: 'Asia/Kathmandu', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                {event.note ? <span className="block text-stone-500">“{event.note}”</span> : null}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Dialog>
  );
}

function WaitlistForm({ services, staff, onSaved, onClose }) {
  const [form, setForm] = useState({ customerName: '', customerPhone: '', requestedDate: nepalToday(), preferredTime: '', preferredStaffId: '', serviceId: '', flexibility: 'SAME_DAY', priority: 0, notes: '' });
  const [error, setError] = useState('');
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    try { await erpFetch('/api/appointments/waitlist', { method: 'POST', body: form }); onSaved(); } catch (saveError) { setError(saveError.message); }
  };
  return (
    <Dialog title="Add to waitlist" subtitle="The customer is shown when a matching slot frees up. Nothing is booked automatically." onClose={onClose}
      footer={<div className="flex justify-end gap-2"><ErpButton onClick={onClose}>Cancel</ErpButton><ErpButton variant="primary" onClick={save} disabled={!form.customerName}>Add</ErpButton></div>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>Customer name *<input className={FIELD} value={form.customerName} onChange={(event) => set('customerName', event.target.value)} /></label>
        <label className={LABEL}>Phone<input className={FIELD} inputMode="tel" value={form.customerPhone} onChange={(event) => set('customerPhone', event.target.value)} /></label>
        <label className={LABEL}>Requested date<input type="date" className={FIELD} value={form.requestedDate} onChange={(event) => set('requestedDate', event.target.value)} /></label>
        <label className={LABEL}>Preferred time<input className={FIELD} placeholder="e.g. after 4pm" value={form.preferredTime} onChange={(event) => set('preferredTime', event.target.value)} /></label>
        <label className={LABEL}>Service
          <select className={FIELD} value={form.serviceId} onChange={(event) => set('serviceId', event.target.value)}>
            <option value="">Any</option>
            {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
          </select>
        </label>
        <label className={LABEL}>Preferred staff
          <select className={FIELD} value={form.preferredStaffId} onChange={(event) => set('preferredStaffId', event.target.value)}>
            <option value="">Any</option>
            {staff.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}
          </select>
        </label>
        <label className={LABEL}>Flexibility
          <select className={FIELD} value={form.flexibility} onChange={(event) => set('flexibility', event.target.value)}>
            <option value="EXACT">Exact time only</option><option value="SAME_DAY">Any time that day</option><option value="ANY_DAY">Any day</option>
          </select>
        </label>
        <label className={LABEL}>Priority (0–9)<input type="number" min="0" max="9" className={FIELD} value={form.priority} onChange={(event) => set('priority', event.target.value)} /></label>
        <label className={`${LABEL} sm:col-span-2`}>Notes<input className={FIELD} value={form.notes} onChange={(event) => set('notes', event.target.value)} /></label>
      </div>
      {error ? <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
    </Dialog>
  );
}

/* ------------------------------------------------------------------ page */

export default function AppointmentsPage() {
  const [view, setView] = useState('day');
  const [date, setDate] = useState(nepalToday);
  const [staffFilter, setStaffFilter] = useState('');
  const [query, setQuery] = useState('');
  const [appointments, setAppointments] = useState([]);
  const [waitlist, setWaitlist] = useState([]);
  const [services, setServices] = useState([]);
  const [staff, setStaff] = useState([]);
  const [settings, setSettings] = useState({ openTime: '09:00', closeTime: '20:00' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [formFor, setFormFor] = useState(null);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [matches, setMatches] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const range = useMemo(() => {
    if (view === 'week') { const start = weekStart(date); return { from: start, to: addDays(start, 6) }; }
    if (view === 'agenda') return { from: date, to: addDays(date, 13) };
    return { from: date, to: date };
  }, [view, date]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ from: range.from, to: range.to });
      if (staffFilter) params.set('staffId', staffFilter);
      if (query.trim()) params.set('q', query.trim());
      const [list, wait] = await Promise.all([
        erpFetch(`/api/appointments?${params}`),
        erpFetch(`/api/appointments/waitlist?from=${range.from}&to=${addDays(range.to, 14)}`),
      ]);
      setAppointments(list.appointments || []);
      setWaitlist(wait.waitlist || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, staffFilter, query]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    setIsAdmin(String(user().role || '').toLowerCase() === 'admin');
    Promise.all([erpFetch('/api/admin/services'), erpFetch('/api/admin/employees'), erpFetch('/api/appointments/schedule')])
      .then(([serviceData, staffData, schedule]) => {
        setServices((serviceData.services || []).filter((service) => service.is_active));
        setStaff((staffData.employees || []).filter((member) => member.is_active && ['barber', 'stylist', 'beautician'].includes(member.salon_role)));
        setSettings(schedule.settings || settings);
      })
      .catch((loadError) => setError(loadError.message));
  }, []);

  const visibleStaff = staffFilter ? staff.filter((member) => String(member.id) === staffFilter) : staff;
  const active = appointments.filter((item) => !['CANCELLED', 'NO_SHOW'].includes(item.status));
  const counts = {
    pending: appointments.filter((item) => item.status === 'PENDING').length,
    confirmed: appointments.filter((item) => item.status === 'CONFIRMED').length,
    inSalon: appointments.filter((item) => ['CHECKED_IN', 'IN_SERVICE'].includes(item.status)).length,
    completed: appointments.filter((item) => item.status === 'COMPLETED').length,
  };
  const step = view === 'week' ? 7 : view === 'agenda' ? 14 : 1;
  const pendingRequests = appointments.filter((item) => item.status === 'PENDING' && item.source === 'WEBSITE');

  return (
    <ErpPage>
      <PageHeader
        icon={CalendarClock}
        iconTone="outflow"
        title="Appointments"
        subtitle="Planned visits by day, week or list. Walk-ins keep using Tokens."
        actions={(
          <>
            {isAdmin ? <Link href="/admin/appointments/settings" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"><Settings2 className="h-4 w-4" /> Hours & booking</Link> : null}
            <ErpButton icon={ListPlus} onClick={() => setWaitlistOpen(true)}>Waitlist</ErpButton>
            <ErpButton icon={CalendarPlus} variant="primary" onClick={() => setFormFor({})}>New appointment</ErpButton>
          </>
        )}
      />

      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Calendar view" className="flex rounded-lg border border-stone-200 bg-white p-0.5">
            {[['day', 'Day'], ['week', 'Week'], ['agenda', 'Agenda']].map(([value, label]) => (
              <button key={value} type="button" role="tab" aria-selected={view === value} onClick={() => setView(value)}
                className={`rounded-md px-3 py-1.5 text-[13px] font-semibold ${view === value ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-50'}`}>{label}</button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Previous" onClick={() => setDate(addDays(date, -step))} className="rounded-lg border border-stone-200 bg-white p-2 hover:bg-stone-50"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => setDate(nepalToday())} className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-[13px] font-semibold hover:bg-stone-50">Today</button>
            <button type="button" aria-label="Next" onClick={() => setDate(addDays(date, step))} className="rounded-lg border border-stone-200 bg-white p-2 hover:bg-stone-50"><ChevronRight className="h-4 w-4" /></button>
            <input type="date" value={date} onChange={(event) => event.target.value && setDate(event.target.value)} aria-label="Go to date" className="h-9 rounded-lg border border-stone-200 bg-white px-2 text-[13px]" />
          </div>
          <span className="text-sm font-bold text-stone-800">
            {range.from === range.to ? dateLabel(range.from, { weekday: 'long', day: 'numeric', month: 'long' }) : `${dateLabel(range.from)} – ${dateLabel(range.to)}`}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={staffFilter} onChange={(event) => setStaffFilter(event.target.value)} aria-label="Filter by staff" className="h-9 rounded-lg border border-stone-200 bg-white px-2 text-[13px]">
            <option value="">All staff</option>
            {staff.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}
          </select>
          <label className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Customer, phone, APT-…" aria-label="Search appointments" className="h-9 w-52 rounded-lg border border-stone-200 bg-white pl-8 pr-2 text-[13px]" />
          </label>
          <RefreshButton loading={loading} onClick={load} />
        </div>
      </div>

      <div className="space-y-4">
        <MetricGroup columns={4}>
          <MetricCard label="Booked" value={active.length} tone="online" sub={`${appointments.length} incl. cancelled / no-show`} />
          <MetricCard label="Pending" value={counts.pending} tone={counts.pending ? 'cash' : 'neutral'} sub={pendingRequests.length ? `${pendingRequests.length} website request(s)` : 'awaiting confirmation'} />
          <MetricCard label="In the salon" value={counts.inSalon} tone="hrm" sub="checked in / in service" />
          <MetricCard label="Completed" value={counts.completed} tone="inflow" />
        </MetricGroup>

        {pendingRequests.length ? (
          <AlertBanner tone="cash" title={`${pendingRequests.length} website booking request(s) waiting for confirmation`}>
            Open each request, check the stylist and time, then Confirm — the customer is not booked until you do.
          </AlertBanner>
        ) : null}
        {error ? <ErrorState message={error} onRetry={load} /> : null}
        {loading && !appointments.length ? <LoadingState label="Loading appointments…" /> : null}

        {view === 'day' ? (
          visibleStaff.length || appointments.length
            ? <DayView date={date} appointments={appointments} staff={visibleStaff} openTime={settings.openTime} closeTime={settings.closeTime} onSelect={setSelected} />
            : <EmptyState icon={CalendarClock} title="No service staff" message="Add barbers, stylists or beauticians under Staff to take appointments." />
        ) : null}
        {view === 'week' ? <WeekView start={range.from} appointments={appointments} onSelect={setSelected} onPickDay={(day) => { setDate(day); setView('day'); }} /> : null}
        {view === 'agenda' ? <AgendaView appointments={appointments} onSelect={setSelected} /> : null}

        <div>
          <SectionHeading title="Waitlist" note="Customers waiting for a slot. Book them when one frees up." action={<ErpButton icon={ListPlus} onClick={() => setWaitlistOpen(true)}>Add</ErpButton>} />
          <FinancialTable
            caption="Waitlist"
            rows={waitlist}
            empty="Nobody on the waitlist."
            columns={[
              { key: 'customer', label: 'Customer', render: (row) => <span className="font-semibold">{row.customerName}<span className="block text-[11px] font-normal text-stone-400">{row.customerPhone || ''}</span></span> },
              { key: 'date', label: 'Wanted', render: (row) => `${dateLabel(row.requestedDate)}${row.preferredTime ? ` · ${row.preferredTime}` : ''}` },
              { key: 'service', label: 'Service', render: (row) => row.serviceName || 'Any' },
              { key: 'staff', label: 'Staff', render: (row) => row.preferredStaffName || 'Any' },
              { key: 'flex', label: 'Flexibility', render: (row) => row.flexibility.replace('_', ' ').toLowerCase() },
              { key: 'priority', label: 'Priority', align: 'right' },
              {
                key: 'actions', label: '', render: (row) => (
                  <span className="flex gap-2">
                    <button type="button" className="text-xs font-bold text-indigo-700 hover:underline" onClick={() => setFormFor({
                      customerName: row.customerName, customerPhone: row.customerPhone, date: row.requestedDate,
                      staffId: row.preferredStaffId, serviceId: row.serviceId, waitlistId: row.id,
                    })}>Book</button>
                    <button type="button" className="text-xs font-bold text-stone-500 hover:underline" onClick={async () => { await erpFetch(`/api/appointments/waitlist?id=${row.id}`, { method: 'DELETE' }); load(); }}>Remove</button>
                  </span>
                ),
              },
            ]}
          />
        </div>
      </div>

      {formFor ? (
        <AppointmentForm
          initial={formFor}
          services={services}
          staff={staff}
          isAdmin={isAdmin}
          onClose={() => setFormFor(null)}
          onSaved={(appointment) => { setFormFor(null); setDate(appointment.date); load(); setSelected(appointment.id); }}
        />
      ) : null}
      {selected && !formFor ? (
        <AppointmentDetail
          id={selected}
          isAdmin={isAdmin}
          onClose={() => setSelected(null)}
          onChanged={load}
          onEdit={(appointment) => setFormFor(appointment)}
          onWaitlistMatches={(list, appointment) => setMatches({ list, appointment })}
        />
      ) : null}
      {waitlistOpen ? <WaitlistForm services={services} staff={staff} onClose={() => setWaitlistOpen(false)} onSaved={() => { setWaitlistOpen(false); load(); }} /> : null}
      {matches ? (
        <Dialog title="A slot just opened" subtitle={`${matches.appointment.number} freed ${matches.appointment.startTime} on ${dateLabel(matches.appointment.date)}. These waitlisted customers could take it:`} onClose={() => setMatches(null)}>
          <ul className="divide-y divide-stone-100">
            {matches.list.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span><span className="font-semibold">{entry.customerName}</span> <span className="text-stone-500">{entry.customerPhone || ''} · {entry.serviceName || 'any service'}</span></span>
                <ErpButton icon={Clock} onClick={() => {
                  setMatches(null);
                  setSelected(null);
                  setFormFor({ customerName: entry.customerName, customerPhone: entry.customerPhone, date: matches.appointment.date, staffId: matches.appointment.staffId, serviceId: entry.serviceId, waitlistId: entry.id });
                }}>Book</ErpButton>
              </li>
            ))}
          </ul>
        </Dialog>
      ) : null}
    </ErpPage>
  );
}
