'use client';

/** Leave request form — for oneself, or (with employees passed) on an employee's behalf. */

import { DateInput } from '@/components/shared/calendar-date-input';
import { useState } from 'react';
import { AlertBanner, ErpButton } from '@/components/erp';
import { erpFetch } from '@/components/erp/use-report';
import { FIELD, LABEL, Modal, nepalToday } from './ui';

export default function LeaveRequestForm({ employees, types, staffId = null, onClose, onSaved }) {
  const [form, setForm] = useState({ staffId: staffId || '', leaveTypeId: '', startDate: nepalToday(), endDate: nepalToday(), partialDay: 'FULL', reason: '', attachmentUrl: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const type = types.find((row) => String(row.id) === String(form.leaveTypeId));
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await erpFetch('/api/hrm/leave', { method: 'POST', body: { action: 'request', ...form, staffId: form.staffId ? Number(form.staffId) : undefined, leaveTypeId: Number(form.leaveTypeId), endDate: form.partialDay === 'FULL' ? form.endDate : form.startDate } });
      onSaved();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Leave request" subtitle="Days are counted from the roster: off days and holidays are not charged." onClose={onClose}
      footer={<><ErpButton onClick={onClose} disabled={busy}>Cancel</ErpButton><ErpButton variant="primary" onClick={save} disabled={busy || !form.leaveTypeId || (employees && !form.staffId)}>{busy ? 'Sending…' : 'Submit'}</ErpButton></>}>
      {employees ? (
        <label className={LABEL}>Employee
          <select className={FIELD} value={form.staffId} onChange={(event) => set('staffId', event.target.value)}>
            <option value="">Choose…</option>
            {employees.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </label>
      ) : null}
      <label className={LABEL}>Leave type
        <select className={FIELD} value={form.leaveTypeId} onChange={(event) => set('leaveTypeId', event.target.value)}>
          <option value="">Choose…</option>
          {types.filter((row) => row.isActive).map((row) => <option key={row.id} value={row.id}>{row.name} · {row.isPaid ? 'paid' : 'unpaid'}</option>)}
        </select>
      </label>
      <label className={LABEL}>Length
        <select className={FIELD} value={form.partialDay} onChange={(event) => set('partialDay', event.target.value)}>
          <option value="FULL">Full day(s)</option>
          <option value="FIRST_HALF">First half of one day</option>
          <option value="SECOND_HALF">Second half of one day</option>
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>{form.partialDay === 'FULL' ? 'From' : 'Date'}<DateInput className={FIELD} value={form.startDate} onChange={(event) => { set('startDate', event.target.value); if (event.target.value > form.endDate) set('endDate', event.target.value); }} /></label>
        {form.partialDay === 'FULL' ? <label className={LABEL}>To<DateInput className={FIELD} min={form.startDate} value={form.endDate} onChange={(event) => set('endDate', event.target.value)} /></label> : null}
      </div>
      <label className={LABEL}>Reason<input className={FIELD} value={form.reason} onChange={(event) => set('reason', event.target.value)} /></label>
      {type?.documentRequired ? <label className={LABEL}>Supporting document link *<input className={FIELD} value={form.attachmentUrl} onChange={(event) => set('attachmentUrl', event.target.value)} placeholder="Link to the document" /></label> : null}
      {error ? <AlertBanner tone="outflow">{error}</AlertBanner> : null}
    </Modal>
  );
}
