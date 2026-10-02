'use client';

/**
 * FEEDBACK FORMS — a small form builder: star rating, text, single / multiple choice, yes / no.
 * One active form is the default for the QR page; a form can target specific services.
 */

import { fmtDate } from '@/lib/dates/display';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, ClipboardPen, Plus, Trash2 } from 'lucide-react';
import { AlertBanner, ErpButton, ErpPage, ErrorState, FinancialTable, LoadingState, PageHeader, StatusBadge } from '@/components/erp';
import { erpFetch, useReport } from '@/components/erp/use-report';
import { FIELD, LABEL, Modal } from '@/components/hrm/ui';

const TYPES = [['STAR', 'Star rating'], ['TEXT', 'Text'], ['SINGLE', 'Single choice'], ['MULTI', 'Multiple choice'], ['YES_NO', 'Yes / No']];
const DEFAULT_QUESTIONS = [
  { type: 'STAR', label: 'Service quality' }, { type: 'STAR', label: 'Staff experience' }, { type: 'STAR', label: 'Cleanliness' }, { type: 'STAR', label: 'Value for money' },
];

function FormEditor({ initial, services, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    name: '', description: '', status: 'DRAFT', isDefault: false, applicableServiceIds: [], ratingEnabled: true, reviewTextEnabled: true,
    staffFeedbackEnabled: false, serviceFeedbackEnabled: true, publicConsentEnabled: true, questions: DEFAULT_QUESTIONS, ...initial,
  }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const setQuestion = (index, patch) => set('questions', form.questions.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  const move = (index, delta) => {
    const next = [...form.questions];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    set('questions', next);
  };
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await erpFetch('/api/crm/reviews', { method: 'POST', body: { action: 'form', ...form, id: initial?.id, questions: form.questions.map((q) => ({ ...q, options: typeof q.optionsText === 'string' ? q.optionsText.split(',').map((o) => o.trim()).filter(Boolean) : q.options })) } });
      onSaved();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const flag = (key, label) => <label className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" checked={Boolean(form[key])} onChange={(event) => set(key, event.target.checked)} />{label}</label>;
  return (
    <Modal wide title={initial?.id ? `Edit ${initial.name}` : 'New feedback form'} subtitle="Keep it short — customers answer on their phone." onClose={onClose}
      footer={<><ErpButton onClick={onClose} disabled={busy}>Cancel</ErpButton><ErpButton variant="primary" onClick={save} disabled={busy || !form.name.trim()}>{busy ? 'Saving…' : 'Save form'}</ErpButton></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>Form name<input className={FIELD} value={form.name} onChange={(event) => set('name', event.target.value)} placeholder="Haircut Feedback" /></label>
        <label className={LABEL}>Status
          <select className={FIELD} value={form.status} onChange={(event) => set('status', event.target.value)}>
            <option value="DRAFT">Draft</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
          </select>
        </label>
      </div>
      <label className={LABEL}>Description<input className={FIELD} value={form.description || ''} onChange={(event) => set('description', event.target.value)} /></label>
      <div className="grid gap-2 sm:grid-cols-2">
        {flag('ratingEnabled', 'Overall star rating')}
        {flag('reviewTextEnabled', 'Written review')}
        {flag('serviceFeedbackEnabled', 'Linked to the service')}
        {flag('staffFeedbackEnabled', 'Linked to the staff member')}
        {flag('publicConsentEnabled', 'Ask permission to publish')}
        {flag('isDefault', 'Default form for the QR page')}
      </div>
      <fieldset>
        <legend className={LABEL}>Only for these services (optional)</legend>
        <div className="mt-1 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
          {services.map((service) => {
            const on = form.applicableServiceIds.includes(service.id);
            return <button key={service.id} type="button" aria-pressed={on} onClick={() => set('applicableServiceIds', on ? form.applicableServiceIds.filter((id) => id !== service.id) : [...form.applicableServiceIds, service.id])} className={`rounded-full border px-3 py-1 text-xs font-semibold ${on ? 'border-pink-300 bg-pink-100' : 'border-stone-200'} text-pink-900`}>{service.name}</button>;
          })}
        </div>
      </fieldset>
      <div className="space-y-2">
        <p className={LABEL}>Questions ({form.questions.length}/12)</p>
        {form.questions.map((question, index) => (
          <div key={index} className="grid gap-2 rounded-lg border border-stone-200 p-2 sm:grid-cols-[9rem_1fr_auto] sm:items-center">
            <select aria-label={`Question ${index + 1} type`} className="h-10 rounded-lg border border-stone-300 bg-white px-2 text-sm" value={question.type} onChange={(event) => setQuestion(index, { type: event.target.value })}>
              {TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input aria-label={`Question ${index + 1}`} className="h-10 min-w-0 rounded-lg border border-stone-300 px-3 text-sm" value={question.label} onChange={(event) => setQuestion(index, { label: event.target.value })} />
            <div className="flex items-center gap-1">
              <label className="flex items-center gap-1 text-xs text-stone-600"><input type="checkbox" checked={Boolean(question.required)} onChange={(event) => setQuestion(index, { required: event.target.checked })} />Required</label>
              <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)} className="rounded p-1.5 text-stone-500 hover:bg-stone-100 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
              <button type="button" aria-label="Move down" disabled={index === form.questions.length - 1} onClick={() => move(index, 1)} className="rounded p-1.5 text-stone-500 hover:bg-stone-100 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
              <button type="button" aria-label="Remove question" onClick={() => set('questions', form.questions.filter((_, i) => i !== index))} className="rounded p-1.5 text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
            </div>
            {['SINGLE', 'MULTI'].includes(question.type) ? (
              <input aria-label="Choices" className="h-10 rounded-lg border border-stone-300 px-3 text-sm sm:col-span-3" placeholder="Choices, separated by commas"
                value={question.optionsText ?? (question.options || []).join(', ')} onChange={(event) => setQuestion(index, { optionsText: event.target.value })} />
            ) : null}
          </div>
        ))}
        {form.questions.length < 12 ? <ErpButton icon={Plus} onClick={() => set('questions', [...form.questions, { type: 'STAR', label: '' }])}>Add question</ErpButton> : null}
      </div>
      {error ? <AlertBanner tone="outflow">{error}</AlertBanner> : null}
    </Modal>
  );
}

export default function FeedbackFormsPage() {
  const { data, error, loading, reload } = useReport('/api/crm/reviews?view=forms');
  const [services, setServices] = useState([]);
  const [editing, setEditing] = useState(null);
  useEffect(() => { erpFetch('/api/admin/services').then((d) => setServices(d.services || [])).catch(() => {}); }, []);
  return (
    <ErpPage>
      <PageHeader icon={ClipboardPen} iconTone="crm" title="Feedback Forms" subtitle="Choose exactly what customers answer. The starter form is yours to edit."
        actions={(
          <>
            <Link href="/admin/crm/reviews" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"><ArrowLeft className="h-4 w-4" />Reviews</Link>
            <ErpButton icon={Plus} variant="primary" onClick={() => setEditing({})}>New Form</ErpButton>
          </>
        )} />
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {loading && !data ? <LoadingState /> : null}
      {data ? (
        <div className="space-y-4">
          {data.forms.find((form) => form.isDefault) ? (
            <AlertBanner tone="inflow" title={`${data.forms.find((form) => form.isDefault).name} is the customer default`} action={<ErpButton onClick={() => setEditing(data.forms.find((form) => form.isDefault))}>Edit questions</ErpButton>}>
              Customers see this form unless an active service-specific form matches their visit. You can change its questions, wording and publishing consent at any time.
            </AlertBanner>
          ) : <AlertBanner tone="cash" title="Choose a default form">Create or edit an active form and mark it as default so the QR page knows what to show.</AlertBanner>}
          <section className="rounded-xl border border-stone-200 bg-white px-4 py-3">
            <div className="grid gap-3 text-sm text-stone-600 md:grid-cols-3">
              <p><b className="block text-stone-900">Default form</b>Used for every visit unless a service-specific form applies.</p>
              <p><b className="block text-stone-900">Service-specific forms</b>Ask different questions for haircuts, colour, spa or any chosen services.</p>
              <p><b className="block text-stone-900">Draft before launch</b>Keep a form in Draft while editing, then activate it when ready.</p>
            </div>
          </section>
          <FinancialTable caption="Feedback forms" rows={data.forms} empty="No forms yet. Create your first form to start collecting feedback." columns={[
            { key: 'name', label: 'Form', render: (row) => <span className="font-semibold">{row.name}{row.isDefault ? <span className="ml-2 rounded bg-pink-100 px-1.5 py-0.5 text-xs font-bold text-pink-800">DEFAULT</span> : null}</span> },
            { key: 'questions', label: 'Questions', align: 'right', render: (row) => row.questions.length },
            { key: 'services', label: 'Shown for', render: (row) => (row.applicableServiceIds.length ? row.applicableServiceIds.map((id) => services.find((s) => s.id === id)?.name || `#${id}`).join(', ') : 'All services') },
            { key: 'flags', label: 'Collects', render: (row) => [row.ratingEnabled && 'rating', row.reviewTextEnabled && 'written review', row.staffFeedbackEnabled && 'staff feedback', row.publicConsentEnabled && 'publish consent'].filter(Boolean).join(', ') },
            { key: 'responses', label: 'Responses', align: 'right', render: (row) => row.responses },
            { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} label={row.status.charAt(0) + row.status.slice(1).toLowerCase()} tone={row.status === 'ACTIVE' ? 'inflow' : 'neutral'} /> },
            { key: 'updated', label: 'Updated', render: (row) => fmtDate(row.updatedAt) },
            { key: 'edit', label: '', render: (row) => <button type="button" onClick={() => setEditing(row)} className="inline-flex min-h-9 items-center rounded-lg px-2 text-xs font-bold text-pink-700 hover:bg-pink-50">Edit form</button> },
          ]} />
        </div>
      ) : null}
      {editing ? <FormEditor initial={editing.id ? editing : null} services={services} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} /> : null}
    </ErpPage>
  );
}
