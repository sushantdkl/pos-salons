'use client';

/**
 * Attendance for the salary month, on the salary form. Read-only INPUT: nothing changes the
 * salary until the admin presses Apply, and applying only fills the Bonus / Deduction fields.
 * The figures used are saved with the settlement (attendance snapshot) for audit.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import { money } from '@/components/erp';
import { erpFetch } from '@/components/erp/use-report';
import { fmtMinutes } from './ui';

export default function PayrollAttendancePanel({ staffId, month, onApplyBonus, onApplyDeduction, onSnapshot }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState({ bonus: false, deduction: false });

  useEffect(() => {
    setInfo(null);
    setError('');
    setApplied({ bonus: false, deduction: false });
    if (!staffId || !/^\d{4}-\d{2}$/.test(month || '')) return undefined;
    let alive = true;
    erpFetch(`/api/hrm/payroll-inputs?month=${month}&staffId=${staffId}`)
      .then((data) => {
        if (!alive) return;
        const row = data.staff?.[0] || null;
        setInfo(row);
        if (row) {
          onSnapshot?.({
            month, expectedDays: row.expectedDays, presentDays: row.presentDays, paidLeaveDays: row.paidLeaveDays, unpaidLeaveDays: row.unpaidLeaveDays,
            absentDays: row.absentDays, halfDays: row.halfDays, lateDays: row.lateDays, lateMinutes: row.lateMinutes, missingPunches: row.missingPunches,
            approvedOvertimeMinutes: row.approvedOvertimeMinutes, suggestedOvertimePay: row.suggestion.overtimePay, suggestedDeduction: row.suggestion.attendanceDeduction,
          });
        }
      })
      .catch((err) => { if (alive) setError(err.message); });
    return () => { alive = false; };
    // Only staff and month drive this; onSnapshot is the parent form's setter.
  }, [staffId, month]);

  if (!staffId) return null;
  if (error) return <p className="rounded-lg bg-stone-50 p-3 text-xs text-stone-500">Attendance not available: {error}</p>;
  if (!info) return <p className="rounded-lg bg-stone-50 p-3 text-xs text-stone-500">Loading attendance…</p>;

  const cells = [
    ['Expected days', info.expectedDays], ['Present', info.presentDays], ['Paid leave', info.paidLeaveDays], ['Unpaid leave', info.unpaidLeaveDays],
    ['Absent', info.absentDays], ['Half days', info.halfDays], ['Late', `${info.lateDays} (${fmtMinutes(info.lateMinutes)})`], ['Approved OT', fmtMinutes(info.approvedOvertimeMinutes)],
  ];
  const s = info.suggestion;
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 text-sm">
      <p className="mb-2 flex items-center gap-1.5 font-semibold text-violet-900"><CalendarCheck className="h-4 w-4" aria-hidden="true" />Attendance for {month}{info.complete ? '' : ' (month in progress)'}</p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
        {cells.map(([label, value]) => (<div key={label}><dt className="text-[11px] uppercase tracking-wide text-stone-500">{label}</dt><dd className="font-semibold tabular-nums text-stone-900">{value}</dd></div>))}
      </dl>
      {info.missingPunches ? <p className="mt-2 text-xs font-semibold text-rose-700">{info.missingPunches} missing punch(es) — fix them in Attendance before paying.</p> : null}
      {info.pendingOvertimeMinutes ? <p className="mt-1 text-xs text-amber-700">{fmtMinutes(info.pendingOvertimeMinutes)} overtime still waiting for approval (not counted).</p> : null}
      {info.unscheduledDays ? <p className="mt-1 text-xs text-amber-700">{info.unscheduledDays} day(s) had no shift assigned.</p> : null}
      <div className="mt-2 space-y-1 border-t border-violet-200 pt-2">
        {s.overtimePay > 0 ? (
          <p className="flex items-center justify-between gap-2">Overtime pay (HR rules) <span className="flex items-center gap-2"><b>{money(s.overtimePay)}</b><button type="button" disabled={applied.bonus} onClick={() => { onApplyBonus(s.overtimePay); setApplied((a) => ({ ...a, bonus: true })); }} className="text-xs font-bold text-violet-700 hover:underline disabled:text-stone-400">{applied.bonus ? 'Added' : 'Add to bonus'}</button></span></p>
        ) : null}
        {s.attendanceDeduction > 0 ? (
          <p className="flex items-center justify-between gap-2">Attendance deduction ({s.deductionDays} day × {money(s.dailyRate)}) <span className="flex items-center gap-2"><b>{money(s.attendanceDeduction)}</b><button type="button" disabled={applied.deduction} onClick={() => { onApplyDeduction(s.attendanceDeduction); setApplied((a) => ({ ...a, deduction: true })); }} className="text-xs font-bold text-violet-700 hover:underline disabled:text-stone-400">{applied.deduction ? 'Added' : 'Add to deduction'}</button></span></p>
        ) : null}
        {!s.overtimePay && !s.attendanceDeduction ? <p className="text-xs text-stone-500">No automatic overtime pay or deduction under the current <Link href="/admin/hrm/rules" className="font-semibold text-violet-700 hover:underline">HR rules</Link>. Lateness is never deducted automatically.</p> : null}
      </div>
    </div>
  );
}
