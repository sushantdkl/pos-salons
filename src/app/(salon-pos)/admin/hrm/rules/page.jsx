'use client';

/**
 * HR RULES — how attendance is measured and which attendance effects payroll may suggest.
 * Every payroll effect is OFF by default: nothing is deducted or paid until the owner says so.
 */

import { useEffect, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { AlertBanner, ErpButton, ErpPage, ErrorState, LoadingState, PageHeader, ReportSection } from '@/components/erp';
import { erpFetch, useReport } from '@/components/erp/use-report';
import { FIELD, LABEL } from '@/components/hrm/ui';

function Toggle({ label, hint, checked, onChange }) {
  return (
    <label className="flex items-start gap-3 py-2">
      <input type="checkbox" className="mt-1 h-4 w-4 accent-violet-600" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span><span className="block text-sm font-semibold text-stone-900">{label}</span>{hint ? <span className="block text-xs text-stone-500">{hint}</span> : null}</span>
    </label>
  );
}

export default function HrRulesPage() {
  const { data, error, loading, reload } = useReport('/api/hrm/policy');
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState('');
  const [saveError, setSaveError] = useState('');
  useEffect(() => { if (data?.policy) setForm(data.policy); }, [data]);
  const set = (key, value) => { setForm((current) => ({ ...current, [key]: value })); setSaved(''); };

  const save = async () => {
    setSaveError('');
    try {
      await erpFetch('/api/hrm/policy', { method: 'PUT', body: { ...form, overtimeThresholdMinutes: Number(form.overtimeThresholdMinutes), missingPunchAfterMinutes: Number(form.missingPunchAfterMinutes), overtimeMultiplier: Number(form.overtimeMultiplier), overtimeFixedHourlyRate: Number(form.overtimeFixedHourlyRate), halfDayDeductionFactor: Number(form.halfDayDeductionFactor) } });
      setSaved('HR rules saved. Changes apply to new calculations; past records keep their values.');
      reload();
    } catch (err) { setSaveError(err.message); }
  };

  return (
    <ErpPage narrow>
      <PageHeader icon={SlidersHorizontal} iconTone="hrm" title="HR rules" subtitle="How attendance is measured, and what payroll may take from it. Payroll effects are off until you turn them on." />
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {loading && !form ? <LoadingState /> : null}
      {form ? (
        <div className="space-y-4">
          <ReportSection title="Measuring attendance">
            <div className="space-y-3 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={LABEL}>Overtime starts after (minutes past the shift)<input type="number" min="0" max="600" className={FIELD} value={form.overtimeThresholdMinutes} onChange={(event) => set('overtimeThresholdMinutes', event.target.value)} /></label>
                <label className={LABEL}>Missing punch after shift end (minutes)<input type="number" min="0" max="1440" className={FIELD} value={form.missingPunchAfterMinutes} onChange={(event) => set('missingPunchAfterMinutes', event.target.value)} /></label>
              </div>
              <Toggle label="Deduct the shift's break when none was punched" hint="Staff who never press Break still get the shift's unpaid break taken off worked time." checked={form.autoDeductScheduledBreak} onChange={(value) => set('autoDeductScheduledBreak', value)} />
              <Toggle label="Work on an off day or holiday is potential overtime" hint="It still needs approval before payroll can use it." checked={form.overtimeOnOffDays} onChange={(value) => set('overtimeOnOffDays', value)} />
            </div>
          </ReportSection>
          <ReportSection title="Overtime pay (suggested to payroll)">
            <div className="space-y-3 p-4">
              <label className={LABEL}>Approved overtime is paid
                <select className={FIELD} value={form.overtimePayMode} onChange={(event) => set('overtimePayMode', event.target.value)}>
                  <option value="NONE">Not calculated (decide in payroll)</option>
                  <option value="MULTIPLIER">Hourly salary × multiplier</option>
                  <option value="FIXED_HOURLY">Fixed amount per hour</option>
                </select>
              </label>
              {form.overtimePayMode === 'MULTIPLIER' ? <label className={LABEL}>Multiplier<input type="number" min="0" step="0.25" className={FIELD} value={form.overtimeMultiplier} onChange={(event) => set('overtimeMultiplier', event.target.value)} /></label> : null}
              {form.overtimePayMode === 'FIXED_HOURLY' ? <label className={LABEL}>Rs per hour<input type="number" min="0" step="1" className={FIELD} value={form.overtimeFixedHourlyRate} onChange={(event) => set('overtimeFixedHourlyRate', event.target.value)} /></label> : null}
              <p className="text-xs text-stone-500">Hourly salary = base salary ÷ the month&apos;s scheduled hours.</p>
            </div>
          </ReportSection>
          <ReportSection title="Attendance deductions (suggested to payroll)">
            <div className="p-4">
              <Toggle label="Deduct absent days" hint="Absent day × (base salary ÷ the month's expected working days)." checked={form.deductAbsentDays} onChange={(value) => set('deductAbsentDays', value)} />
              <Toggle label="Deduct unpaid leave days" checked={form.deductUnpaidLeave} onChange={(value) => set('deductUnpaidLeave', value)} />
              <Toggle label="Deduct half days" checked={form.deductHalfDays} onChange={(value) => set('deductHalfDays', value)} />
              {form.deductHalfDays ? <label className={LABEL}>A half day deducts this share of a day<input type="number" min="0" max="1" step="0.05" className={FIELD} value={form.halfDayDeductionFactor} onChange={(event) => set('halfDayDeductionFactor', event.target.value)} /></label> : null}
              <p className="mt-2 text-xs text-stone-500">Lateness is never deducted automatically. Suggestions appear on the salary form; the admin applies them and they never move cash on their own.</p>
            </div>
          </ReportSection>
          {saveError ? <AlertBanner tone="outflow">{saveError}</AlertBanner> : null}
          {saved ? <AlertBanner tone="inflow">{saved}</AlertBanner> : null}
          <div className="flex justify-end"><ErpButton variant="primary" onClick={save}>Save HR rules</ErpButton></div>
        </div>
      ) : null}
    </ErpPage>
  );
}
