'use client';

/**
 * SHIFTS & ROSTER — shift definitions (cross-midnight allowed), each employee's shift history,
 * and one-day roster changes. Assigning a new shift closes the old one; history is never rewritten.
 */

import { DateInput } from '@/components/shared/calendar-date-input';
import { useState } from 'react';
import { CalendarClock, Clock, Moon, Pencil, Plus, UserCog } from 'lucide-react';
import {
  AlertBanner, ErpButton, ErpPage, ErrorState, FinancialTable, LoadingState, PageHeader, SectionHeading, StatusBadge,
} from '@/components/erp';
import { erpFetch, useReport } from '@/components/erp/use-report';
import { FIELD, LABEL, Modal, WEEKDAYS, fmtDate, nepalToday, useHrmPermissions } from '@/components/hrm/ui';

const EMPTY_SHIFT = { name: '', startTime: '10:00', endTime: '19:00', graceMinutes: 10, breakMinutes: 60, workingDays: [0, 1, 2, 3, 4, 5], effectiveFrom: '', effectiveTo: '', isActive: true };

function ShiftEditor({ initial, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({ ...EMPTY_SHIFT, effectiveFrom: nepalToday(), ...initial, effectiveTo: initial?.effectiveTo || '' }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const crosses = form.endTime && form.startTime && form.endTime <= form.startTime;
  const toggleDay = (day) => set('workingDays', form.workingDays.includes(day) ? form.workingDays.filter((d) => d !== day) : [...form.workingDays, day].sort());
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await erpFetch('/api/hrm/shifts', { method: 'POST', body: { action: 'save', ...form, id: initial?.id, graceMinutes: Number(form.graceMinutes), breakMinutes: Number(form.breakMinutes), effectiveTo: form.effectiveTo || null } });
      onSaved();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal
      title={initial?.id ? `Edit shift · ${initial.name}` : 'New shift'}
      subtitle="Past attendance keeps the schedule it was recorded with."
      onClose={onClose}
      footer={<><ErpButton onClick={onClose} disabled={busy}>Cancel</ErpButton><ErpButton variant="primary" onClick={save} disabled={busy || !form.name.trim()}>{busy ? 'Saving…' : 'Save shift'}</ErpButton></>}
    >
      <label className={LABEL}>Shift name *<input className={FIELD} value={form.name} onChange={(event) => set('name', event.target.value)} placeholder="Morning, Evening…" /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className={LABEL}>Start<input type="time" className={FIELD} value={form.startTime} onChange={(event) => set('startTime', event.target.value)} /></label>
        <label className={LABEL}>End<input type="time" className={FIELD} value={form.endTime} onChange={(event) => set('endTime', event.target.value)} /></label>
      </div>
      {crosses ? <p className="flex items-center gap-1.5 text-xs font-semibold text-violet-700"><Moon className="h-3.5 w-3.5" aria-hidden="true" />Ends the next day — attendance belongs to the date the shift starts.</p> : null}
      <div className="grid grid-cols-2 gap-3">
        <label className={LABEL}>Grace period (min)<input type="number" min="0" max="240" className={FIELD} value={form.graceMinutes} onChange={(event) => set('graceMinutes', event.target.value)} /></label>
        <label className={LABEL}>Unpaid break (min)<input type="number" min="0" max="480" className={FIELD} value={form.breakMinutes} onChange={(event) => set('breakMinutes', event.target.value)} /></label>
      </div>
      <p className="text-xs text-stone-500">Late = minutes after start + grace. With 10:00 and 10 min grace, 10:08 is on time and 10:17 is 7 minutes late.</p>
      <fieldset>
        <legend className={LABEL}>Working days</legend>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {WEEKDAYS.map((label, day) => (
            <button key={label} type="button" onClick={() => toggleDay(day)} aria-pressed={form.workingDays.includes(day)} className={`min-h-9 rounded-lg border px-3 text-sm font-semibold ${form.workingDays.includes(day) ? 'border-violet-300 bg-violet-100 text-violet-900' : 'border-stone-200 bg-white text-stone-500'}`}>{label}</button>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <label className={LABEL}>Effective from<DateInput className={FIELD} value={form.effectiveFrom} onChange={(event) => set('effectiveFrom', event.target.value)} /></label>
        <label className={LABEL}>Effective to<DateInput className={FIELD} value={form.effectiveTo} onChange={(event) => set('effectiveTo', event.target.value)} /></label>
      </div>
      <label className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" checked={form.isActive} onChange={(event) => set('isActive', event.target.checked)} /> Active</label>
      {error ? <AlertBanner tone="outflow">{error}</AlertBanner> : null}
    </Modal>
  );
}

function AssignDialog({ employee, shifts, history, onClose, onSaved }) {
  const [form, setForm] = useState({ shiftId: '', effectiveFrom: nepalToday(), customOff: false, offDays: [6], notes: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await erpFetch('/api/hrm/shifts', { method: 'POST', body: { action: 'assign', staffId: employee.id, shiftId: Number(form.shiftId), effectiveFrom: form.effectiveFrom, offDays: form.customOff ? form.offDays : null, notes: form.notes } });
      onSaved();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal
      title={`Assign shift · ${employee.name}`}
      subtitle="The current shift ends the day before; earlier history is kept."
      onClose={onClose}
      wide
      footer={<><ErpButton onClick={onClose} disabled={busy}>Cancel</ErpButton><ErpButton variant="primary" onClick={save} disabled={busy || !form.shiftId}>{busy ? 'Saving…' : 'Assign'}</ErpButton></>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>Shift
          <select className={FIELD} value={form.shiftId} onChange={(event) => set('shiftId', event.target.value)}>
            <option value="">Choose…</option>
            {shifts.filter((shift) => shift.isActive).map((shift) => <option key={shift.id} value={shift.id}>{shift.name} · {shift.startTime}–{shift.endTime}</option>)}
          </select>
        </label>
        <label className={LABEL}>From<DateInput className={FIELD} value={form.effectiveFrom} onChange={(event) => set('effectiveFrom', event.target.value)} /></label>
      </div>
      <label className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" checked={form.customOff} onChange={(event) => set('customOff', event.target.checked)} /> Personal weekly off days (instead of the shift&apos;s working days)</label>
      {form.customOff ? (
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map((label, day) => (
            <button key={label} type="button" aria-pressed={form.offDays.includes(day)} onClick={() => set('offDays', form.offDays.includes(day) ? form.offDays.filter((d) => d !== day) : [...form.offDays, day])} className={`min-h-9 rounded-lg border px-3 text-sm font-semibold ${form.offDays.includes(day) ? 'border-stone-400 bg-stone-200 text-stone-800' : 'border-stone-200 bg-white text-stone-500'}`}>{label} off</button>
          ))}
        </div>
      ) : null}
      <label className={LABEL}>Note<input className={FIELD} value={form.notes} onChange={(event) => set('notes', event.target.value)} /></label>
      {error ? <AlertBanner tone="outflow">{error}</AlertBanner> : null}
      <SectionHeading title="Shift history" />
      <FinancialTable
        caption="Shift history"
        rows={history.filter((row) => row.kind === 'DEFAULT')}
        empty="No shift assigned yet."
        columns={[
          { key: 'shift', label: 'Shift', render: (row) => row.shiftName },
          { key: 'from', label: 'From', render: (row) => fmtDate(row.effectiveFrom) },
          { key: 'to', label: 'To', render: (row) => (row.effectiveTo ? fmtDate(row.effectiveTo) : <StatusBadge status="ACTIVE" label="Current" tone="inflow" />) },
          { key: 'off', label: 'Off days', render: (row) => (row.offDays ? row.offDays.map((d) => WEEKDAYS[d]).join(', ') : 'Shift default') },
          { key: 'by', label: 'By', render: (row) => row.createdBy || '—' },
        ]}
      />
    </Modal>
  );
}

function OverrideDialog({ employees, shifts, onClose, onSaved }) {
  const [form, setForm] = useState({ staffId: '', date: nepalToday(), shiftId: 'OFF', reason: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await erpFetch('/api/hrm/shifts', { method: 'POST', body: { action: 'override', staffId: Number(form.staffId), date: form.date, shiftId: form.shiftId === 'OFF' ? null : Number(form.shiftId), reason: form.reason } });
      onSaved();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Change one day" subtitle="A different shift, or a day off, for a single date." onClose={onClose}
      footer={<><ErpButton onClick={onClose} disabled={busy}>Cancel</ErpButton><ErpButton variant="primary" onClick={save} disabled={busy || !form.staffId || !form.reason.trim()}>Save</ErpButton></>}>
      <label className={LABEL}>Employee
        <select className={FIELD} value={form.staffId} onChange={(event) => set('staffId', event.target.value)}>
          <option value="">Choose…</option>
          {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>Date<DateInput className={FIELD} value={form.date} onChange={(event) => set('date', event.target.value)} /></label>
        <label className={LABEL}>That day
          <select className={FIELD} value={form.shiftId} onChange={(event) => set('shiftId', event.target.value)}>
            <option value="OFF">Day off</option>
            {shifts.filter((shift) => shift.isActive).map((shift) => <option key={shift.id} value={shift.id}>{shift.name} · {shift.startTime}–{shift.endTime}</option>)}
          </select>
        </label>
      </div>
      <label className={LABEL}>Reason *<input className={FIELD} value={form.reason} onChange={(event) => set('reason', event.target.value)} /></label>
      {error ? <AlertBanner tone="outflow">{error}</AlertBanner> : null}
    </Modal>
  );
}

export default function ShiftsPage() {
  const { data, error, loading, reload } = useReport('/api/hrm/shifts');
  const perms = useHrmPermissions();
  const [editingShift, setEditingShift] = useState(null);
  const [assignFor, setAssignFor] = useState(null);
  const [override, setOverride] = useState(false);
  const [removeError, setRemoveError] = useState('');
  const canManage = Boolean(perms?.['shift.manage']);
  const today = nepalToday();

  const currentShift = (staffId) => data?.assignments.find((row) => row.staffId === staffId && row.kind === 'DEFAULT' && row.effectiveFrom <= today && (!row.effectiveTo || row.effectiveTo >= today));
  const nextShift = (staffId) => data?.assignments.find((row) => row.staffId === staffId && row.kind === 'DEFAULT' && row.effectiveFrom > today);
  const overrides = (data?.assignments || []).filter((row) => row.kind === 'DATE' && row.effectiveFrom >= today).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const nameOf = (staffId) => data?.employees.find((row) => row.id === staffId)?.name || `#${staffId}`;

  const removeOverride = async (row) => {
    const reason = window.prompt(`Remove the ${fmtDate(row.effectiveFrom)} change for ${nameOf(row.staffId)}? Reason:`);
    if (!reason) return;
    setRemoveError('');
    try { await erpFetch('/api/hrm/shifts', { method: 'POST', body: { action: 'remove_override', staffId: row.staffId, date: row.effectiveFrom, reason } }); reload(); } catch (err) { setRemoveError(err.message); }
  };

  return (
    <ErpPage>
      <PageHeader
        icon={Clock}
        iconTone="hrm"
        title="Shifts & roster"
        subtitle="Shift times, grace periods and breaks; who works which shift, and one-day changes."
        actions={canManage ? (
          <>
            <ErpButton icon={CalendarClock} onClick={() => setOverride(true)}>Change one day</ErpButton>
            <ErpButton icon={Plus} variant="primary" onClick={() => setEditingShift({})}>New shift</ErpButton>
          </>
        ) : null}
      />
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {loading && !data ? <LoadingState /> : null}
      {data ? (
        <div className="space-y-6">
          {!data.shifts.length ? <AlertBanner tone="cash" title="No shifts yet">Create the salon&apos;s shifts, then assign each employee. Until then attendance cannot tell who is late or absent.</AlertBanner> : null}
          <div className="min-w-0">
            <SectionHeading title="Shifts" />
            <FinancialTable
              caption="Shifts"
              rows={data.shifts}
              empty="No shifts yet."
              columns={[
                { key: 'name', label: 'Shift', render: (row) => <span className="font-semibold text-stone-900">{row.name}</span> },
                { key: 'time', label: 'Time', render: (row) => <span className="inline-flex items-center gap-1">{row.startTime}–{row.endTime}{row.crossesMidnight ? <Moon className="h-3.5 w-3.5 text-violet-600" aria-label="ends next day" /> : null}</span> },
                { key: 'grace', label: 'Grace', align: 'right', render: (row) => `${row.graceMinutes}m` },
                { key: 'break', label: 'Break', align: 'right', render: (row) => `${row.breakMinutes}m` },
                { key: 'days', label: 'Working days', render: (row) => row.workingDays.map((d) => WEEKDAYS[d]).join(' ') },
                { key: 'effective', label: 'Effective', render: (row) => `${fmtDate(row.effectiveFrom)}${row.effectiveTo ? ` → ${fmtDate(row.effectiveTo)}` : ''}` },
                { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.isActive ? 'ACTIVE' : 'CLOSED'} label={row.isActive ? 'Active' : 'Inactive'} tone={row.isActive ? 'inflow' : 'neutral'} /> },
                { key: 'edit', label: '', render: (row) => (canManage ? <button type="button" onClick={() => setEditingShift(row)} className="inline-flex items-center gap-1 text-xs font-bold text-violet-700 hover:underline"><Pencil className="h-3.5 w-3.5" />Edit</button> : null) },
              ]}
            />
          </div>

          <div className="min-w-0">
            <SectionHeading title="Roster" note="Each employee's current shift. Assigning a new one keeps the old one in history." />
            <FinancialTable
              caption="Roster"
              rows={data.employees}
              empty="No employees."
              columns={[
                { key: 'name', label: 'Employee', render: (row) => <span className="font-semibold text-stone-900">{row.name}</span> },
                { key: 'role', label: 'Role', render: (row) => <span className="capitalize">{row.designation}</span> },
                { key: 'shift', label: 'Current shift', render: (row) => { const current = currentShift(row.id); return current ? `${current.shiftName} (since ${fmtDate(current.effectiveFrom)})` : <span className="text-amber-700">No shift</span>; } },
                { key: 'off', label: 'Off days', render: (row) => { const current = currentShift(row.id); if (!current) return '—'; if (current.offDays) return current.offDays.map((d) => WEEKDAYS[d]).join(', '); const shift = data.shifts.find((s) => s.id === current.shiftId); return shift ? [0, 1, 2, 3, 4, 5, 6].filter((d) => !shift.workingDays.includes(d)).map((d) => WEEKDAYS[d]).join(', ') || 'None' : '—'; } },
                { key: 'next', label: 'Upcoming', render: (row) => { const next = nextShift(row.id); return next ? `${next.shiftName} from ${fmtDate(next.effectiveFrom)}` : '—'; } },
                { key: 'assign', label: '', render: (row) => (canManage ? <ErpButton icon={UserCog} className="min-h-8 px-2 text-xs" onClick={() => setAssignFor(row)}>Assign</ErpButton> : null) },
              ]}
            />
          </div>

          <div className="min-w-0">
            <SectionHeading title="Upcoming one-day changes" />
            {removeError ? <AlertBanner tone="outflow">{removeError}</AlertBanner> : null}
            <FinancialTable
              caption="One-day roster changes"
              rows={overrides}
              empty="No one-day changes coming up."
              columns={[
                { key: 'date', label: 'Date', render: (row) => fmtDate(row.effectiveFrom) },
                { key: 'who', label: 'Employee', render: (row) => nameOf(row.staffId) },
                { key: 'what', label: 'That day', render: (row) => row.shiftName || 'Day off' },
                { key: 'why', label: 'Reason', render: (row) => row.notes || '—' },
                { key: 'x', label: '', render: (row) => (canManage ? <button type="button" onClick={() => removeOverride(row)} className="text-xs font-bold text-rose-700 hover:underline">Remove</button> : null) },
              ]}
            />
          </div>
        </div>
      ) : null}
      {editingShift ? <ShiftEditor initial={editingShift.id ? editingShift : null} onClose={() => setEditingShift(null)} onSaved={() => { setEditingShift(null); reload(); }} /> : null}
      {assignFor ? <AssignDialog employee={assignFor} shifts={data.shifts} history={data.assignments.filter((row) => row.staffId === assignFor.id)} onClose={() => setAssignFor(null)} onSaved={() => { setAssignFor(null); reload(); }} /> : null}
      {override ? <OverrideDialog employees={data.employees} shifts={data.shifts} onClose={() => setOverride(false)} onSaved={() => { setOverride(false); reload(); }} /> : null}
    </ErpPage>
  );
}
