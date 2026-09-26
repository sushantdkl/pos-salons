'use client';

/**
 * LEAVE MANAGEMENT — requests and approvals, balances (every figure from the leave ledger:
 * allocation, carry forward, usage, reversals, adjustments), leave types and holidays.
 */

import { DateInput } from '@/components/shared/calendar-date-input';
import { useState } from 'react';
import { CalendarHeart, CalendarOff, Check, Plus, Trash2, X } from 'lucide-react';
import {
  AlertBanner, ErpButton, ErpPage, ErrorState, FinancialTable, LoadingState, MetricCard, MetricGroup, PageHeader, StatusBadge,
} from '@/components/erp';
import { erpFetch, useReport } from '@/components/erp/use-report';
import { FIELD, LABEL, Modal, fmtDate, nepalToday, useHrmPermissions } from '@/components/hrm/ui';
import LeaveRequestForm from '@/components/hrm/leave-request-form';

const STATUS_TONE = { PENDING: 'cash', APPROVED: 'inflow', REJECTED: 'outflow', CANCELLED: 'neutral' };
const TABS = [['requests', 'Requests'], ['balances', 'Balances'], ['types', 'Leave types'], ['holidays', 'Holidays']];

function TypeEditor({ initial, onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', isPaid: true, annualAllocationDays: 0, carryForward: false, maxCarryForwardDays: 0, requiresApproval: true, documentRequired: false, isActive: true, ...initial });
  const [error, setError] = useState('');
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setError('');
    try { await erpFetch('/api/hrm/leave', { method: 'POST', body: { action: 'type', ...form, annualAllocationDays: Number(form.annualAllocationDays), maxCarryForwardDays: Number(form.maxCarryForwardDays) } }); onSaved(); } catch (err) { setError(err.message); }
  };
  return (
    <Modal title={initial?.id ? `Edit ${initial.name}` : 'New leave type'} onClose={onClose} footer={<><ErpButton onClick={onClose}>Cancel</ErpButton><ErpButton variant="primary" onClick={save} disabled={!String(form.name).trim()}>Save</ErpButton></>}>
      <label className={LABEL}>Name<input className={FIELD} value={form.name} onChange={(event) => set('name', event.target.value)} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>Days per year<input type="number" min="0" step="0.5" className={FIELD} value={form.annualAllocationDays} onChange={(event) => set('annualAllocationDays', event.target.value)} /></label>
        <label className={LABEL}>Max carry forward (days)<input type="number" min="0" step="0.5" className={FIELD} value={form.maxCarryForwardDays} disabled={!form.carryForward} onChange={(event) => set('maxCarryForwardDays', event.target.value)} /></label>
      </div>
      <div className="grid gap-2 text-sm text-stone-700 sm:grid-cols-2">
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.isPaid} onChange={(event) => set('isPaid', event.target.checked)} /> Paid leave</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.carryForward} onChange={(event) => set('carryForward', event.target.checked)} /> Carry forward unused days</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.requiresApproval} onChange={(event) => set('requiresApproval', event.target.checked)} /> Needs approval</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.documentRequired} onChange={(event) => set('documentRequired', event.target.checked)} /> Document required</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.isActive} onChange={(event) => set('isActive', event.target.checked)} /> Active</label>
      </div>
      <p className="text-xs text-stone-500">Types with 0 days per year (e.g. Unpaid Leave) have no balance limit.</p>
      {error ? <AlertBanner tone="outflow">{error}</AlertBanner> : null}
    </Modal>
  );
}

