'use client';

import { useEffect, useState } from 'react';
import { CreditCard, Loader2, Receipt, Save, Settings, Store } from 'lucide-react';

const emptySalon = {
  salon_name: '',
  salon_address: '',
  salon_phone: '',
  salon_email: '',
  owner_name: '',
  vat_number: '',
  vat_percentage: 0,
  service_charge_percentage: 0,
  receipt_footer: 'Thank you for visiting.'
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
          receipt_footer: settings.receipt_footer || 'Thank you for visiting.'
        });
      }
    } finally {
      setLoading(false);
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
                  <input value={form.salon_phone} onChange={(e) => setForm({ ...form, salon_phone: e.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950" />
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
              <p className="text-sm text-gray-600">Cash, card, online, and split payments are available in billing. QR image management can be added later without changing the billing flow.</p>
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
