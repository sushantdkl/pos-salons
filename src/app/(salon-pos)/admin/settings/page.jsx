'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Building2, CalendarDays, CreditCard, ExternalLink, ImagePlus, Loader2, Percent, Printer, Save, ShieldCheck, X } from 'lucide-react';
import { PHONE_ERROR_MESSAGE, isValidPhone, sanitizePhoneInput } from '@/lib/validation/phone';
import { formatUploadLimit, getUploadRule, validateImageFileForFolder } from '@/lib/uploads/upload-rules';

const emptySalon = {
  salon_name: '', salon_address: '', salon_phone: '', salon_email: '', owner_name: '', vat_number: '',
  vat_percentage: '', service_charge_percentage: '', receipt_footer: 'Thank you for visiting.',
  esewa_phonepay_qr_url: '', bank_qr_url: '', esewa_phonepay_label: 'Esewa / PhonePay QR', bank_label: 'Bank QR',
  bank_name: '', bank_account_name: '', bank_account_number: '', show_esewa_phonepay_qr: true, show_bank_qr: true,
  calendar_system: 'AD', receipt_paper_size: '80', receipt_title: 'Customer Receipt', receipt_show_customer: true,
  receipt_show_stylist: true, receipt_show_payment: true, receipt_show_tax: true, receipt_show_discount: true,
  advance_ceiling_percent: '',
};

// Only the fields this page edits are saved. Other screens own the rest (Printer & Documents:
// receipt_*; Appointment settings: opening hours, slots) and must not be sent back from here.
const SAVE_KEYS = Object.keys(emptySalon).filter((key) => !key.startsWith('receipt_'));

const sections = [
  { id: 'business', label: 'Business', icon: Building2 },
  { id: 'billing', label: 'Billing & Tax', icon: Percent },
  { id: 'calendar', label: 'Calendar & Payroll', icon: CalendarDays },
  { id: 'payments', label: 'Payments & QR', icon: CreditCard },
  { id: 'access', label: 'Account & Access', icon: ShieldCheck },
];

