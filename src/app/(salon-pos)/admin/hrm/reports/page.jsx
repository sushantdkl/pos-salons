'use client';

/**
 * ATTENDANCE REPORTS & ANALYTICS — daily, monthly, late, absence, leave, overtime, missing punch
 * and per-employee summary. All from the same attendance board as the Attendance page, so the
 * numbers always agree. Attendance is reported separately from sales performance on purpose.
 */

import Link from 'next/link';
import { useState } from 'react';
import { ClipboardList, Download } from 'lucide-react';
import {
  ErpButton, ErpPage, ErrorState, FinancialTable, LoadingState, MetricCard, MetricGroup, PageHeader, PeriodFilter, PrintButton, PrintHeader,
} from '@/components/erp';
import { usePeriod, useReport } from '@/components/erp/use-report';
import { AttendanceBadge, fmtDate, fmtMinutes, fmtPunch } from '@/components/hrm/ui';

const REPORTS = [
  ['daily', 'Daily attendance'], ['monthly', 'Monthly attendance'], ['late', 'Late arrivals'], ['absence', 'Absence'],
  ['leave', 'Leave'], ['overtime', 'Overtime'], ['missing', 'Missing punch'], ['summary', 'Employee summary'],
];

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function tableFor(type, rows) {
  if (type === 'monthly' || type === 'summary') {
    return {
      headers: ['Employee', 'Present', 'Late days', 'Absent', 'Half days', 'On leave', 'Off/holiday', 'Missing punch', 'Worked', 'Late minutes', 'Approved OT', 'Attendance rate'],
      rows: rows.map((row) => [row.name, row.present, row.lateDays, row.counts.ABSENT, row.counts.HALF_DAY, row.counts.ON_LEAVE, row.counts.OFF_DAY + row.counts.HOLIDAY, row.counts.MISSING_PUNCH, fmtMinutes(row.workedMinutes), row.lateMinutes, fmtMinutes(row.approvedOvertime), row.attendanceRate === null ? '—' : `${row.attendanceRate}%`]),
      columns: [
        { key: 'name', label: 'Employee', render: (row) => <Link href={`/admin/hrm/attendance/staff/${row.id}`} className="font-semibold hover:underline">{row.name}</Link> },
        { key: 'p', label: 'Present', align: 'right', render: (row) => row.present },
        { key: 'l', label: 'Late', align: 'right', render: (row) => row.lateDays },
        { key: 'a', label: 'Absent', align: 'right', render: (row) => row.counts.ABSENT },
        { key: 'hd', label: 'Half', align: 'right', render: (row) => row.counts.HALF_DAY },
        { key: 'lv', label: 'Leave', align: 'right', render: (row) => row.counts.ON_LEAVE },
        { key: 'mp', label: 'Missing', align: 'right', render: (row) => row.counts.MISSING_PUNCH },
        { key: 'w', label: 'Worked', align: 'right', render: (row) => fmtMinutes(row.workedMinutes) },
        { key: 'ot', label: 'Approved OT', align: 'right', render: (row) => fmtMinutes(row.approvedOvertime) },
        { key: 'rate', label: 'Attendance', align: 'right', render: (row) => (row.attendanceRate === null ? '—' : `${row.attendanceRate}%`) },
      ],
      rowKey: (row) => row.id,
    };
  }
  if (type === 'leave') {
    return {
      headers: ['Employee', 'Type', 'From', 'To', 'Days', 'Status', 'Reason'],
      rows: rows.map((row) => [row.staffName, row.leaveType, row.startDate, row.endDate, row.days, row.status, row.reason || '']),
      columns: [
        { key: 'who', label: 'Employee', render: (row) => row.staffName },
        { key: 'type', label: 'Type', render: (row) => row.leaveType },
        { key: 'dates', label: 'Dates', render: (row) => `${fmtDate(row.startDate)}${row.endDate !== row.startDate ? ` → ${fmtDate(row.endDate)}` : ''}` },
        { key: 'days', label: 'Days', align: 'right', render: (row) => row.days },
        { key: 'status', label: 'Status', render: (row) => row.status.toLowerCase() },
      ],
      rowKey: (row) => row.id,
    };
  }
  if (type === 'overtime') {
    return {
      headers: ['Date', 'Employee', 'Potential (min)', 'Approved (min)', 'Status', 'Decided by'],
      rows: rows.map((row) => [row.date, row.staffName, row.potentialMinutes, row.approvedMinutes, row.status, row.decidedBy || '']),
      columns: [
        { key: 'date', label: 'Date', render: (row) => fmtDate(row.date) },
        { key: 'who', label: 'Employee', render: (row) => row.staffName },
        { key: 'pot', label: 'Potential', align: 'right', render: (row) => fmtMinutes(row.potentialMinutes) },
        { key: 'app', label: 'Approved', align: 'right', render: (row) => fmtMinutes(row.approvedMinutes) },
        { key: 'status', label: 'Status', render: (row) => row.status.toLowerCase() },
      ],
      rowKey: (row) => row.id,
    };
  }
  return {
    headers: ['Date', 'Employee', 'Shift', 'Clock in', 'Clock out', 'Worked', 'Late', 'Early leave', 'Overtime', 'Status'],
    rows: rows.map((row) => [row.date, row.name, row.shift ? `${row.shift.startTime}-${row.shift.endTime}` : '', fmtPunch(row.record?.clockIn, row.date), fmtPunch(row.record?.clockOut, row.date), row.record?.workedMinutes ?? '', row.record?.lateMinutes ?? '', row.record?.earlyLeaveMinutes ?? '', row.record?.overtimeMinutes ?? '', row.status]),
    columns: [
      { key: 'date', label: 'Date', render: (row) => fmtDate(row.date) },
      { key: 'who', label: 'Employee', render: (row) => row.name },
      { key: 'shift', label: 'Shift', render: (row) => (row.shift ? `${row.shift.startTime}–${row.shift.endTime}` : '—') },
      { key: 'in', label: 'In', render: (row) => fmtPunch(row.record?.clockIn, row.date) },
      { key: 'out', label: 'Out', render: (row) => fmtPunch(row.record?.clockOut, row.date) },
      { key: 'w', label: 'Worked', align: 'right', render: (row) => fmtMinutes(row.record?.workedMinutes) },
      { key: 'l', label: 'Late', align: 'right', render: (row) => fmtMinutes(row.record?.lateMinutes) },
      { key: 'ot', label: 'Overtime', align: 'right', render: (row) => fmtMinutes(row.record?.overtimeMinutes) },
      { key: 's', label: 'Status', render: (row) => <AttendanceBadge status={row.status} /> },
    ],
    rowKey: (row) => `${row.staffId}-${row.date}`,
  };
}

