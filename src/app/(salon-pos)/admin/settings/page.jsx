'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { CreditCard, ImagePlus, Loader2, Receipt, Save, Settings, Store, X } from 'lucide-react';
import { PHONE_ERROR_MESSAGE, isValidPhone, sanitizePhoneInput } from '@/lib/validation/phone';

const emptySalon = {
  salon_name: '',
  salon_address: '',
  salon_phone: '',
  salon_email: '',
  owner_name: '',
  vat_number: '',
  vat_percentage: 0,
  service_charge_percentage: 0,
  receipt_footer: 'Thank you for visiting.',
  esewa_phonepay_qr_url: '',
  bank_qr_url: '',
  esewa_phonepay_label: 'Esewa / PhonePay QR',
  bank_label: 'Bank QR',
  bank_name: '',
  bank_account_name: '',
  bank_account_number: '',
  show_esewa_phonepay_qr: true,
  show_bank_qr: true,
};

export default function SettingsPage() {
  const [form, setForm] = useState(emptySalon);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const headers = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('pos_token')}`
  });

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/admin/settings', {
        headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` }
      });
      if (response.ok) {
        const data = await response.json();
        const settings = data.settings || {};
        setForm({
          salon_name: settings.salon_name || 'The Hair Cut',
          salon_address: settings.salon_address || '',
          salon_phone: settings.salon_phone || '',
          salon_email: settings.salon_email || '',
          owner_name: settings.owner_name || '',
          vat_number: settings.vat_number || '',
          vat_percentage: Number(settings.vat_percentage || 0),
          service_charge_percentage: Number(settings.service_charge_percentage || 0),
          receipt_footer: settings.receipt_footer || 'Thank you for visiting.',
          esewa_phonepay_qr_url: settings.esewa_phonepay_qr_url || settings.esewa_qr_image || '',
          bank_qr_url: settings.bank_qr_url || settings.bank_qr_image || '',
          esewa_phonepay_label: settings.esewa_phonepay_label || 'Esewa / PhonePay QR',
          bank_label: settings.bank_label || 'Bank QR',
          bank_name: settings.bank_name || '',
          bank_account_name: settings.bank_account_name || '',
          bank_account_number: settings.bank_account_number || '',
          show_esewa_phonepay_qr: settings.show_esewa_phonepay_qr !== 'false',
          show_bank_qr: settings.show_bank_qr !== 'false',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const uploadQrImage = async (field, file) => {
    if (!file) return;
    setSaving(true);
    setMessage('');
    if (form.salon_phone && !isValidPhone(form.salon_phone)) {
      setMessage(PHONE_ERROR_MESSAGE);
      setSaving(false);
      return;
    }
    try {
      const formData = new FormData();
      formData.append('folder', 'payment-qr');
      formData.append('file', file);
      const response = await fetch('/api/admin/website-cms/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` },
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not upload QR image');
      setForm((current) => ({ ...current, [field]: data.imageUrl }));
      setMessage('QR image uploaded. Save settings to publish it in billing.');
    } catch (error) {
      setMessage(error.message || 'Could not upload QR image.');
    } finally {
      setSaving(false);
    }
  };

  const saveSettings = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({
          ...form,
          salon_name: form.salon_name,
          salon_address: form.salon_address,
          salon_phone: form.salon_phone,
          salon_email: form.salon_email
        })
      });
      const data = await response.json();
      setMessage(response.ok ? 'Settings saved.' : data.error || 'Could not save settings.');
    } catch {
      setMessage('Connection error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <Loader2 className="h-8 w-8 animate-spin text-gray-900" />
        </div>
    );
  }

  return (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6">
            <h1 className="text-3xl font-semibold text-gray-950">Settings</h1>
            <p className="mt-1 text-sm text-gray-600">Salon details, receipt defaults, and payment preferences.</p>
          </div>

          {message && (
            <div className="mb-5 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-800">
              {message}
            </div>
          )}

          <form onSubmit={saveSettings} className="space-y-5">
            <section className="rounded-lg border border-gray-200 bg-white p-6">
              <div className="mb-5 flex items-center gap-2">
                <Store className="h-5 w-5 text-gray-700" />
                <h2 className="text-lg font-semibold text-gray-950">Salon Information</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-900">Salon name</span>
                  <input value={form.salon_name} onChange={(e) => setForm({ ...form, salon_name: e.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-900">Owner name</span>
                  <input value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-900">Phone</span>
                  <input value={form.salon_phone} onChange={(e) => setForm({ ...form, salon_phone: sanitizePhoneInput(e.target.value) })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-900">Email</span>
                  <input type="email" value={form.salon_email} onChange={(e) => setForm({ ...form, salon_email: e.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950" />
                </label>
                <label className="block md:col-span-2">
                  <span className="mb-2 block text-sm font-medium text-gray-900">Address</span>
                  <textarea rows={2} value={form.salon_address} onChange={(e) => setForm({ ...form, salon_address: e.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950" />
                </label>
              </div>
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-6">
              <div className="mb-5 flex items-center gap-2">
                <Receipt className="h-5 w-5 text-gray-700" />
                <h2 className="text-lg font-semibold text-gray-950">Receipt & Billing</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-900">Tax %</span>
                  <input type="number" min="0" max="100" step="0.1" value={form.vat_percentage} onChange={(e) => setForm({ ...form, vat_percentage: Number(e.target.value) })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-900">Service charge %</span>
                  <input type="number" min="0" max="100" step="0.1" value={form.service_charge_percentage} onChange={(e) => setForm({ ...form, service_charge_percentage: Number(e.target.value) })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-900">VAT/PAN</span>
                  <input value={form.vat_number} onChange={(e) => setForm({ ...form, vat_number: e.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950" />
                </label>
                <label className="block md:col-span-3">
                  <span className="mb-2 block text-sm font-medium text-gray-900">Receipt footer</span>
                  <textarea rows={2} value={form.receipt_footer} onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950" />
                </label>
              </div>
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-6">
              <div className="mb-3 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-gray-700" />
                <h2 className="text-lg font-semibold text-gray-950">Payment Methods</h2>
              </div>
              <p className="mb-5 text-sm text-gray-600">Cash, card, online, and split payments are available in billing. Online QR images are shown to Admin and Cashier during billing.</p>
              <div className="grid gap-5 lg:grid-cols-2">
                <QrSettingsCard
                  title="Esewa / PhonePay QR"
                  imageUrl={form.esewa_phonepay_qr_url}
                  label={form.esewa_phonepay_label}
                  enabled={form.show_esewa_phonepay_qr}
                  onUpload={(file) => uploadQrImage('esewa_phonepay_qr_url', file)}
                  onRemove={() => setForm({ ...form, esewa_phonepay_qr_url: '' })}
                  onLabel={(value) => setForm({ ...form, esewa_phonepay_label: value })}
                  onToggle={(value) => setForm({ ...form, show_esewa_phonepay_qr: value })}
                />
                <QrSettingsCard
                  title="Bank QR"
                  imageUrl={form.bank_qr_url}
                  label={form.bank_label}
                  enabled={form.show_bank_qr}
                  onUpload={(file) => uploadQrImage('bank_qr_url', file)}
                  onRemove={() => setForm({ ...form, bank_qr_url: '' })}
                  onLabel={(value) => setForm({ ...form, bank_label: value })}
                  onToggle={(value) => setForm({ ...form, show_bank_qr: value })}
                >
                  <div className="grid gap-3">
                    <input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} placeholder="Bank name" className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950" />
                    <input value={form.bank_account_name} onChange={(e) => setForm({ ...form, bank_account_name: e.target.value })} placeholder="Account name" className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950" />
                    <input value={form.bank_account_number} onChange={(e) => setForm({ ...form, bank_account_number: e.target.value })} placeholder="Account number" className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950" />
                  </div>
                </QrSettingsCard>
              </div>
            </section>

            <button disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gray-950 px-5 py-3 font-semibold text-white hover:bg-gray-800 disabled:opacity-60 sm:w-auto">
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              Save Settings
            </button>
          </form>

          <div className="mt-6 rounded-lg bg-gray-100 p-5">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Settings className="h-4 w-4" />
              Environment
            </div>
            <p className="text-xs text-gray-600">License checks are controlled by <code>NEXT_PUBLIC_LICENSE_ENABLED</code>. Set it to <code>false</code> for local testing.</p>
          </div>
        </div>
      </div>
  );
}

function QrSettingsCard({ title, imageUrl, label, enabled, onUpload, onRemove, onLabel, onToggle, children }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-950">{title}</h3>
          <p className="text-xs text-gray-500">Upload PNG, JPG, or WebP QR image.</p>
        </div>
        <button
          type="button"
          onClick={() => onToggle(!enabled)}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${enabled ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'}`}
        >
          {enabled ? 'Shown' : 'Hidden'}
        </button>
      </div>
      <div className="grid gap-3">
        {imageUrl ? (
          <div className="flex items-center gap-4">
            <div className="relative h-32 w-32 overflow-hidden rounded-lg border border-gray-200 bg-white">
              <Image src={imageUrl} alt={title} fill sizes="128px" className="object-contain p-2" unoptimized />
            </div>
            <button type="button" onClick={onRemove} className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700">
              <X className="h-4 w-4" /> Remove Image
            </button>
          </div>
        ) : (
          <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white text-sm font-semibold text-gray-500">
            No QR uploaded
          </div>
        )}
        <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg bg-gray-950 px-4 py-2 text-sm font-semibold text-white">
          <ImagePlus className="h-4 w-4" /> {imageUrl ? 'Replace QR' : 'Upload QR'}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => onUpload(event.target.files?.[0])} />
        </label>
        <input value={label} onChange={(e) => onLabel(e.target.value)} placeholder="Display label" className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950" />
        {children}
      </div>
    </div>
  );
}