export default function SettingsPage() {
  const [form, setForm] = useState(emptySalon);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [activeSection, setActiveSection] = useState('business');
  const authHeaders = (json = false) => ({ ...(json ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

  useEffect(() => {
    fetch('/api/admin/settings', { headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` } })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Unable to load settings');
        const settings = body.settings || {};
        setForm((current) => ({
          ...current, ...settings,
          vat_percentage: settings.vat_percentage === 0 || settings.vat_percentage ? String(settings.vat_percentage) : '',
          service_charge_percentage: settings.service_charge_percentage === 0 || settings.service_charge_percentage ? String(settings.service_charge_percentage) : '',
          show_esewa_phonepay_qr: settings.show_esewa_phonepay_qr !== 'false', show_bank_qr: settings.show_bank_qr !== 'false',
          receipt_show_customer: settings.receipt_show_customer !== 'false', receipt_show_stylist: settings.receipt_show_stylist !== 'false',
          receipt_show_payment: settings.receipt_show_payment !== 'false', receipt_show_tax: settings.receipt_show_tax !== 'false',
          receipt_show_discount: settings.receipt_show_discount !== 'false', advance_ceiling_percent: settings.advance_ceiling_percent || '',
        }));
      })
      .catch((error) => setMessage(error.message || 'Unable to load settings'))
      .finally(() => setLoading(false));
  }, []);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const uploadQrImage = async (field, file) => {
    if (!file) return;
    const validationError = validateImageFileForFolder(file, 'payment-qr');
    if (validationError) return setMessage(validationError);
    if (form.salon_phone && !isValidPhone(form.salon_phone)) return setMessage(PHONE_ERROR_MESSAGE);
    setSaving(true); setMessage('');
    try {
      const body = new FormData(); body.append('folder', 'payment-qr'); body.append('file', file);
      const response = await fetch('/api/admin/website-cms/upload', { method: 'POST', headers: authHeaders(), body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not upload QR image');
      update(field, result.imageUrl); setMessage('QR image uploaded. Save settings to publish it in billing.');
    } catch (error) { setMessage(error.message || 'Could not upload QR image.'); }
    finally { setSaving(false); }
  };

  const saveSettings = async (event) => {
    event.preventDefault(); setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/admin/settings', { method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ ...Object.fromEntries(SAVE_KEYS.map((key) => [key, form[key]])), vat_percentage: Number(form.vat_percentage || 0), service_charge_percentage: Number(form.service_charge_percentage || 0) }) });
      const result = await response.json(); setMessage(response.ok ? 'Settings saved.' : result.error || 'Could not save settings.');
    } catch { setMessage('Connection error. Please try again.'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#F7F5F2]"><Loader2 className="h-8 w-8 animate-spin text-[#5433C9]" /></div>;
  const inputClass = 'min-h-11 w-full rounded-xl border border-[#D8D1C8] bg-white px-3.5 text-sm text-[#241F1A] outline-none focus:border-[#6B46E5] focus:ring-2 focus:ring-[#6B46E5]/15';

  return (
    <main className="min-h-screen bg-[#F7F5F2]">
      <header className="border-b border-[#E8E2DB] bg-white px-4 py-5 sm:px-8"><div className="mx-auto max-w-[1320px]"><h1 className="text-2xl font-extrabold tracking-[-0.025em] text-[#17140F] sm:text-3xl">Configuration Center</h1><p className="mt-1 text-sm text-[#6B625A]">Change salon-wide behavior from one organized workspace.</p></div></header>
      <div className="mx-auto max-w-[1320px] px-4 py-6 sm:px-8">
        {message ? <div role="status" className="mb-5 rounded-[12px] bg-white px-4 py-3 text-sm font-semibold text-[#332E29] shadow-[0_2px_12px_rgba(42,34,28,0.06)]">{message}</div> : null}
        <form onSubmit={saveSettings} className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-24 lg:self-start"><nav aria-label="Settings sections" className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
            {sections.map((section) => <button key={section.id} type="button" onClick={() => setActiveSection(section.id)} aria-current={activeSection === section.id ? 'page' : undefined} className={`flex min-h-11 shrink-0 items-center gap-3 rounded-[11px] px-3.5 text-left text-sm font-semibold transition-colors ${activeSection === section.id ? 'bg-[#171E2D] text-white' : 'text-[#4D463F] hover:bg-white'}`}><section.icon className="h-[18px] w-[18px]" />{section.label}</button>)}
            <Link href="/admin/printer" className="flex min-h-11 shrink-0 items-center gap-3 rounded-[11px] px-3.5 text-sm font-semibold text-[#4D463F] hover:bg-white"><Printer className="h-[18px] w-[18px]" />Printer & Documents<ExternalLink className="ml-auto hidden h-3.5 w-3.5 lg:block" /></Link>
          </nav></aside>
          <div className="min-w-0"><section className="rounded-[14px] bg-white p-5 shadow-[0_2px_14px_rgba(42,34,28,0.06)] sm:p-7">
            {activeSection === 'business' ? <Panel title="Business information" description="Used on receipts and other customer-facing salon documents."><div className="grid gap-4 md:grid-cols-2"><Field label="Salon name"><input value={form.salon_name} onChange={(e) => update('salon_name', e.target.value)} className={inputClass} /></Field><Field label="Owner name"><input value={form.owner_name} onChange={(e) => update('owner_name', e.target.value)} className={inputClass} /></Field><Field label="Phone"><input value={form.salon_phone} onChange={(e) => update('salon_phone', sanitizePhoneInput(e.target.value))} className={inputClass} /></Field><Field label="Email"><input type="email" value={form.salon_email} onChange={(e) => update('salon_email', e.target.value)} className={inputClass} /></Field><Field label="Address" wide><textarea rows={3} value={form.salon_address} onChange={(e) => update('salon_address', e.target.value)} className={`${inputClass} py-3`} /></Field></div></Panel> : null}
            {activeSection === 'billing' ? <Panel title="Billing & tax" description="Defaults used by billing. Saved invoice snapshots remain unchanged."><div className="grid gap-4 md:grid-cols-2"><Field label="Tax / VAT percentage"><input type="number" min="0" max="100" step="0.1" value={form.vat_percentage} onChange={(e) => update('vat_percentage', e.target.value)} className={inputClass} /></Field><Field label="Service charge percentage"><input type="number" min="0" max="100" step="0.1" value={form.service_charge_percentage} onChange={(e) => update('service_charge_percentage', e.target.value)} className={inputClass} /></Field><Field label="VAT / PAN number"><input value={form.vat_number} onChange={(e) => update('vat_number', e.target.value)} className={inputClass} /></Field></div><div className="mt-6 rounded-[12px] bg-[#F2F0FF] p-4 text-sm text-[#454069]">Receipt wording, credit statements and Review QR sheets are managed in <Link href="/admin/printer" className="font-bold underline underline-offset-2">Printer & Documents</Link>.</div></Panel> : null}
            {activeSection === 'calendar' ? <Panel title="Calendar & payroll policy" description="Calendar changes presentation; database dates remain canonical AD."><div className="grid gap-5 md:grid-cols-2"><Field label="Display calendar"><div className="grid grid-cols-2 gap-2">{[['BS','Nepali calendar'],['AD','English calendar']].map(([value, label]) => <button key={value} type="button" onClick={() => update('calendar_system', value)} className={`min-h-16 rounded-xl border px-4 text-left ${form.calendar_system === value ? 'border-[#171E2D] bg-[#171E2D] text-white' : 'border-[#D8D1C8]'}`}><strong className="block">{value}</strong><span className="text-xs opacity-75">{label}</span></button>)}</div><span className="mt-2 block text-xs text-[#746C64]">Reports follow the selected calendar’s true month and year boundaries.</span></Field><Field label="Maximum advance per payroll period (%)"><input type="number" min="1" max="100" step="0.01" value={form.advance_ceiling_percent} onChange={(e) => update('advance_ceiling_percent', e.target.value)} placeholder="Set an approved ceiling" className={inputClass} /><span className="mt-2 block text-xs text-[#746C64]">Applied cumulatively so smaller advances cannot bypass the limit.</span></Field></div></Panel> : null}
            {activeSection === 'payments' ? <Panel title="Payments & QR" description="QR images shown during Online and split payments."><div className="grid gap-5 xl:grid-cols-2"><QrSettingsCard title="Esewa / PhonePay QR" imageUrl={form.esewa_phonepay_qr_url} label={form.esewa_phonepay_label} enabled={form.show_esewa_phonepay_qr} onUpload={(file) => uploadQrImage('esewa_phonepay_qr_url', file)} onRemove={() => update('esewa_phonepay_qr_url', '')} onLabel={(value) => update('esewa_phonepay_label', value)} onToggle={(value) => update('show_esewa_phonepay_qr', value)} /><QrSettingsCard title="Bank QR" imageUrl={form.bank_qr_url} label={form.bank_label} enabled={form.show_bank_qr} onUpload={(file) => uploadQrImage('bank_qr_url', file)} onRemove={() => update('bank_qr_url', '')} onLabel={(value) => update('bank_label', value)} onToggle={(value) => update('show_bank_qr', value)}><div className="grid gap-3"><input aria-label="Bank name" value={form.bank_name} onChange={(e) => update('bank_name', e.target.value)} placeholder="Bank name" className={inputClass} /><input aria-label="Bank account name" value={form.bank_account_name} onChange={(e) => update('bank_account_name', e.target.value)} placeholder="Account name" className={inputClass} /><input aria-label="Bank account number" value={form.bank_account_number} onChange={(e) => update('bank_account_number', e.target.value)} placeholder="Account number" className={inputClass} /></div></QrSettingsCard></div></Panel> : null}
            {activeSection === 'access' ? <Panel title="Account & access" description="Manage what each salon role can see and do."><div className="rounded-[12px] bg-[#F8F6F2] p-5"><ShieldCheck className="h-7 w-7 text-[#5433C9]" /><h3 className="mt-4 font-bold text-[#17140F]">Staff permissions</h3><p className="mt-1 max-w-xl text-sm text-[#6B625A]">Allow or block capabilities for Cashier, Stylist, Barber, and Beautician. Admin retains full access.</p><Link href="/admin/permissions" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#171E2D] px-4 text-sm font-bold text-white">Open Staff Permissions<ExternalLink className="h-4 w-4" /></Link></div></Panel> : null}
          </section>{activeSection !== 'access' ? <div className="mt-5 flex justify-end"><button disabled={saving} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#171E2D] px-5 text-sm font-bold text-white shadow-[0_4px_12px_rgba(23,30,45,0.18)] hover:bg-[#272F40] disabled:opacity-60 sm:w-auto">{saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}Save settings</button></div> : null}</div>
        </form>
      </div>
    </main>
  );
}

function Panel({ title, description, children }) { return <><div className="mb-6"><h2 className="text-lg font-bold text-[#17140F]">{title}</h2><p className="mt-1 text-sm text-[#746C64]">{description}</p></div>{children}</>; }
function Field({ label, wide = false, children }) { return <label className={wide ? 'md:col-span-2' : ''}><span className="mb-1.5 block text-sm font-semibold text-[#332E29]">{label}</span>{children}</label>; }

function QrSettingsCard({ title, imageUrl, label, enabled, onUpload, onRemove, onLabel, onToggle, children }) {
  return <div className="rounded-[12px] bg-[#F8F6F2] p-4"><div className="mb-3 flex items-start justify-between gap-3"><div><h3 className="font-bold text-[#17140F]">{title}</h3><p className="text-xs text-[#746C64]">PNG, JPG, or WebP. Max {formatUploadLimit(getUploadRule('payment-qr')?.maxSize || 0)}.</p></div><button type="button" aria-label={`${enabled ? 'Hide' : 'Show'} ${title}`} aria-pressed={enabled} onClick={() => onToggle(!enabled)} className={`min-h-11 rounded-full px-3 text-xs font-bold ${enabled ? 'bg-[#DDF7EA] text-[#11613E]' : 'bg-[#E9E6E1] text-[#6B625A]'}`}>{enabled ? 'Shown' : 'Hidden'}</button></div><div className="grid gap-3">{imageUrl ? <div className="flex flex-wrap items-center gap-4"><div className="relative h-28 w-28 overflow-hidden rounded-[10px] bg-white"><Image src={imageUrl} alt={title} fill sizes="112px" className="object-contain p-2" unoptimized /></div><button type="button" onClick={onRemove} className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-[#E8C9C4] bg-white px-3 text-sm font-bold text-[#9C352B]"><X className="h-4 w-4" />Remove</button></div> : <div className="flex h-28 items-center justify-center rounded-[10px] border border-dashed border-[#CFC7BE] bg-white text-sm font-semibold text-[#746C64]">No QR uploaded</div>}<label className="inline-flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-[10px] bg-[#171E2D] px-4 text-sm font-bold text-white"><ImagePlus className="h-4 w-4" />{imageUrl ? 'Replace QR' : 'Upload QR'}<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => onUpload(event.target.files?.[0])} /></label><input aria-label={`${title} display label`} value={label} onChange={(event) => onLabel(event.target.value)} placeholder="Display label" className="min-h-11 w-full rounded-xl border border-[#D8D1C8] bg-white px-3.5 text-sm" />{children}</div></div>;
}
