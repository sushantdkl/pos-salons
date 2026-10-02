'use client';

/**
 * LOYALTY — service loyalty programs (e.g. 9 paid haircuts → 10th free), customer progress,
 * outstanding rewards and the ledger. Every number is from the loyalty ledger; adjustments need
 * a reason and are audited. Rewards are applied at the POS by the cashier.
 */

import { fmtDate, fmtDateTime } from '@/lib/dates/display';
import { DateInput } from '@/components/shared/calendar-date-input';
import Link from 'next/link';
import { BillLink } from '@/components/bills/bill-detail';
import { useEffect, useMemo, useState } from 'react';
import { Award, CheckCircle2, Gift, MessageSquareHeart, Pencil, Plus, Search, SlidersHorizontal } from 'lucide-react';
import {
  AlertBanner, ErpButton, ErpPage, ErrorState, FinancialTable, LoadingState, MetricCard, MetricGroup, PageHeader, StatusBadge,
} from '@/components/erp';
import { erpFetch, useReport } from '@/components/erp/use-report';
import { FIELD, LABEL, Modal } from '@/components/hrm/ui';

const TABS = [['overview', 'Setup & overview'], ['customers', 'Customer cards'], ['rewards', 'Ready rewards'], ['transactions', 'Activity']];
const TYPE_LABEL = { EARN: 'Paid visit', REDEEM: 'Reward used', REVERSAL: 'Reversal', MANUAL_ADJUSTMENT: 'Adjustment', EXPIRY: 'Expiry' };

function fmt(value) {
  if (!value) return '—';
  return fmtDate(value);
}

