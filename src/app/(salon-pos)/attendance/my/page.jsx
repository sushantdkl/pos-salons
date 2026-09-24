'use client';

/**
 * MY ATTENDANCE — an employee clocks in / out and takes breaks, sees their own history and
 * leave. Punches are always "now" on the server; past records can only be changed by HR.
 */

import { useEffect, useState } from 'react';
import { CalendarOff, Coffee, LogIn, LogOut, Plus, UserCheck } from 'lucide-react';
import {
  AlertBanner, ErpButton, ErpPage, ErrorState, FinancialTable, LoadingState, PageHeader, PeriodFilter, SectionHeading, StatusBadge,
} from '@/components/erp';
import { erpFetch, usePeriod, useReport } from '@/components/erp/use-report';
import { AttendanceHistoryTable, AttendanceSummaryCards } from '@/components/hrm/attendance-history';
import LeaveRequestForm from '@/components/hrm/leave-request-form';
import { AttendanceBadge, fmtDate, fmtMinutes, fmtTime } from '@/components/hrm/ui';

function useNow() {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export default function MyAttendancePage() {
  const period = usePeriod('month');
  const { data, error, loading, reload } = useReport(`/api/hrm/me?${period.query}`, { enabled: period.ready });
  const [busy, setBusy] = useState(false);
  const [punchError, setPunchError] = useState('');
  const [requesting, setRequesting] = useState(false);
  const now = useNow();

  const act = async (action) => {
    setBusy(true);
    setPunchError('');
    try { await erpFetch('/api/hrm/me', { method: 'POST', body: { action } }); reload(); } catch (err) { setPunchError(err.message); } finally { setBusy(false); }
  };
  const cancel = async (id) => {
    const note = window.prompt('Cancel this leave request? Reason:');
    if (!note) return;
    try { await erpFetch('/api/hrm/leave', { method: 'POST', body: { action: 'decide', id, decision: 'CANCELLED', note } }); reload(); } catch (err) { setPunchError(err.message); }
  };

  const current = data?.current;
  const record = current?.record;
  const open = record?.clockIn && !record.clockOut;
  const canRequestLeave = Boolean(data?.permissions?.['leave.request']);

  return (
    <ErpPage>
      <PageHeader icon={UserCheck} iconTone="hrm" title="My attendance" subtitle="Clock in and out, take breaks, see your hours and your leave." />
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {loading && !data ? <LoadingState /> : null}
      {data && !data.employee ? <AlertBanner tone="cash">Attendance is for employees. Use HRM → Attendance to manage staff.</AlertBanner> : null}
      {data?.employee ? (
        <div className="space-y-5">
          <section className="rounded-2xl border border-violet-200 bg-violet-50/60 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-violet-900">{now ? now.toLocaleDateString('en-GB', { timeZone: 'Asia/Kathmandu', weekday: 'long', day: 'numeric', month: 'long' }) : ''}</p>
                <p className="text-3xl font-extrabold tabular-nums text-stone-950">{now ? fmtTime(now) : '—'}</p>
                <p className="mt-1 text-sm text-stone-600">
                  {current?.shift ? `Shift ${current.shift.startTime}–${current.shift.endTime}` : current?.offDay ? 'Day off' : current?.holiday ? `Holiday · ${current.holiday.name}` : 'No shift assigned'}
                  {record?.clockIn ? ` · in at ${fmtTime(record.clockIn)}` : ''}
                  {record?.clockOut ? ` · out at ${fmtTime(record.clockOut)}` : ''}
                </p>
                {current ? <div className="mt-2"><AttendanceBadge status={current.status} />{record?.lateMinutes ? <span className="ml-2 text-xs font-semibold text-amber-700">{fmtMinutes(record.lateMinutes)} late</span> : null}{record?.onBreak ? <span className="ml-2 text-xs font-semibold text-amber-700">On break</span> : null}</div> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {!record ? <ErpButton variant="primary" icon={LogIn} disabled={busy} onClick={() => act('clock_in')} className="min-h-12 px-5 text-base">Clock in</ErpButton> : null}
                {open && !record.onBreak ? <ErpButton icon={Coffee} disabled={busy} onClick={() => act('break_start')} className="min-h-12 px-4">Start break</ErpButton> : null}
                {open && record.onBreak ? <ErpButton icon={Coffee} disabled={busy} onClick={() => act('break_end')} className="min-h-12 px-4">End break</ErpButton> : null}
                {open ? <ErpButton variant="primary" icon={LogOut} disabled={busy || record.onBreak} onClick={() => act('clock_out')} className="min-h-12 px-5 text-base">Clock out</ErpButton> : null}
                {record?.clockOut ? <p className="text-sm font-semibold text-emerald-700">Done for today · {fmtMinutes(record.workedMinutes)} worked</p> : null}
              </div>
            </div>
            {punchError ? <div className="mt-3"><AlertBanner tone="outflow">{punchError}</AlertBanner></div> : null}
          </section>

          <PeriodFilter {...period.filterProps} />
          <AttendanceSummaryCards summary={data.summary} />
          <div className="min-w-0">
            <SectionHeading title="My history" note="Ask a manager if a day is wrong — corrections are recorded with a reason." />
            <AttendanceHistoryTable rows={data.rows} />
          </div>

          <div className="min-w-0">
            <SectionHeading
              title="My leave"
              action={canRequestLeave ? <ErpButton icon={Plus} onClick={() => setRequesting(true)}>Request leave</ErpButton> : null}
            />
            <div className="mb-3 flex flex-wrap gap-2">
              {data.balances.filter((type) => type.opening || type.used || type.pending).map((type) => (
                <span key={type.leaveTypeId} className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm"><CalendarOff className="h-4 w-4 text-sky-600" aria-hidden="true" />{type.name}: <b>{type.remaining}</b> left</span>
              ))}
            </div>
            <FinancialTable
              caption="My leave requests"
              rows={data.leaveRequests}
              empty="No leave requests yet."
              columns={[
                { key: 'type', label: 'Type', render: (row) => row.leaveType },
                { key: 'dates', label: 'Dates', render: (row) => `${fmtDate(row.startDate)}${row.endDate !== row.startDate ? ` → ${fmtDate(row.endDate)}` : ''}${row.partialDay !== 'FULL' ? ' (half)' : ''}` },
                { key: 'days', label: 'Days', align: 'right', render: (row) => row.days },
                { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} label={row.status.charAt(0) + row.status.slice(1).toLowerCase()} tone={{ PENDING: 'cash', APPROVED: 'inflow', REJECTED: 'outflow', CANCELLED: 'neutral' }[row.status]} /> },
                { key: 'note', label: 'Note', render: (row) => row.decisionNote || row.reason || '—' },
                { key: 'x', label: '', render: (row) => (row.status === 'PENDING' ? <button type="button" onClick={() => cancel(row.id)} className="text-xs font-semibold text-rose-700 hover:underline">Cancel</button> : null) },
              ]}
            />
          </div>
        </div>
      ) : null}
      {requesting ? <LeaveRequestForm types={data.leaveTypes} onClose={() => setRequesting(false)} onSaved={() => { setRequesting(false); reload(); }} /> : null}
    </ErpPage>
  );
}