export default function AttendanceReportsPage() {
  const period = usePeriod('month');
  const [type, setType] = useState('summary');
  const { data, error, loading, reload } = useReport(`/api/hrm/reports?type=${type}&${period.query}`, { enabled: period.ready });
  const { data: overview } = useReport(`/api/hrm/reports?type=summary&${period.query}`, { enabled: period.ready });
  const table = data ? tableFor(type, data.rows) : null;
  const label = REPORTS.find(([key]) => key === type)[1];
  const s = overview?.summary;

  const download = () => {
    const csv = [table.headers, ...table.rows].map((row) => row.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${label} ${data.range.from} to ${data.range.to}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ErpPage>
      <PrintHeader title={label} period={data ? `${data.range.from} → ${data.range.to}` : ''} />
      <PageHeader
        icon={ClipboardList}
        iconTone="hrm"
        title="Attendance reports"
        subtitle="Attendance, lateness, absence, leave and overtime. Sales performance is reported separately under Staff Performance."
        actions={<>{table ? <ErpButton icon={Download} onClick={download} disabled={!table.rows.length}>CSV</ErpButton> : null}<PrintButton /></>}
      />
      <div className="space-y-4">
        <PeriodFilter {...period.filterProps} />
        {s ? (
          <MetricGroup columns={4}>
            <MetricCard label="Attendance rate" value={s.attendanceRate === null ? '—' : `${s.attendanceRate}%`} tone="inflow" hint="Present ÷ (present + absent)" />
            <MetricCard label="Absence rate" value={s.absenceRate === null ? '—' : `${s.absenceRate}%`} tone="outflow" />
            <MetricCard label="Late arrivals" value={s.lateDays} tone="cash" hint={`${fmtMinutes(s.lateMinutes)} in total`} />
            <MetricCard label="Worked hours" value={fmtMinutes(s.workedMinutes)} tone="hrm" />
            <MetricCard label="Approved overtime" value={fmtMinutes(s.approvedOvertime)} tone="hrm" />
            <MetricCard label="Leave days" value={s.counts.ON_LEAVE} tone="online" />
            <MetricCard label="Missing punches" value={s.counts.MISSING_PUNCH} tone="outflow" />
            <MetricCard label="Half days" value={s.counts.HALF_DAY} tone="ops" />
          </MetricGroup>
        ) : null}
        <nav className="print-hide flex gap-1 overflow-x-auto" aria-label="Report type">
          {REPORTS.map(([key, text]) => <button key={key} type="button" onClick={() => setType(key)} aria-pressed={type === key} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${type === key ? 'border-violet-300 bg-violet-100 text-violet-900' : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'}`}>{text}</button>)}
        </nav>
        {error ? <ErrorState message={error} onRetry={reload} /> : null}
        {loading && !data ? <LoadingState /> : null}
        {table ? <FinancialTable caption={label} rows={data.rows} rowKey={table.rowKey} columns={table.columns} empty="Nothing to report for this period." /> : null}
      </div>
    </ErpPage>
  );
}