export default function LeavePage() {
  const [year, setYear] = useState(() => Number(nepalToday().slice(0, 4)));
  const [tab, setTab] = useState('requests');
  const [status, setStatus] = useState('PENDING');
  const { data, error, loading, reload } = useReport(`/api/hrm/leave?year=${year}`);
  const perms = useHrmPermissions();
  const canApprove = Boolean(perms?.['leave.approve']);
  const [requesting, setRequesting] = useState(false);
  const [decide, setDecide] = useState(null);
  const [note, setNote] = useState('');
  const [typeEdit, setTypeEdit] = useState(null);
  const [holiday, setHoliday] = useState({ date: nepalToday(), name: '', isMandatory: true });
  const [adjust, setAdjust] = useState(null);
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');

  const run = async (body, done) => {
    setActionError('');
    const { __url: url = '/api/hrm/leave', ...payload } = body;
    try { const result = await erpFetch(url, { method: 'POST', body: payload }); done?.(result); reload(); } catch (err) { setActionError(err.message); }
  };

  const requests = (data?.requests || []).filter((row) => status === 'ALL' || row.status === status);
  const pending = (data?.requests || []).filter((row) => row.status === 'PENDING').length;
  const todayOnLeave = (data?.requests || []).filter((row) => row.status === 'APPROVED' && row.startDate <= nepalToday() && row.endDate >= nepalToday()).length;

  return (
    <ErpPage>
      <PageHeader
        icon={CalendarOff}
        iconTone="hrm"
        title="Leave management"
        subtitle="Leave requests and approvals, balances from an auditable ledger, leave types and holidays."
        actions={canApprove ? <ErpButton icon={Plus} variant="primary" onClick={() => setRequesting(true)}>Leave for an employee</ErpButton> : null}
      />
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {loading && !data ? <LoadingState /> : null}
      {data ? (
        <div className="space-y-4">
          <MetricGroup columns={3}>
            <MetricCard label="Pending requests" value={pending} tone="cash" />
            <MetricCard label="On leave today" value={todayOnLeave} tone="online" />
            <MetricCard label={`Holidays in ${year}`} value={data.holidays.length} tone="ledger" />
          </MetricGroup>
          <nav className="flex gap-2 overflow-x-auto border-b border-stone-200 pb-2" aria-label="Leave sections">
            {TABS.map(([key, label]) => <button key={key} type="button" onClick={() => setTab(key)} aria-current={tab === key ? 'page' : undefined} className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium ${tab === key ? 'bg-violet-100 text-violet-900' : 'text-stone-600 hover:bg-stone-100'}`}>{label}</button>)}
            <label className="ml-auto flex shrink-0 items-center gap-2 text-sm text-stone-600">Year
              <select className="h-9 rounded-lg border border-stone-200 bg-white px-2" value={year} onChange={(event) => setYear(Number(event.target.value))}>
                {[year - 1, year, year + 1].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </nav>
          {actionError ? <AlertBanner tone="outflow">{actionError}</AlertBanner> : null}
          {message ? <AlertBanner tone="inflow">{message}</AlertBanner> : null}

          {tab === 'requests' ? (
            <>
              <div className="flex flex-wrap gap-1">
                {['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'ALL'].map((key) => <button key={key} type="button" onClick={() => setStatus(key)} aria-pressed={status === key} className={`rounded-full border px-3 py-1 text-xs font-semibold ${status === key ? 'border-violet-300 bg-violet-100 text-violet-900' : 'border-stone-200 bg-white text-stone-600'}`}>{key === 'ALL' ? 'All' : key.charAt(0) + key.slice(1).toLowerCase()}</button>)}
              </div>
              <FinancialTable
                caption="Leave requests"
                rows={requests}
                empty="No leave requests here."
                columns={[
                  { key: 'who', label: 'Employee', render: (row) => <span className="font-semibold text-stone-900">{row.staffName}</span> },
                  { key: 'type', label: 'Type', render: (row) => `${row.leaveType}${row.isPaid ? '' : ' (unpaid)'}` },
                  { key: 'dates', label: 'Dates', render: (row) => (row.startDate === row.endDate ? fmtDate(row.startDate) : `${fmtDate(row.startDate)} → ${fmtDate(row.endDate)}`) + (row.partialDay !== 'FULL' ? ` · ${row.partialDay === 'FIRST_HALF' ? '1st' : '2nd'} half` : '') },
                  { key: 'days', label: 'Days', align: 'right', render: (row) => row.days },
                  { key: 'reason', label: 'Reason', render: (row) => row.reason || '—' },
                  { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} label={row.status.charAt(0) + row.status.slice(1).toLowerCase()} tone={STATUS_TONE[row.status]} /> },
                  { key: 'by', label: 'Decided', render: (row) => (row.decidedBy ? `${row.decidedBy}${row.decisionNote ? ` · ${row.decisionNote}` : ''}` : '—') },
                  {
                    key: 'act', label: '', render: (row) => (canApprove ? (
                      <div className="flex flex-wrap gap-1">
                        {row.status === 'PENDING' ? <ErpButton icon={Check} className="min-h-8 px-2 text-xs" onClick={() => { setDecide({ row, decision: 'APPROVED' }); setNote(''); }}>Approve</ErpButton> : null}
                        {row.status === 'PENDING' ? <ErpButton icon={X} className="min-h-8 px-2 text-xs" onClick={() => { setDecide({ row, decision: 'REJECTED' }); setNote(''); }}>Reject</ErpButton> : null}
                        {['PENDING', 'APPROVED'].includes(row.status) ? <button type="button" className="px-2 text-xs font-semibold text-stone-500 hover:underline" onClick={() => { setDecide({ row, decision: 'CANCELLED' }); setNote(''); }}>Cancel</button> : null}
                      </div>
                    ) : null),
                  },
                ]}
              />
            </>
          ) : null}

          {tab === 'balances' ? (
            <>
              {canApprove ? (
                <div className="flex flex-wrap items-center gap-2">
                  <ErpButton icon={CalendarHeart} onClick={() => run({ action: 'allocate', year }, (result) => setMessage(`${result.entries} allocation / carry-forward entries created for ${year}. Running it again adds nothing.`))}>Allocate {year} leave</ErpButton>
                  <p className="text-xs text-stone-500">Adds each type&apos;s yearly days (and capped carry forward) once per employee.</p>
                </div>
              ) : null}
              <div className="min-w-0 overflow-hidden rounded-xl border border-stone-200 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-max text-sm">
                    <caption className="sr-only">Leave balances</caption>
                    <thead className="bg-stone-50 text-[11px] uppercase tracking-wide text-stone-500">
                      <tr>
                        <th scope="col" className="px-3 py-2.5 text-left">Employee</th>
                        {data.types.filter((type) => type.isActive).map((type) => <th key={type.id} scope="col" className="px-3 py-2.5 text-left">{type.name}<span className="block normal-case tracking-normal text-stone-400">opening · used · pending · left</span></th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {data.balances.map((row) => (
                        <tr key={row.staffId}>
                          <th scope="row" className="px-3 py-2.5 text-left font-semibold text-stone-900">{row.name}</th>
                          {row.types.map((type) => (
                            <td key={type.leaveTypeId} className="px-3 py-2.5 tabular-nums text-stone-700">
                              {type.opening} · {type.used} · {type.pending} · <b className={type.remaining < 0 ? 'text-rose-700' : 'text-stone-950'}>{type.remaining}</b>
                              {canApprove ? <button type="button" onClick={() => setAdjust({ staffId: row.staffId, name: row.name, leaveTypeId: type.leaveTypeId, typeName: type.name, days: '', reason: '' })} className="ml-2 text-[11px] font-semibold text-violet-700 hover:underline">Adjust</button> : null}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}

          {tab === 'types' ? (
            <>
              {canApprove ? <ErpButton icon={Plus} onClick={() => setTypeEdit({})}>New leave type</ErpButton> : null}
              <FinancialTable
                caption="Leave types"
                rows={data.types}
                columns={[
                  { key: 'name', label: 'Leave type', render: (row) => <span className="font-semibold">{row.name}</span> },
                  { key: 'paid', label: 'Paid', render: (row) => (row.isPaid ? 'Paid' : 'Unpaid') },
                  { key: 'alloc', label: 'Days / year', align: 'right', render: (row) => row.annualAllocationDays || '—' },
                  { key: 'carry', label: 'Carry forward', render: (row) => (row.carryForward ? `Yes, up to ${row.maxCarryForwardDays}` : 'No') },
                  { key: 'approval', label: 'Approval', render: (row) => (row.requiresApproval ? 'Required' : 'Automatic') },
                  { key: 'doc', label: 'Document', render: (row) => (row.documentRequired ? 'Required' : '—') },
                  { key: 'active', label: 'Status', render: (row) => <StatusBadge status={row.isActive ? 'ACTIVE' : 'CLOSED'} label={row.isActive ? 'Active' : 'Inactive'} tone={row.isActive ? 'inflow' : 'neutral'} /> },
                  { key: 'edit', label: '', render: (row) => (canApprove ? <button type="button" onClick={() => setTypeEdit(row)} className="text-xs font-bold text-violet-700 hover:underline">Edit</button> : null) },
                ]}
              />
            </>
          ) : null}

          {tab === 'holidays' ? (
            <>
              {perms?.['shift.manage'] ? (
                <div className="grid gap-2 rounded-xl border border-stone-200 bg-white p-3 sm:grid-cols-[10rem_1fr_auto_auto] sm:items-end">
                  <label className={LABEL}>Date<DateInput className={FIELD} value={holiday.date} onChange={(event) => setHoliday({ ...holiday, date: event.target.value })} /></label>
                  <label className={LABEL}>Holiday<input className={FIELD} value={holiday.name} placeholder="Dashain, Tihar…" onChange={(event) => setHoliday({ ...holiday, name: event.target.value })} /></label>
                  <label className="flex items-center gap-2 pb-3 text-sm text-stone-700"><input type="checkbox" checked={holiday.isMandatory} onChange={(event) => setHoliday({ ...holiday, isMandatory: event.target.checked })} /> Salon closed</label>
                  <ErpButton variant="primary" icon={Plus} disabled={!holiday.name.trim()} onClick={() => run({ __url: '/api/hrm/shifts', action: 'holiday', ...holiday }, () => setHoliday({ ...holiday, name: '' }))}>Add</ErpButton>
                </div>
              ) : null}
              <FinancialTable
                caption="Holidays"
                rows={data.holidays}
                empty={`No holidays set for ${year}.`}
                columns={[
                  { key: 'date', label: 'Date', render: (row) => fmtDate(row.date) },
                  { key: 'name', label: 'Holiday', render: (row) => <span className="font-semibold">{row.name}</span> },
                  { key: 'type', label: 'Type', render: (row) => (row.isMandatory ? 'Salon closed (no one is absent)' : 'Optional') },
                  { key: 'x', label: '', render: (row) => (perms?.['shift.manage'] ? <button type="button" aria-label={`Delete ${row.name}`} onClick={() => run({ __url: '/api/hrm/shifts', action: 'delete_holiday', id: row.id })} className="rounded p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button> : null) },
                ]}
              />
            </>
          ) : null}
        </div>
      ) : null}

      {requesting ? <LeaveRequestForm employees={data.employees} types={data.types} onClose={() => setRequesting(false)} onSaved={() => { setRequesting(false); reload(); }} /> : null}
      {decide ? (
        <Modal
          title={`${decide.decision === 'APPROVED' ? 'Approve' : decide.decision === 'REJECTED' ? 'Reject' : 'Cancel'} leave · ${decide.row.staffName}`}
          subtitle={`${decide.row.leaveType} · ${decide.row.days} day(s) · ${fmtDate(decide.row.startDate)}`}
          onClose={() => setDecide(null)}
          footer={<><ErpButton onClick={() => setDecide(null)}>Back</ErpButton><ErpButton variant={decide.decision === 'APPROVED' ? 'primary' : 'danger'} disabled={decide.decision !== 'APPROVED' && !note.trim()} onClick={() => run({ action: 'decide', id: decide.row.id, decision: decide.decision, note }, () => setDecide(null))}>Confirm</ErpButton></>}
        >
          {decide.decision === 'CANCELLED' && decide.row.status === 'APPROVED' ? <p className="text-sm text-stone-600">The days go back to the balance (a reversal entry — the original usage stays in the ledger).</p> : null}
          <label className={LABEL}>{decide.decision === 'APPROVED' ? 'Note (optional)' : 'Reason (required)'}<input className={FIELD} value={note} onChange={(event) => setNote(event.target.value)} /></label>
          {actionError ? <AlertBanner tone="outflow">{actionError}</AlertBanner> : null}
        </Modal>
      ) : null}
      {typeEdit ? <TypeEditor initial={typeEdit.id ? typeEdit : null} onClose={() => setTypeEdit(null)} onSaved={() => { setTypeEdit(null); reload(); }} /> : null}
      {adjust ? (
        <Modal title={`Adjust ${adjust.typeName} · ${adjust.name}`} subtitle={`Leave year ${year}. Positive adds days, negative removes.`} onClose={() => setAdjust(null)}
          footer={<><ErpButton onClick={() => setAdjust(null)}>Cancel</ErpButton><ErpButton variant="primary" disabled={!Number(adjust.days) || !adjust.reason.trim()} onClick={() => run({ action: 'adjust', staffId: adjust.staffId, leaveTypeId: adjust.leaveTypeId, year, days: Number(adjust.days), reason: adjust.reason }, () => setAdjust(null))}>Save</ErpButton></>}>
          <label className={LABEL}>Days (+/−)<input type="number" step="0.5" className={FIELD} value={adjust.days} onChange={(event) => setAdjust({ ...adjust, days: event.target.value })} /></label>
          <label className={LABEL}>Reason<input className={FIELD} value={adjust.reason} onChange={(event) => setAdjust({ ...adjust, reason: event.target.value })} /></label>
          {actionError ? <AlertBanner tone="outflow">{actionError}</AlertBanner> : null}
        </Modal>
      ) : null}
    </ErpPage>
  );
}
