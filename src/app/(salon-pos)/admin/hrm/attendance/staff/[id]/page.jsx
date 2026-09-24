'use client';

/** One employee's attendance profile: summary and history for a period. */

import Link from 'next/link';
import { use } from 'react';
import { ArrowLeft, UserCheck } from 'lucide-react';
import { ErpPage, ErrorState, LoadingState, PageHeader, PeriodFilter } from '@/components/erp';
import { usePeriod, useReport } from '@/components/erp/use-report';
import { AttendanceHistoryTable, AttendanceSummaryCards } from '@/components/hrm/attendance-history';

export default function EmployeeAttendancePage({ params }) {
  const { id } = use(params);
  const period = usePeriod('month');
  const { data, error, loading, reload } = useReport(`/api/hrm/attendance?staffId=${id}&${period.query}`, { enabled: period.ready });
  const employee = data?.employees?.[0];
  return (
    <ErpPage>
      <PageHeader
        icon={UserCheck}
        iconTone="hrm"
        title={employee ? `${employee.name} · attendance` : 'Employee attendance'}
        subtitle={employee ? `${employee.designation} — present, absent, late, leave, half days, overtime and worked hours.` : 'Attendance summary and history.'}
        actions={<Link href="/admin/hrm/attendance" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"><ArrowLeft className="h-4 w-4" /> Attendance</Link>}
      />
      <div className="space-y-4">
        <PeriodFilter {...period.filterProps} />
        {error ? <ErrorState message={error} onRetry={reload} /> : null}
        {loading && !data ? <LoadingState /> : null}
        {data ? (
          <>
            <AttendanceSummaryCards summary={data.summary} />
            <AttendanceHistoryTable rows={[...data.rows].reverse()} />
          </>
        ) : null}
      </div>
    </ErpPage>
  );
}
