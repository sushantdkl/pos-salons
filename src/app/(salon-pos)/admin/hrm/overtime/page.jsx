'use client';

/**
 * OVERTIME — potential overtime from attendance (and manual requests) waits for a decision.
 * Payroll only ever reads APPROVED minutes; extra time is never paid automatically.
 */

import Link from 'next/link';
import { useState } from 'react';
import { Check, Plus, Timer, X } from 'lucide-react';
import {
  AlertBanner, ErpButton, ErpPage, ErrorState, FinancialTable, LoadingState, MetricCard, MetricGroup, PageHeader, PeriodFilter, StatusBadge,
} from '@/components/erp';
import { erpFetch, usePeriod, useReport } from '@/components/erp/use-report';
import { FIELD, LABEL, Modal, fmtDate, fmtMinutes, nepalToday, useHrmPermissions } from '@/components/hrm/ui';

const TONE = { PENDING: 'cash', APPROVED: 'inflow', REJECTED: 'outflow' };

export default function OvertimePage() {
  const period = usePeriod('month');
  const [status, setStatus] = useState('ALL');
  const { data, error, loading, reload } = useReport(`/api/hrm/overtime?${period.query}${status !== 'ALL' ? `&status=${status}` : ''}`, { enabled: period.ready });
  const perms = useHrmPermissions();
  const canApprove = Boolean(perms?.['overtime.approve']);
  const [decide, setDecide] = useState(null);
  const [request, setRequest] = useState(null);
  const [actionError, setActionError] = useState('');

  const submitDecision = async () => {
    setActionError('');
    try {
      await erpFetch('/api/hrm/overtime', { method: 'POST', body: { action: 'decide', id: decide.row.id, decision: decide.decision, approvedMinutes: decide.decision === 'APPROVED' ? Number(decide.minutes) : undefined, note: decide.note } });
      setDecide(null);
      reload();
    } catch (err) { setActionError(err.message); }
  };
  const submitRequest = async () => {
    setActionError('');
    try {
      await erpFetch('/api/hrm/overtime', { method: 'POST', body: { action: 'request', staffId: Number(request.staffId), date: request.date, minutes: Math.round(Number(request.hours) * 60), reason: request.reason } });
      setRequest(null);
      reload();
    } catch (err) { setActionError(err.message); }
  };

  return (
    <ErpPage>
      <PageHeader
        icon={Timer}
        iconTone="hrm"
        title="Overtime"
        subtitle="Time worked beyond the shift. Only approved overtime reaches payroll."
        actions={canApprove || perms?.['attendance.edit'] ? <ErpButton icon={Plus} onClick={() => { setActionError(''); setRequest({ staffId: '', date: nepalToday(), hours: '1', reason: '' }); }}>Record overtime</ErpButton> : null}
      />
      <div className="space-y-4">
        <PeriodFilter {...period.filterProps} />
        {error ? <ErrorState message={error} onRetry={reload} /> : null}
        {loading && !data ? <LoadingState /> : null}
        {data ? (
          <>
            <MetricGroup columns={3}>
              <MetricCard label="Waiting for approval" value={fmtMinutes(data.totals.pendingMinutes)} tone="cash" hint={`${data.totals.pending} entr${data.totals.pending === 1 ? 'y' : 'ies'}`} />
              <MetricCard label="Approved (payroll input)" value={fmtMinutes(data.totals.approvedMinutes)} tone="hrm" emphasis />
              <MetricCard label="Rejected" value={data.totals.rejected} tone="neutral" />
            </MetricGroup>
            <p className="text-xs text-stone-500">Overtime counts from {`the shift's end`} once it reaches the threshold in <Link href="/admin/hrm/rules" className="font-semibold text-violet-700 hover:underline">HR rules</Link>. How approved hours are paid is also set there.</p>
            <div className="flex flex-wrap gap-1">
              {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((key) => <button key={key} type="button" onClick={() => setStatus(key)} aria-pressed={status === key} className={`rounded-full border px-3 py-1 text-xs font-semibold ${status === key ? 'border-violet-300 bg-violet-100 text-violet-900' : 'border-stone-200 bg-white text-stone-600'}`}>{key === 'ALL' ? 'All' : key.charAt(0) + key.slice(1).toLowerCase()}</button>)}
            </div>
            {actionError && !decide && !request ? <AlertBanner tone="outflow">{actionError}</AlertBanner> : null}
            <FinancialTable
              caption="Overtime"
              rows={data.rows}
              empty="No overtime in this period."
              columns={[
                { key: 'date', label: 'Date', render: (row) => fmtDate(row.date) },
                { key: 'who', label: 'Employee', render: (row) => <span className="font-semibold text-stone-900">{row.staffName}</span> },
                { key: 'src', label: 'From', render: (row) => (row.source === 'ATTENDANCE' ? 'Attendance' : 'Request') },
                { key: 'sched', label: 'Scheduled', align: 'right', render: (row) => fmtMinutes(row.scheduledMinutes) },
                { key: 'worked', label: 'Worked', align: 'right', render: (row) => fmtMinutes(row.workedMinutes) },
                { key: 'potential', label: 'Potential', align: 'right', render: (row) => fmtMinutes(row.potentialMinutes) },
                { key: 'approved', label: 'Approved', align: 'right', render: (row) => <b className="text-violet-800">{fmtMinutes(row.approvedMinutes)}</b> },
                { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} label={row.status.charAt(0) + row.status.slice(1).toLowerCase()} tone={TONE[row.status]} /> },
                { key: 'note', label: 'Reason / decision', render: (row) => [row.reason, row.decidedBy ? `${row.decidedBy}${row.decisionNote ? `: ${row.decisionNote}` : ''}` : null].filter(Boolean).join(' · ') || '—' },
                {
                  key: 'act', label: '', render: (row) => (canApprove && row.status === 'PENDING' ? (
                    <div className="flex gap-1">
                      <ErpButton icon={Check} className="min-h-8 px-2 text-xs" onClick={() => { setActionError(''); setDecide({ row, decision: 'APPROVED', minutes: String(row.potentialMinutes), note: '' }); }}>Approve</ErpButton>
                      <ErpButton icon={X} className="min-h-8 px-2 text-xs" onClick={() => { setActionError(''); setDecide({ row, decision: 'REJECTED', note: '' }); }}>Reject</ErpButton>
                    </div>
                  ) : null),
                },
              ]}
            />
          </>
        ) : null}
      </div>
      {decide ? (
        <Modal title={`${decide.decision === 'APPROVED' ? 'Approve' : 'Reject'} overtime · ${decide.row.staffName}`} subtitle={`${fmtDate(decide.row.date)} · potential ${fmtMinutes(decide.row.potentialMinutes)}`} onClose={() => setDecide(null)}
          footer={<><ErpButton onClick={() => setDecide(null)}>Back</ErpButton><ErpButton variant={decide.decision === 'APPROVED' ? 'primary' : 'danger'} onClick={submitDecision}>Confirm</ErpButton></>}>
          {decide.decision === 'APPROVED' ? <label className={LABEL}>Approved minutes (up to {decide.row.potentialMinutes})<input type="number" min="1" max={decide.row.potentialMinutes} className={FIELD} value={decide.minutes} onChange={(event) => setDecide({ ...decide, minutes: event.target.value })} /></label> : null}
          <label className={LABEL}>{decide.decision === 'APPROVED' ? 'Note (required if approving less)' : 'Reason (required)'}<input className={FIELD} value={decide.note} onChange={(event) => setDecide({ ...decide, note: event.target.value })} /></label>
          {actionError ? <AlertBanner tone="outflow">{actionError}</AlertBanner> : null}
        </Modal>
      ) : null}
      {request ? (
        <Modal title="Record overtime" subtitle="For overtime not captured by punches. It still needs approval." onClose={() => setRequest(null)}
          footer={<><ErpButton onClick={() => setRequest(null)}>Cancel</ErpButton><ErpButton variant="primary" disabled={!request.staffId || !request.reason.trim()} onClick={submitRequest}>Submit</ErpButton></>}>
          <label className={LABEL}>Employee
            <select className={FIELD} value={request.staffId} onChange={(event) => setRequest({ ...request, staffId: event.target.value })}>
              <option value="">Choose…</option>
              {data?.employees.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={LABEL}>Date<input type="date" className={FIELD} max={nepalToday()} value={request.date} onChange={(event) => setRequest({ ...request, date: event.target.value })} /></label>
            <label className={LABEL}>Hours<input type="number" min="0.25" step="0.25" className={FIELD} value={request.hours} onChange={(event) => setRequest({ ...request, hours: event.target.value })} /></label>
          </div>
          <label className={LABEL}>Reason<input className={FIELD} value={request.reason} onChange={(event) => setRequest({ ...request, reason: event.target.value })} /></label>
          {actionError ? <AlertBanner tone="outflow">{actionError}</AlertBanner> : null}
        </Modal>
      ) : null}
    </ErpPage>
  );
}
