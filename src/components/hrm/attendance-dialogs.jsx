'use client';

/** Correct / manual-entry / history dialogs for one attendance day. The server recomputes everything. */

import { fmtDateTime } from '@/lib/dates/display';
import { useEffect, useState } from 'react';
import { AlertBanner, ErpButton, LoadingState } from '@/components/erp';
import { erpFetch } from '@/components/erp/use-report';
import { FIELD, LABEL, Modal, fmtDate, fmtTime, fromLocalInput, toLocalInput } from './ui';

const STATUS_OPTIONS = [
  ['AUTO', 'Automatic (from punches)'], ['PRESENT', 'Present'], ['LATE', 'Late'], ['HALF_DAY', 'Half day'], ['ABSENT', 'Absent'],
  ['ON_LEAVE', 'On leave'], ['HOLIDAY', 'Holiday'], ['OFF_DAY', 'Off day'],
];
const HALF_DAY_REASONS = [['APPROVED_LEAVE', 'Approved leave'], ['LATE_ARRIVAL', 'Late arrival'], ['EARLY_DEPARTURE', 'Early departure'], ['MANUAL', 'HR decision']];

function defaultIn(row) {
  return row.shift ? `${row.date}T${row.shift.startTime}` : `${row.date}T10:00`;
}

/** Correct an existing record, or enter one for a day without a record. */
export function AttendanceEditDialog({ row, onClose, onSaved, canCorrect = true }) {
  const record = row.record;
  const [form, setForm] = useState(() => ({
    clockIn: record ? toLocalInput(record.clockIn) : defaultIn(row),
    clockOut: record ? toLocalInput(record.clockOut) : '',
    status: record ? (record.statusLocked ? record.status : 'AUTO') : 'AUTO',
    halfDayReason: record?.halfDayReason || '',
    lateExcused: Boolean(record?.lateExcused),
    earlyLeaveApproved: Boolean(record?.earlyLeaveApproved),
    reason: '',
  }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      if (record) {
        const body = { reason: form.reason };
        if (canCorrect) {
          if (form.clockIn !== toLocalInput(record.clockIn)) body.clockIn = fromLocalInput(form.clockIn);
          if (form.clockOut !== toLocalInput(record.clockOut)) body.clockOut = fromLocalInput(form.clockOut);
          const lockedNow = record.statusLocked ? record.status : 'AUTO';
          if (form.status !== lockedNow || (form.status === 'HALF_DAY' && form.halfDayReason !== record.halfDayReason)) {
            body.status = form.status;
            if (form.status === 'HALF_DAY') body.halfDayReason = form.halfDayReason;
          }
        }
        if (form.lateExcused !== record.lateExcused) body.lateExcused = form.lateExcused;
        if (form.earlyLeaveApproved !== record.earlyLeaveApproved) body.earlyLeaveApproved = form.earlyLeaveApproved;
        await erpFetch(`/api/hrm/attendance/${record.id}`, { method: 'PATCH', body });
      } else {
        await erpFetch('/api/hrm/attendance', {
          method: 'POST',
          body: {
            action: 'manual', staffId: row.staffId, date: row.date,
            clockIn: fromLocalInput(form.clockIn), clockOut: fromLocalInput(form.clockOut),
            status: form.status === 'AUTO' ? null : form.status, halfDayReason: form.halfDayReason || null,
            lateExcused: form.lateExcused, earlyLeaveApproved: form.earlyLeaveApproved, reason: form.reason,
          },
        });
      }
      onSaved();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const noPunchStatus = ['ABSENT', 'ON_LEAVE', 'HOLIDAY', 'OFF_DAY'].includes(form.status);
  return (
    <Modal
      title={`${record ? 'Correct' : 'Enter'} attendance · ${row.name}`}
      subtitle={`${fmtDate(row.date)}${row.shift ? ` · ${row.shift.name} ${row.shift.startTime}–${row.shift.endTime}` : ' · no shift'}`}
      onClose={onClose}
      footer={(
        <>
          <ErpButton onClick={onClose} disabled={busy}>Cancel</ErpButton>
          <ErpButton variant="primary" onClick={save} disabled={busy || !form.reason.trim()}>{busy ? 'Saving…' : 'Save with reason'}</ErpButton>
        </>
      )}
    >
      {record?.status === 'MISSING_PUNCH' ? <AlertBanner tone="cash" title="Missing punch">Clocked in at {fmtTime(record.clockIn)} with no clock-out. Enter the real clock-out time — nothing is filled in automatically.</AlertBanner> : null}
      {canCorrect ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={LABEL}>Clock in<input type="datetime-local" className={FIELD} value={form.clockIn} disabled={noPunchStatus && !record} onChange={(event) => set('clockIn', event.target.value)} /></label>
            <label className={LABEL}>Clock out<input type="datetime-local" className={FIELD} value={form.clockOut} disabled={noPunchStatus && !record} onChange={(event) => set('clockOut', event.target.value)} /></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={LABEL}>Status
              <select className={FIELD} value={form.status} onChange={(event) => { set('status', event.target.value); if (['ABSENT', 'ON_LEAVE', 'HOLIDAY', 'OFF_DAY'].includes(event.target.value) && !record) { set('clockIn', ''); set('clockOut', ''); } }}>
                {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            {form.status === 'HALF_DAY' ? (
              <label className={LABEL}>Half-day reason
                <select className={FIELD} value={form.halfDayReason} onChange={(event) => set('halfDayReason', event.target.value)}>
                  <option value="">Choose…</option>
                  {HALF_DAY_REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            ) : null}
          </div>
        </>
      ) : <p className="text-sm text-stone-600">You can excuse a late arrival or approve an early departure. Punch corrections need the “Correct attendance” permission.</p>}
      <div className="flex flex-wrap gap-4 text-sm text-stone-700">
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.lateExcused} onChange={(event) => set('lateExcused', event.target.checked)} /> Late arrival excused</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.earlyLeaveApproved} onChange={(event) => set('earlyLeaveApproved', event.target.checked)} /> Early departure approved</label>
      </div>
      <label className={LABEL}>Reason (required, kept in the audit trail)<input className={FIELD} value={form.reason} onChange={(event) => set('reason', event.target.value)} placeholder="e.g. Forgot to clock out" /></label>
      {error ? <AlertBanner tone="outflow">{error}</AlertBanner> : null}
    </Modal>
  );
}

const ACTION_LABEL = {
  clock_in: 'Clocked in', clock_out: 'Clocked out', break_start: 'Break started', break_end: 'Break ended', manual_create: 'Entered manually',
  correction: 'Corrected', missing_punch_fixed: 'Missing punch fixed', late_override: 'Late excused / changed', status_override: 'Status set',
  break_closed_by_override: 'Break closed at clock-out', clock_in_over_record: 'Clocked in over an HR record',
};

function describe(value) {
  if (!value) return '—';
  return Object.entries(value).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => {
    const shown = typeof v === 'string' && /T\d{2}:\d{2}/.test(v) ? fmtTime(v) : String(v);
    return `${k}: ${shown}`;
  }).join(' · ');
}

export function AttendanceHistoryDialog({ row, onClose }) {
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    erpFetch(`/api/hrm/attendance/${row.record.id}`).then((data) => setHistory(data.history)).catch((err) => setError(err.message));
  }, [row.record.id]);
  return (
    <Modal title={`History · ${row.name}`} subtitle={fmtDate(row.date)} onClose={onClose} wide>
      {error ? <AlertBanner tone="outflow">{error}</AlertBanner> : null}
      {!history && !error ? <LoadingState /> : null}
      {history ? (
        <ol className="space-y-2">
          {history.map((entry) => (
            <li key={entry.id} className="rounded-lg border border-stone-200 p-3 text-sm">
              <p className="font-semibold text-stone-900">{ACTION_LABEL[entry.action] || entry.action} <span className="font-normal text-stone-500">· {entry.actor} · {fmtDateTime(entry.at)}</span></p>
              {entry.oldValue ? <p className="mt-1 text-xs text-stone-500">Before: {describe(entry.oldValue)}</p> : null}
              {entry.newValue ? <p className="text-xs text-stone-600">After: {describe(entry.newValue)}</p> : null}
              {entry.reason ? <p className="mt-1 text-xs font-medium text-stone-700">Reason: {entry.reason}</p> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </Modal>
  );
}
