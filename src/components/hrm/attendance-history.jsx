'use client';

/** One employee's attendance summary + history for a period (admin profile and "My attendance"). */

import { MetricCard, MetricGroup, FinancialTable } from '@/components/erp';
import { AttendanceBadge, fmtDate, fmtMinutes, fmtPunch } from './ui';

export function AttendanceSummaryCards({ summary }) {
  return (
    <MetricGroup columns={4}>
      <MetricCard label="Present days" value={summary.present} tone="inflow" hint={summary.attendanceRate === null ? undefined : `${summary.attendanceRate}% attendance`} />
      <MetricCard label="Absent days" value={summary.counts.ABSENT} tone="outflow" />
      <MetricCard label="Late days" value={summary.lateDays} tone="cash" hint={summary.lateMinutes ? `${fmtMinutes(summary.lateMinutes)} late in total` : undefined} />
      <MetricCard label="Leave days" value={summary.counts.ON_LEAVE} tone="online" />
      <MetricCard label="Half days" value={summary.counts.HALF_DAY} tone="ops" />
      <MetricCard label="Worked" value={fmtMinutes(summary.workedMinutes)} tone="hrm" />
      <MetricCard label="Overtime (approved)" value={fmtMinutes(summary.approvedOvertime)} tone="hrm" hint={summary.potentialOvertime ? `${fmtMinutes(summary.potentialOvertime)} potential` : undefined} />
      <MetricCard label="Missing punches" value={summary.counts.MISSING_PUNCH} tone="outflow" />
    </MetricGroup>
  );
}

export function AttendanceHistoryTable({ rows }) {
  return (
    <FinancialTable
      caption="Attendance history"
      rows={rows}
      rowKey={(row) => row.date}
      empty="No attendance in this period."
      columns={[
        { key: 'date', label: 'Date', render: (row) => fmtDate(row.date) },
        { key: 'shift', label: 'Shift', render: (row) => (row.shift ? `${row.shift.startTime}–${row.shift.endTime}` : row.offDay ? 'Off' : row.holiday ? row.holiday.name : '—') },
        { key: 'in', label: 'Clock in', render: (row) => fmtPunch(row.record?.clockIn, row.date) },
        { key: 'out', label: 'Clock out', render: (row) => fmtPunch(row.record?.clockOut, row.date) },
        { key: 'worked', label: 'Worked', align: 'right', render: (row) => fmtMinutes(row.record?.workedMinutes) },
        { key: 'late', label: 'Late', align: 'right', render: (row) => fmtMinutes(row.record?.lateMinutes) },
        { key: 'ot', label: 'Overtime', align: 'right', render: (row) => fmtMinutes(row.record?.overtimeMinutes) },
        { key: 'status', label: 'Status', render: (row) => <AttendanceBadge status={row.status} /> },
      ]}
    />
  );
}
