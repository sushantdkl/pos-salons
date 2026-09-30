'use client';

/**
 * SALARY ADVANCE (admin + cashier). Cashiers may issue advances only; full salary payments,
 * edits, reversals and deletions stay Admin-only on the server. /api/payroll/advances checks
 * the configured ceiling and the drawer, and books the advance as salary paid early.
 */

import { useEffect, useRef, useState } from 'react';
import { Coins } from 'lucide-react';
import { AlertBanner, ErpButton, ErpPage, MetricCard, MetricGroup, money, PageHeader, ReportSection } from '@/components/erp';
import { erpFetch } from '@/components/erp/use-report';
import { CommissionPanel } from '@/components/payroll/commission-panel';

const EMPTY = { staffId: '', amount: '', paymentMethod: 'cash', note: '', overrideReason: '' };
const FIELD = 'mt-1 block h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900 focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-200';
const LABEL = 'block text-xs font-bold uppercase tracking-[0.04em] text-stone-500';

export default function CashierAdvancesPage() {
  const [employees, setEmployees] = useState([]);
  const [policy, setPolicy] = useState(null);
  const [canOverride, setCanOverride] = useState(false);
  const [showsEarnings, setShowsEarnings] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const key = useRef(null);

  const load = async () => {
    try {
      const data = await erpFetch('/api/payroll/advances');
      setEmployees(data.employees || []);
      setPolicy(data.policy);
      setCanOverride(Boolean(data.canOverride));
      setShowsEarnings(Boolean(data.showsEarnings));
    } catch (loadError) {
      setError(loadError.message || 'Unable to load advances');
    }
  };
  useEffect(() => { load(); }, []);

  const set = (field, value) => { setForm((current) => ({ ...current, [field]: value })); setError(''); setMessage(''); };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    if (!key.current) key.current = crypto.randomUUID();
    try {
      await erpFetch('/api/payroll/advances', {
        method: 'POST',
        headers: { 'Idempotency-Key': key.current },
        body: { ...form, staffId: Number(form.staffId), amount: Number(form.amount) },
      });
      key.current = null;
      setForm(EMPTY);
      setMessage(selected?.payType === 'commission'
        ? 'Commission advance issued. It will be deducted from the next commission settlement.'
        : 'Salary advance issued and recorded against the drawer / account.');
      load();
    } catch (submitError) {
      setError(submitError.message || 'Unable to issue advance');
    } finally {
      setBusy(false);
    }
  };

  const selected = employees.find((employee) => String(employee.id) === String(form.staffId));
  const isCommission = selected?.payType === 'commission';
  const overAllowance = selected ? Number(form.amount || 0) > Number(selected.remainingEligible || 0) + 0.001 : false;

  return (
    <ErpPage narrow>
      <PageHeader
        icon={Coins}
        iconTone="hrm"
        title="Salary & commission advance"
        subtitle="Pay a staff member early. Salary-based staff are limited by their base salary; commission-based staff by the commission they have already earned. It is deducted automatically at the next settlement."
      />
      <div className="space-y-4">
        {message ? <AlertBanner tone="inflow" title="Advance issued">{message}</AlertBanner> : null}
        {error ? <AlertBanner tone="outflow">{error}</AlertBanner> : null}
        {policy && !policy.configured ? (
          <AlertBanner tone="cash" title="Advances are locked">An admin must set the advance ceiling in Settings first.</AlertBanner>
        ) : null}

        <ReportSection>
          <form onSubmit={submit} className="space-y-4 p-4 sm:p-5">
            <label className={LABEL}>Employee *
              <select required value={form.staffId} onChange={(event) => set('staffId', event.target.value)} className={FIELD}>
                <option value="">Select employee</option>
                {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.role} · {employee.payType === 'commission' ? 'commission' : 'salary'}</option>)}
              </select>
            </label>
            {selected && isCommission && showsEarnings ? <CommissionPanel staffId={selected.id} /> : null}
            {selected && (!isCommission || !showsEarnings) ? (
              <MetricGroup columns={3}>
                <MetricCard label="Outstanding" value={money(selected.outstandingAdvance)} tone="hrm" />
                <MetricCard label="Issued this period" value={money(selected.periodIssued)} tone="neutral" />
                <MetricCard label={isCommission ? 'Can advance now' : 'Still allowed'} value={money(selected.remainingEligible)} tone="inflow" />
              </MetricGroup>
            ) : null}
            {selected && isCommission && !showsEarnings ? <p className="text-xs text-stone-500">Commission-based: the limit is the commission already earned and not yet paid. Earnings detail is visible to the admin.</p> : null}
            {selected && !isCommission && selected.paySetupMissing ? (
              <AlertBanner tone="cash" title="No base salary set">Set a base salary for {selected.name} in Staff, or tick &quot;Commission-based staff&quot; if they are paid by commission.</AlertBanner>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={LABEL}>Amount *
                <input required type="number" min="0.01" step="0.01" inputMode="decimal" value={form.amount} onChange={(event) => set('amount', event.target.value)} className={FIELD} />
              </label>
              <label className={LABEL}>Paid from
                <select value={form.paymentMethod} onChange={(event) => set('paymentMethod', event.target.value)} className={FIELD}>
                  <option value="cash">Cash drawer</option>
                  <option value="online">Online / bank</option>
                </select>
              </label>
            </div>
            <label className={LABEL}>Reason / note *
              <textarea required value={form.note} onChange={(event) => set('note', event.target.value)} rows={3} className={`${FIELD} h-auto py-2`} />
            </label>
            {overAllowance ? (
              canOverride ? (
                <label className={LABEL}>Over the allowance — admin reason *
                  <input value={form.overrideReason} onChange={(event) => set('overrideReason', event.target.value)} className={FIELD} placeholder="Why this staff member may take more than the allowance" />
                </label>
              ) : <AlertBanner tone="outflow">This is more than {selected?.name} can be advanced right now ({money(selected?.remainingEligible)}). Only an admin can approve more.</AlertBanner>
            ) : null}
            <ErpButton type="submit" variant="primary" disabled={busy || !policy?.configured || (overAllowance && !(canOverride && form.overrideReason.trim()))}>{busy ? 'Issuing…' : 'Issue advance'}</ErpButton>
          </form>
        </ReportSection>
      </div>
    </ErpPage>
  );
}
