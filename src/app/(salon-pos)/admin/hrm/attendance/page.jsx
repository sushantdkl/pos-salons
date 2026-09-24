'use client';

/**
 * ATTENDANCE — staff attendance, working hours, late arrivals, early departures, overtime and
 * exceptions. Table view for any period; register (staff × day) for longer periods. Every value
 * comes from /api/hrm/attendance, which is computed from dedicated attendance records only.
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CalendarRange, Coffee, History, LogIn, LogOut, Pencil, Plus, Search, Table2, UserCheck } from 'lucide-react';
import {
  AlertBanner, ErpButton, ErpPage, ErrorState, FinancialTable, LoadingState, MetricCard, MetricGroup, PageHeader, PeriodFilter,
} from '@/components/erp';
import { erpFetch, usePeriod, useReport } from '@/components/erp/use-report';
import { AttendanceEditDialog, AttendanceHistoryDialog } from '@/components/hrm/attendance-dialogs';
import {
  ATTENDANCE_STATUS, AttendanceBadge, fmtDate, fmtMinutes, fmtPunch, Modal, nepalToday, useHrmPermissions,
} from '@/components/hrm/ui';

const FILTERS = ['ALL', 'PRESENT', 'LATE', 'ABSENT', 'MISSING_PUNCH', 'HALF_DAY', 'ON_LEAVE', 'OFF_DAY', 'HOLIDAY', 'NOT_STARTED'];

function Register({ rows, onOpen }) {
  const dates = [...new Set(rows.map((row) => row.date))].sort();
  const staff = [...new Map(rows.map((row) => [row.staffId, row])).values()];
  const byKey = new Map(rows.map((row) => [`${row.staffId}|${row.date}`, row]));
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-stone-200 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-max border-collapse text-xs">
          <caption className="sr-only">Attendance register</caption>
          <thead>
            <tr className="bg-stone-50">
              <th scope="col" className="sticky left-0 z-10 bg-stone-50 px-3 py-2 text-left font-bold uppercase tracking-wide text-stone-500">Employee</th>
              {dates.map((date) => (
                <th key={date} scope="col" className={`px-1 py-2 text-center font-semibold ${date === nepalToday() ? 'text-violet-700' : 'text-stone-500'}`}>
                  <span className="block text-[10px] uppercase">{new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }).slice(0, 2)}</span>
                  {Number(date.slice(8))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.map((person) => (
              <tr key={person.staffId} className="border-t border-stone-100">
                <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-1.5 text-left font-semibold text-stone-800">{person.name}</th>
                {dates.map((date) => {
                  const row = byKey.get(`${person.staffId}|${date}`);
                  const meta = ATTENDANCE_STATUS[row?.status] || {};
                  const ot = (row?.approvedOvertimeMinutes || 0) + (row?.pendingOvertimeMinutes || 0) > 0;
                  return (
                    <td key={date} className="p-0.5 text-center">
                      <button
                        type="button"
                        onClick={() => row && onOpen(row)}
                        title={`${person.name} · ${fmtDate(date)} · ${meta.label || ''}${ot ? ' · overtime' : ''}`}
                        className={`relative h-8 w-9 rounded-md text-[11px] font-bold ${meta.cell || 'bg-white text-stone-300'} hover:ring-2 hover:ring-violet-300`}
                      >
                        {meta.code || '?'}
                        {ot ? <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-violet-600" aria-hidden="true" /> : null}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="flex flex-wrap gap-x-3 gap-y-1 border-t border-stone-100 px-3 py-2 text-[11px] text-stone-500">
        {Object.entries(ATTENDANCE_STATUS).map(([key, meta]) => <span key={key}><b className="text-stone-700">{meta.code}</b> {meta.label}</span>)}
        <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-violet-600 align-middle" />Overtime</span>
      </p>
    </div>
  );
}

export default function AttendancePage() {
  const period = usePeriod('today');
  const perms = useHrmPermissions();
  const { data, error, loading, reload } = useReport(`/api/hrm/attendance?${period.query}`, { enabled: period.ready });
  const [view, setView] = useState('table');
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);
  const [detail, setDetail] = useState(null);
  const [actionError, setActionError] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const today = nepalToday();

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.rows || []).filter((row) => (filter === 'ALL' || row.status === filter) && (!term || row.name.toLowerCase().includes(term)));
  }, [data, filter, search]);
  const multiDay = data && data.range.from !== data.range.to;

  const punch = async (row, type) => {
    setActionError('');
    setBusyKey(`${row.staffId}-${type}`);
    try {
      await erpFetch('/api/hrm/attendance', { method: 'POST', body: { action: 'punch', staffId: row.staffId, type } });
      reload();
    } catch (err) { setActionError(`${row.name}: ${err.message}`); } finally { setBusyKey(''); }
  };

  const switchView = (next) => {
    setView(next);
    if (next === 'register' && ['today', 'yesterday'].includes(period.period)) period.setPeriod('month');
  };

  const actionsFor = (row) => {
    const record = row.record;
    const isOpen = record?.clockIn && !record.clockOut;
    const buttons = [];
    const canPunch = perms?.['attendance.create'] && (row.date === today || isOpen);
    if (canPunch && !record && row.date === today) buttons.push(<ErpButton key="in" icon={LogIn} className="min-h-8 px-2 text-xs" disabled={busyKey === `${row.staffId}-clock_in`} onClick={() => punch(row, 'clock_in')}>In</ErpButton>);
    if (canPunch && isOpen) {
      buttons.push(record.onBreak
        ? <ErpButton key="be" icon={Coffee} className="min-h-8 px-2 text-xs" onClick={() => punch(row, 'break_end')}>End break</ErpButton>
        : <ErpButton key="bs" icon={Coffee} className="min-h-8 px-2 text-xs" onClick={() => punch(row, 'break_start')}>Break</ErpButton>);
      buttons.push(<ErpButton key="out" icon={LogOut} className="min-h-8 px-2 text-xs" disabled={record.onBreak} onClick={() => punch(row, 'clock_out')}>Out</ErpButton>);
    }
    if (record && (perms?.['attendance.correct'] || perms?.['attendance.approve'])) buttons.push(<ErpButton key="fix" icon={Pencil} className="min-h-8 px-2 text-xs" onClick={() => setEditing(row)}>Correct</ErpButton>);
    if (!record && row.date <= today && perms?.['attendance.edit']) {
      buttons.push(<ErpButton key="add" icon={Plus} className="min-h-8 px-2 text-xs" onClick={() => setEditing(row)}>Enter</ErpButton>);
    }
    if (record) buttons.push(<button key="h" type="button" onClick={() => setHistoryFor(row)} className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-stone-500 hover:bg-stone-100"><History className="h-3.5 w-3.5" aria-hidden="true" />History</button>);
    return <div className="flex flex-wrap gap-1">{buttons}</div>;
  };

  const counts = data?.summary.counts || {};
  const otLabel = data && !multiDay && data.range.from === today ? 'Overtime today' : 'Overtime (potential)';

  return (
    <ErpPage>
      <PageHeader
        icon={UserCheck}
        iconTone="hrm"
        title="Attendance"
        subtitle="Staff attendance, working hours, late arrivals, early departures, overtime and attendance exceptions."
        actions={(
          <div className="flex gap-1 rounded-lg border border-stone-200 bg-white p-1">
            <button type="button" onClick={() => switchView('table')} aria-pressed={view === 'table'} className={`inline-flex min-h-8 items-center gap-1.5 rounded-md px-3 text-sm font-semibold ${view === 'table' ? 'bg-violet-100 text-violet-900' : 'text-stone-600'}`}><Table2 className="h-4 w-4" />Table</button>
            <button type="button" onClick={() => switchView('register')} aria-pressed={view === 'register'} className={`inline-flex min-h-8 items-center gap-1.5 rounded-md px-3 text-sm font-semibold ${view === 'register' ? 'bg-violet-100 text-violet-900' : 'text-stone-600'}`}><CalendarRange className="h-4 w-4" />Register</button>
          </div>
        )}
      />
      <div className="space-y-4">
        <PeriodFilter {...period.filterProps} />
        {error ? <ErrorState message={error} onRetry={reload} /> : null}
        {loading && !data ? <LoadingState /> : null}
        {data ? (
          <>
            <MetricGroup columns={5}>
              <MetricCard label="Total staff" value={data.employees.length} tone="neutral" />
              <MetricCard label="Present" value={data.summary.present} tone="inflow" hint="Includes late, half day and missing punch" />
              <MetricCard label="Absent" value={counts.ABSENT || 0} tone="outflow" />
              <MetricCard label="Late" value={counts.LATE || 0} tone="cash" />
              <MetricCard label="On leave" value={counts.ON_LEAVE || 0} tone="online" />
              <MetricCard label="Half day" value={counts.HALF_DAY || 0} tone="ops" />
              <MetricCard label="Off day" value={(counts.OFF_DAY || 0) + (counts.HOLIDAY || 0)} tone="neutral" hint="Off days and holidays" />
              <MetricCard label="Missing punch" value={counts.MISSING_PUNCH || 0} tone="outflow" />
              <MetricCard label={otLabel} value={fmtMinutes(data.summary.potentialOvertime)} tone="hrm" hint={`Approved ${fmtMinutes(data.summary.approvedOvertime)}`} />
              <MetricCard label="Worked" value={fmtMinutes(data.summary.workedMinutes)} tone="hrm" />
            </MetricGroup>

            {counts.UNSCHEDULED ? <AlertBanner tone="cash" title="Some staff have no shift">{counts.UNSCHEDULED} staff-day(s) have no shift assigned, so absence and lateness cannot be judged. <Link href="/admin/hrm/shifts" className="font-semibold underline">Assign shifts</Link>.</AlertBanner> : null}
            {actionError ? <AlertBanner tone="outflow">{actionError}</AlertBanner> : null}

            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-0 flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" aria-hidden="true" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employee" aria-label="Search employee" className="h-9 w-full rounded-lg border border-stone-200 bg-white pl-8 pr-2 text-[13px]" />
              </label>
              <div className="flex max-w-full gap-1 overflow-x-auto">
                {FILTERS.map((key) => (
                  <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={filter === key} className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${filter === key ? 'border-violet-300 bg-violet-100 text-violet-900' : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'}`}>
                    {key === 'ALL' ? 'All' : ATTENDANCE_STATUS[key].label}{key !== 'ALL' && counts[key] ? ` (${counts[key]})` : ''}
                  </button>
                ))}
              </div>
            </div>

            {view === 'register' ? <Register rows={rows} onOpen={setDetail} /> : (
              <FinancialTable
                caption="Attendance"
                rows={rows}
                rowKey={(row) => `${row.staffId}-${row.date}`}
                empty="No attendance for this filter."
                columns={[
                  { key: 'name', label: 'Employee', render: (row) => <Link href={`/admin/hrm/attendance/staff/${row.staffId}`} className="font-semibold text-stone-900 hover:underline">{row.name}</Link> },
                  { key: 'role', label: 'Role', render: (row) => <span className="capitalize text-stone-600">{row.designation}</span> },
                  ...(multiDay ? [{ key: 'date', label: 'Date', render: (row) => fmtDate(row.date) }] : []),
                  { key: 'shift', label: 'Shift', render: (row) => (row.shift ? <span title={row.shift.name}>{row.shift.startTime}–{row.shift.endTime}</span> : <span className="text-stone-400">{row.offDay ? 'Off' : row.holiday ? row.holiday.name : '—'}</span>) },
                  { key: 'in', label: 'Clock in', render: (row) => fmtPunch(row.record?.clockIn, row.date) },
                  { key: 'out', label: 'Clock out', render: (row) => (row.record?.onBreak ? <span className="font-semibold text-amber-700">On break</span> : fmtPunch(row.record?.clockOut, row.date)) },
                  { key: 'break', label: 'Break', align: 'right', render: (row) => fmtMinutes(row.record?.breakMinutes) },
                  { key: 'worked', label: 'Worked', align: 'right', render: (row) => fmtMinutes(row.record?.workedMinutes) },
                  { key: 'late', label: 'Late by', align: 'right', render: (row) => (row.record?.lateMinutes ? <span className="text-amber-700">{fmtMinutes(row.record.lateMinutes)}</span> : '—') },
                  { key: 'early', label: 'Early leave', align: 'right', render: (row) => (row.record?.earlyLeaveMinutes ? <span className="text-amber-700">{fmtMinutes(row.record.earlyLeaveMinutes)}</span> : '—') },
                  { key: 'ot', label: 'Overtime', align: 'right', render: (row) => (row.record?.overtimeMinutes ? <span className="text-violet-700" title={row.approvedOvertimeMinutes ? `Approved ${fmtMinutes(row.approvedOvertimeMinutes)}` : 'Pending approval'}>{fmtMinutes(row.record.overtimeMinutes)}</span> : '—') },
                  { key: 'status', label: 'Status', render: (row) => <AttendanceBadge status={row.status} /> },
                  { key: 'source', label: 'Source', render: (row) => <span className="text-xs text-stone-500">{row.record ? row.record.source.toLowerCase() : row.leave ? row.leave.type : ''}</span> },
                  { key: 'actions', label: '', render: actionsFor },
                ]}
              />
            )}
          </>
        ) : null}
      </div>

      {detail ? (
        <Modal title={`${detail.name} · ${fmtDate(detail.date)}`} subtitle={detail.shift ? `${detail.shift.name} ${detail.shift.startTime}–${detail.shift.endTime}` : detail.offDay ? 'Day off' : 'No shift'} onClose={() => setDetail(null)}>
          <AttendanceBadge status={detail.status} />
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-stone-500">Clock in</dt><dd>{fmtPunch(detail.record?.clockIn, detail.date)}</dd>
            <dt className="text-stone-500">Clock out</dt><dd>{fmtPunch(detail.record?.clockOut, detail.date)}</dd>
            <dt className="text-stone-500">Worked</dt><dd>{fmtMinutes(detail.record?.workedMinutes)}</dd>
            <dt className="text-stone-500">Late by</dt><dd>{fmtMinutes(detail.record?.lateMinutes)}</dd>
            <dt className="text-stone-500">Overtime</dt><dd>{fmtMinutes(detail.record?.overtimeMinutes)}{detail.approvedOvertimeMinutes ? ` (approved ${fmtMinutes(detail.approvedOvertimeMinutes)})` : ''}</dd>
            {detail.leave ? (<><dt className="text-stone-500">Leave</dt><dd>{detail.leave.type}{detail.leave.partial ? ' (half day)' : ''}</dd></>) : null}
            {detail.holiday ? (<><dt className="text-stone-500">Holiday</dt><dd>{detail.holiday.name}</dd></>) : null}
          </dl>
          <div className="pt-2">{actionsFor(detail)}</div>
        </Modal>
      ) : null}
      {editing ? <AttendanceEditDialog row={editing} canCorrect={Boolean(perms?.['attendance.correct'] || !editing.record)} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setDetail(null); reload(); }} /> : null}
      {historyFor ? <AttendanceHistoryDialog row={historyFor} onClose={() => setHistoryFor(null)} /> : null}
    </ErpPage>
  );
}