function ProgressDots({ progress, total }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${progress} of ${total}`}>
      {Array.from({ length: Math.min(total, 12) }, (_, index) => <span key={index} className={`h-2.5 w-2.5 rounded-full ${index < progress ? 'bg-rose-500' : 'bg-stone-200'}`} />)}
      <span className="ml-1 text-xs font-semibold tabular-nums text-stone-700">{progress}/{total}</span>
    </span>
  );
}

function ProgramEditor({ initial, services, onClose, onSaved }) {
  const categories = useMemo(() => [...new Set(services.map((s) => s.category).filter(Boolean))].sort(), [services]);
  const [form, setForm] = useState(() => ({
    name: '', eligibleServiceIds: [], eligibleCategories: [], requiredVisits: 9, rewardType: 'FREE_SERVICE', rewardServiceId: '', rewardValue: '', rewardLabel: '',
    rewardCountsAsVisit: false, startDate: '', endDate: '', isActive: true, ...initial,
    ...(initial ? { rewardServiceId: initial.rewardServiceId || '', rewardValue: initial.rewardValue || '', startDate: initial.startDate || '', endDate: initial.endDate || '' } : {}),
  }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const toggle = (key, value) => set(key, form[key].includes(value) ? form[key].filter((v) => v !== value) : [...form[key], value]);
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await erpFetch('/api/crm/loyalty', { method: 'POST', body: { action: 'program', ...form, id: initial?.id, requiredVisits: Number(form.requiredVisits), rewardServiceId: Number(form.rewardServiceId) || null, rewardValue: Number(form.rewardValue) || 0 } });
      onSaved();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal wide title={initial?.id ? `Edit ${initial.name}` : 'New loyalty program'} subtitle="Counts paid, non-voided eligible services only." onClose={onClose}
      footer={<><ErpButton onClick={onClose} disabled={busy}>Cancel</ErpButton><ErpButton variant="primary" onClick={save} disabled={busy || !form.name.trim()}>{busy ? 'Saving…' : 'Save program'}</ErpButton></>}>
      <label className={LABEL}>Program name<input className={FIELD} value={form.name} placeholder="Haircut Loyalty" onChange={(event) => set('name', event.target.value)} /></label>
      <fieldset>
        <legend className={LABEL}>Eligible services</legend>
        <div className="mt-1 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
          {services.map((service) => <button key={service.id} type="button" aria-pressed={form.eligibleServiceIds.includes(service.id)} onClick={() => toggle('eligibleServiceIds', service.id)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${form.eligibleServiceIds.includes(service.id) ? 'border-rose-300 bg-rose-100 text-rose-900' : 'border-stone-200 text-stone-600'}`}>{service.name}</button>)}
        </div>
      </fieldset>
      <fieldset>
        <legend className={LABEL}>…or whole categories</legend>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {categories.map((category) => <button key={category} type="button" aria-pressed={form.eligibleCategories.includes(category)} onClick={() => toggle('eligibleCategories', category)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${form.eligibleCategories.includes(category) ? 'border-rose-300 bg-rose-100 text-rose-900' : 'border-stone-200 text-stone-600'}`}>{category}</button>)}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>Paid visits needed<input type="number" min="1" max="100" className={FIELD} value={form.requiredVisits} onChange={(event) => set('requiredVisits', event.target.value)} /></label>
        <label className={LABEL}>Reward
          <select className={FIELD} value={form.rewardType} onChange={(event) => set('rewardType', event.target.value)}>
            <option value="FREE_SERVICE">A free service</option>
            <option value="FIXED_DISCOUNT">Fixed amount off</option>
            <option value="PERCENTAGE_DISCOUNT">Percentage off</option>
          </select>
        </label>
      </div>
      {form.rewardType === 'FREE_SERVICE' ? (
        <label className={LABEL}>Free service
          <select className={FIELD} value={form.rewardServiceId} onChange={(event) => set('rewardServiceId', event.target.value)}>
            <option value="">Choose…</option>
            {services.map((service) => <option key={service.id} value={service.id}>{service.name} · Rs {service.price}</option>)}
          </select>
        </label>
      ) : <label className={LABEL}>{form.rewardType === 'FIXED_DISCOUNT' ? 'Amount off (Rs)' : 'Percent off'}<input type="number" min="0" className={FIELD} value={form.rewardValue} onChange={(event) => set('rewardValue', event.target.value)} /></label>}
      <label className={LABEL}>Reward name shown to customers (optional)<input className={FIELD} value={form.rewardLabel} placeholder="Free Haircut" onChange={(event) => set('rewardLabel', event.target.value)} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>Starts<DateInput className={FIELD} value={form.startDate} onChange={(event) => set('startDate', event.target.value)} /></label>
        <label className={LABEL}>Ends (optional)<DateInput className={FIELD} value={form.endDate} onChange={(event) => set('endDate', event.target.value)} /></label>
      </div>
      <label className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" checked={form.rewardCountsAsVisit} onChange={(event) => set('rewardCountsAsVisit', event.target.checked)} /> The free visit also counts as the first visit of the next card</label>
      <label className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" checked={form.isActive} onChange={(event) => set('isActive', event.target.checked)} /> Active</label>
      {error ? <AlertBanner tone="outflow">{error}</AlertBanner> : null}
    </Modal>
  );
}

export default function LoyaltyPage() {
  const { data, error, loading, reload } = useReport('/api/crm/loyalty');
  const [services, setServices] = useState([]);
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(null);
  const [adjust, setAdjust] = useState(null);
  const [actionError, setActionError] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => { erpFetch('/api/admin/services').then((d) => setServices((d.services || []).filter((s) => s.is_active !== false))).catch(() => {}); }, []);

  const customers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.customers || []).filter((row) => !term || String(row.name).toLowerCase().includes(term) || String(row.phone || '').includes(term));
  }, [data, search]);

  const saveAdjust = async () => {
    setActionError('');
    try {
      await erpFetch('/api/crm/loyalty', { method: 'POST', body: { action: 'adjust', customerId: adjust.customerId, programId: adjust.programId, visits: Number(adjust.visits), reason: adjust.reason } });
      setAdjust(null);
      reload();
    } catch (err) { setActionError(err.message); }
  };

  const customerColumns = [
    { key: 'name', label: 'Customer', render: (row) => <Link href={`/admin/customers/${row.customerId}`} className="font-semibold text-stone-900 hover:underline">{row.name}</Link> },
    { key: 'phone', label: 'Phone', render: (row) => row.phone || '—' },
    { key: 'program', label: 'Program', render: (row) => row.programName },
    { key: 'progress', label: 'Progress', render: (row) => <ProgressDots progress={row.progress} total={row.requiredVisits} /> },
    { key: 'status', label: 'Reward', render: (row) => (row.available > 0 ? <StatusBadge status="READY" label={`${row.rewardLabel} ready${row.available > 1 ? ` ×${row.available}` : ''}`} tone="crm" /> : <span className="text-xs text-stone-500">{row.remaining} visit{row.remaining === 1 ? '' : 's'} remaining</span>) },
    { key: 'last', label: 'Last eligible visit', render: (row) => fmt(row.lastEarnAt) },
    { key: 'redeem', label: 'Last redemption', render: (row) => fmt(row.lastRedeemAt) },
    { key: 'adj', label: '', render: (row) => <button type="button" onClick={() => { setActionError(''); setAdjust({ ...row, visits: '1', reason: '' }); }} className="text-xs font-bold text-rose-700 hover:underline">Adjust</button> },
  ];

  const t = data?.totals;
  return (
    <ErpPage>
      <PageHeader icon={Award} iconTone="crm" title="Loyalty" subtitle="Digital loyalty cards: paid visits earn stamps, rewards are applied at the POS as a discount."
        actions={<div className="flex flex-wrap gap-2"><Link href="/admin/crm/reviews?tab=settings" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"><MessageSquareHeart className="h-4 w-4" />Review & QR settings</Link><ErpButton icon={Plus} variant="primary" onClick={() => setEditing({})}>New program</ErpButton></div>} />
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {loading && !data ? <LoadingState /> : null}
      {data ? (
        <div className="space-y-4">
          <nav className="flex gap-2 overflow-x-auto border-b border-stone-200 pb-2" aria-label="Loyalty sections">
            {TABS.map(([key, label]) => <button key={key} type="button" onClick={() => setTab(key)} aria-current={tab === key ? 'page' : undefined} className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium ${tab === key ? 'bg-rose-100 text-rose-900' : 'text-stone-600 hover:bg-stone-100'}`}>{label}</button>)}
          </nav>
          {actionError && !adjust ? <AlertBanner tone="outflow">{actionError}</AlertBanner> : null}

          {tab === 'overview' ? (
            <>
              <MetricGroup columns={4}>
                <MetricCard label="Active loyalty customers" value={t.enrolled} tone="crm" />
                <MetricCard label="Customers 1 visit away" value={t.nearReward} tone="cash" />
                <MetricCard label="Rewards redeemed" value={t.rewardsRedeemed} tone="ops" />
                <MetricCard label="Outstanding rewards" value={t.outstandingRewards} tone="online" hint={t.redemptionRate === null ? undefined : `${t.redemptionRate}% redemption rate`} />
              </MetricGroup>
              {!data.programs.length ? <AlertBanner tone="cash" title="No loyalty program yet">Create one — e.g. Haircut: 9 paid visits, the 10th free.</AlertBanner> : null}
              {data.programs.length ? (
                <section className="space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div><h2 className="flex items-center gap-2 font-semibold text-stone-950"><CheckCircle2 className="h-4 w-4 text-emerald-600" />Loyalty is configured</h2><p className="text-xs text-stone-500">Edit the earning rule or reward here. Customer progress updates automatically from paid bills.</p></div>
                    <ErpButton icon={Plus} onClick={() => setEditing({})}>Add another program</ErpButton>
                  </div>
                  <FinancialTable caption="Loyalty programs" rows={data.programs} empty="No programs yet." columns={[
                    { key: 'name', label: 'Program', render: (row) => <span className="font-semibold">{row.name}</span> },
                    { key: 'eligible', label: 'Services that earn visits', render: (row) => [...row.eligibleServiceIds.map((id) => services.find((s) => s.id === id)?.name || `#${id}`), ...row.eligibleCategories.map((c) => `${c} category`)].join(', ') },
                    { key: 'rule', label: 'Customer earns', render: (row) => `${row.requiredVisits} paid visits → ${row.rewardLabel}` },
                    { key: 'active', label: 'Status', render: (row) => <StatusBadge status={row.isActive ? 'ACTIVE' : 'CLOSED'} label={row.isActive ? 'Active' : 'Inactive'} tone={row.isActive ? 'inflow' : 'neutral'} /> },
                    { key: 'edit', label: '', render: (row) => <button type="button" onClick={() => setEditing(row)} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-bold text-rose-700 hover:bg-rose-50"><Pencil className="h-3.5 w-3.5" />Edit program</button> },
                  ]} />
                </section>
              ) : null}
              <section className="rounded-xl border border-stone-200 bg-white p-4">
                <h2 className="font-semibold text-stone-950">What happens automatically</h2>
                <div className="mt-3 grid gap-3 text-sm text-stone-600 md:grid-cols-3">
                  <p><b className="block text-stone-900">1. Paid service</b>An identified customer earns a visit only for eligible, fully paid services.</p>
                  <p><b className="block text-stone-900">2. Reward becomes ready</b>The cashier sees it at billing and applies it as a discount.</p>
                  <p><b className="block text-stone-900">3. History stays auditable</b>Voids reverse visits and manual changes always require a reason.</p>
                </div>
                <Link href="/admin/crm/reviews?tab=settings" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-rose-700 hover:underline"><Gift className="h-4 w-4" />Choose what customers can see on the QR page</Link>
              </section>
              <p className="text-xs text-stone-500">Figures describe what customers earned and used. They do not claim that loyalty caused any sales.</p>
            </>
          ) : null}

          {tab === 'programs' ? (
            <FinancialTable caption="Loyalty programs" rows={data.programs} empty="No programs yet." columns={[
              { key: 'name', label: 'Program', render: (row) => <span className="font-semibold">{row.name}</span> },
              { key: 'eligible', label: 'Counts', render: (row) => [...row.eligibleServiceIds.map((id) => services.find((s) => s.id === id)?.name || `#${id}`), ...row.eligibleCategories.map((c) => `${c} (category)`)].join(', ') },
              { key: 'rule', label: 'Rule', render: (row) => `${row.requiredVisits} paid → ${row.rewardLabel}` },
              { key: 'dates', label: 'Dates', render: (row) => `${fmt(row.startDate)}${row.endDate ? ` → ${fmt(row.endDate)}` : ''}` },
              { key: 'active', label: 'Status', render: (row) => <StatusBadge status={row.isActive ? 'ACTIVE' : 'CLOSED'} label={row.isActive ? 'Active' : 'Inactive'} tone={row.isActive ? 'inflow' : 'neutral'} /> },
              { key: 'edit', label: '', render: (row) => <button type="button" onClick={() => setEditing(row)} className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 hover:underline"><Pencil className="h-3.5 w-3.5" />Edit</button> },
            ]} />
          ) : null}

          {tab === 'customers' ? (
            <>
              <label className="relative block w-full sm:w-72">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" aria-hidden="true" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or phone" aria-label="Search loyalty customers" className="h-9 w-full rounded-lg border border-stone-200 bg-white pl-8 pr-2 text-sm" />
              </label>
              <FinancialTable caption="Loyalty customers" rows={customers} rowKey={(row) => `${row.customerId}-${row.programId}`} empty="No loyalty activity yet." columns={customerColumns} />
            </>
          ) : null}

          {tab === 'rewards' ? (
            <FinancialTable caption="Outstanding rewards" rows={customers.filter((row) => row.available > 0)} rowKey={(row) => `${row.customerId}-${row.programId}`} empty="No rewards waiting to be used." columns={customerColumns} />
          ) : null}

          {tab === 'transactions' ? (
            <FinancialTable caption="Loyalty ledger" rows={data.transactions} empty="No loyalty entries yet." columns={[
              { key: 'at', label: 'When', render: (row) => fmtDateTime(row.at) },
              { key: 'who', label: 'Customer', render: (row) => <Link href={`/admin/customers/${row.customerId}`} className="hover:underline">{row.customerName}</Link> },
              { key: 'program', label: 'Program', render: (row) => row.programName },
              { key: 'type', label: 'Type', render: (row) => (row.type === 'REVERSAL' ? `Reversal of ${TYPE_LABEL[row.reversedType]?.toLowerCase() || 'entry'}` : TYPE_LABEL[row.type]) },
              { key: 'visits', label: 'Visits', align: 'right', render: (row) => <span className={row.visits > 0 ? 'text-emerald-700' : 'text-rose-700'}>{row.visits > 0 ? `+${row.visits}` : row.visits}</span> },
              { key: 'bill', label: 'Bill / service', render: (row) => (row.billId ? <span><BillLink billId={row.billId} number={row.billNumber} />{row.itemName ? ` · ${row.itemName}` : ''}</span> : row.itemName || '—') },
              { key: 'ba', label: 'Before → after', render: (row) => (row.balanceBefore !== null && row.balanceBefore !== undefined ? `${row.balanceBefore} → ${row.balanceAfter}` : '—') },
              { key: 'note', label: 'Note / by', render: (row) => [row.note, row.by].filter(Boolean).join(' · ') || row.source.toLowerCase() },
            ]} />
          ) : null}

          {tab === 'settings' ? (
            <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-700">
              <p className="flex items-center gap-2 font-semibold text-stone-900"><SlidersHorizontal className="h-4 w-4" />How loyalty works here</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>A stamp is earned for each eligible service on a <b>fully paid</b> bill for an identified customer — once per bill line. Credit bills and voided bills do not earn.</li>
                <li>Walk-in bills print a one-time code ({data.settings.claimCodesEnabled ? `on, valid ${data.settings.claimCodeValidDays} days` : 'off'}) the customer can enter on the Review &amp; Rewards page.</li>
                <li>Scanning the QR never earns anything. Reviews never affect rewards.</li>
                <li>A reward is applied by the cashier at the POS and shows on the bill as a loyalty discount — never as a payment.</li>
                <li>Voiding a bill reverses its stamps; voiding a reward bill gives the reward back.</li>
              </ul>
              <Link href="/admin/crm/reviews?tab=settings" className="inline-flex items-center gap-1 font-semibold text-rose-700 hover:underline"><Gift className="h-4 w-4" />Review &amp; Rewards page and QR settings</Link>
            </div>
          ) : null}
        </div>
      ) : null}

      {editing ? <ProgramEditor initial={editing.id ? editing : null} services={services} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} /> : null}
      {adjust ? (
        <Modal title={`Adjust visits · ${adjust.name}`} subtitle={`${adjust.programName} · now ${adjust.balance} visit(s)`} onClose={() => setAdjust(null)}
          footer={<><ErpButton onClick={() => setAdjust(null)}>Cancel</ErpButton><ErpButton variant="primary" disabled={!Number(adjust.visits) || !adjust.reason.trim()} onClick={saveAdjust}>Save adjustment</ErpButton></>}>
          <label className={LABEL}>Visits to add (+) or remove (−)<input type="number" step="1" className={FIELD} value={adjust.visits} onChange={(event) => setAdjust({ ...adjust, visits: event.target.value })} /></label>
          <label className={LABEL}>Reason (required, audited)<input className={FIELD} value={adjust.reason} onChange={(event) => setAdjust({ ...adjust, reason: event.target.value })} placeholder="e.g. Stamp missed on 12 Sep bill" /></label>
          <p className="text-xs text-stone-500">After: {adjust.balance + (Number(adjust.visits) || 0)} visit(s).</p>
          {actionError ? <AlertBanner tone="outflow">{actionError}</AlertBanner> : null}
        </Modal>
      ) : null}
    </ErpPage>
  );
}
