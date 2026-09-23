'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Eye, Loader2, Printer, Save } from 'lucide-react';
import { getReceiptBranding } from '@/lib/documents/receipt-branding';
import { buildCustomerReceiptHtml } from '@/lib/documents/customer-receipt';

const printerDefaults = {
  receipt_paper_size: '80', receipt_title: 'Customer Receipt', receipt_footer: 'Thank you for visiting. Please visit again.',
  receipt_invoice_label: 'Invoice', receipt_quantity_label: 'Qty', receipt_item_label: 'Item', receipt_rate_label: 'Rate', receipt_amount_label: 'Amount',
  receipt_show_salon_name: true, receipt_show_address: true, receipt_show_phone: true, receipt_show_pan_vat: true,
  receipt_show_customer: true, receipt_show_stylist: true, receipt_show_services: true, receipt_show_products: true,
  receipt_show_invoice_number: true, receipt_show_cashier: true,
  receipt_show_payment: true, receipt_show_date_time: true, receipt_show_tax: true, receipt_show_discount: true,
  receipt_show_notes: false, receipt_show_aadhar_branding: true, salon_name: 'The Hair Cut', salon_address: '', salon_phone: '', vat_number: '', pan_number: '', calendar_system: 'AD',
};

const toggles = [
  ['receipt_show_salon_name', 'Salon name'], ['receipt_show_address', 'Address'], ['receipt_show_phone', 'Phone'],
  ['receipt_show_pan_vat', 'PAN / VAT'], ['receipt_show_customer', 'Customer'], ['receipt_show_stylist', 'Stylist'],
  ['receipt_show_services', 'Services'], ['receipt_show_products', 'Retail products'],
  ['receipt_show_invoice_number', 'Invoice number'], ['receipt_show_date_time', 'Date & time'], ['receipt_show_cashier', 'Cashier'],
  ['receipt_show_payment', 'Payment details'], ['receipt_show_tax', 'Tax'], ['receipt_show_discount', 'Discount'], ['receipt_show_notes', 'Notes'],
  ['receipt_show_aadhar_branding', 'Aadhar POS branding'],
];

const saveKeys = Object.keys(printerDefaults).filter((key) => key.startsWith('receipt_'));

export default function PrinterPage() {
  const [form, setForm] = useState(printerDefaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    fetch('/api/admin/settings', { headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` } })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Unable to load printer settings'); return body.settings || {}; })
      .then((settings) => setForm((current) => {
        const next = { ...current, ...settings };
        for (const [key] of toggles) next[key] = settings[key] !== 'false';
        return next;
      }))
      .catch((error) => setMessage(error.message || 'Unable to load printer settings'))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true); setMessage('');
    try {
      const payload = Object.fromEntries(saveKeys.map((key) => [key, form[key]]));
      const response = await fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('pos_token')}` }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to save printer settings');
      setMessage('Printer template saved. New invoices will keep this document snapshot.');
    } catch (error) { setMessage(error.message || 'Unable to save printer settings'); }
    finally { setSaving(false); }
  };

  const previewWidth = form.receipt_paper_size === '58' ? 250 : 340;
  const dateLabel = form.calendar_system === 'BS' ? '2083-06-05 BS · 10:35 AM' : '2026-09-21 AD · 10:35 AM';
  const previewStyle = useMemo(() => ({ width: previewWidth, maxWidth: '100%' }), [previewWidth]);
  const inputClass = 'min-h-11 w-full rounded-xl border border-[#D8D1C8] bg-white px-3.5 text-sm outline-none focus:border-[#6B46E5] focus:ring-2 focus:ring-[#6B46E5]/15';
  const printPreview = () => {
    const printWindow = window.open('', '', 'width=380,height=760');
    if (!printWindow) return setMessage('Allow pop-ups to open the browser print preview.');
    const sample = {
      bill: { bill_number: 'SALON-0000123', customer_name: 'Sample Customer', subtotal: 800, discount_amount: 50, tax: 97.5, tax_percent: 13, service_charge: 0, grand_total: 847.5, payment_method: 'cash', amount_paid: 850, cashier_name: 'Sample Admin', transaction_time: new Date().toISOString() },
      items: [
        { item_type: 'service', name: 'Haircut', quantity: 1, unit_price: 500, subtotal: 500, staff_name_snapshot: 'Sample Stylist' },
        { item_type: 'product', name: 'Hair Serum', quantity: 1, unit_price: 300, subtotal: 300 },
      ],
    };
    printWindow.document.write(buildCustomerReceiptHtml(sample, form));
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#F7F5F2]"><Loader2 className="h-8 w-8 animate-spin text-[#5433C9]" /></div>;

  return (
    <main className="min-h-screen bg-[#F7F5F2]">
      <header className="print-hide border-b border-[#E8E2DB] bg-white px-4 py-5 sm:px-8"><div className="mx-auto flex max-w-[1420px] flex-wrap items-end justify-between gap-4"><div><Link href="/admin/settings" className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-[#6B625A]"><ArrowLeft className="h-4 w-4" />Configuration Center</Link><h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-[-0.025em] text-[#17140F] sm:text-3xl"><Printer className="h-7 w-7" />Printer & Documents</h1><p className="mt-1 text-sm text-[#6B625A]">Edit customer receipt labels and see exactly how the browser printout will look.</p></div><button type="button" onClick={save} disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#171E2D] px-5 text-sm font-bold text-white disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save template</button></div></header>
      <div className="mx-auto max-w-[1420px] px-4 py-6 sm:px-8">
        {message ? <div role="status" className="print-hide mb-5 rounded-[12px] bg-white px-4 py-3 text-sm font-semibold text-[#332E29] shadow-[0_2px_12px_rgba(42,34,28,0.06)]">{message}</div> : null}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_460px]">
          <section className="print-hide rounded-[14px] bg-white p-5 shadow-[0_2px_14px_rgba(42,34,28,0.06)] sm:p-7"><div className="mb-6"><h2 className="text-lg font-bold text-[#17140F]">Customer receipt</h2><p className="mt-1 text-sm text-[#746C64]">Thermal receipt wording, visible details, and paper size.</p></div>
            <div className="grid gap-4 md:grid-cols-3"><Field label="Paper size"><select value={form.receipt_paper_size} onChange={(event) => update('receipt_paper_size', event.target.value)} className={inputClass}><option value="58">58 mm compact</option><option value="80">80 mm standard</option></select></Field><Field label="Document title"><input value={form.receipt_title} onChange={(event) => update('receipt_title', event.target.value)} className={inputClass} /></Field><Field label="Invoice label"><input value={form.receipt_invoice_label} onChange={(event) => update('receipt_invoice_label', event.target.value)} className={inputClass} /></Field><Field label="Item column"><input value={form.receipt_item_label} onChange={(event) => update('receipt_item_label', event.target.value)} className={inputClass} /></Field><Field label="Quantity column"><input value={form.receipt_quantity_label} onChange={(event) => update('receipt_quantity_label', event.target.value)} className={inputClass} /></Field><Field label="Rate column"><input value={form.receipt_rate_label} onChange={(event) => update('receipt_rate_label', event.target.value)} className={inputClass} /></Field><Field label="Amount column"><input value={form.receipt_amount_label} onChange={(event) => update('receipt_amount_label', event.target.value)} className={inputClass} /></Field></div>
            
            <div className="mt-6"><h3 className="mb-3 text-sm font-bold text-[#332E29]">Details shown on receipts</h3><div className="flex flex-wrap gap-2">{toggles.map(([key, label]) => <label key={key} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm font-semibold ${form[key] ? 'border-[#9DE4C1] bg-[#ECFBF3] text-[#115C3B]' : 'border-[#DDD7D0] bg-[#F7F5F2] text-[#746C64]'}`}><input type="checkbox" checked={Boolean(form[key])} onChange={(event) => update(key, event.target.checked)} className="h-4 w-4 accent-[#178A59]" />{label}</label>)}</div></div>
            <div className="mt-6 rounded-[12px] bg-[#FFF7E6] p-4 text-sm text-[#6B4E16]"><strong>Browser printing:</strong> this system opens the browser print dialog. It does not silently control printer hardware or confirm that paper was printed.</div>
          </section>

          <section className="self-start rounded-[14px] bg-[#E7E8EC] p-4 shadow-[0_2px_14px_rgba(42,34,28,0.06)] xl:sticky xl:top-5"><div className="print-hide mb-4 flex items-center justify-between"><p className="flex items-center gap-2 text-xs font-bold text-[#5A5E68]"><Eye className="h-4 w-4" />LIVE PREVIEW · {form.receipt_paper_size} MM</p><button type="button" onClick={printPreview} className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-white px-3 text-sm font-bold text-[#332E29]"><Printer className="h-4 w-4" />Browser print test</button></div><ReceiptPreview form={form} style={previewStyle} dateLabel={dateLabel} /></section>
        </div>
      </div>
    </main>
  );
}

function Field({ label, wide = false, children }) { return <label className={wide ? 'md:col-span-3' : ''}><span className="mb-1.5 block text-sm font-semibold text-[#332E29]">{label}</span>{children}</label>; }

function ReceiptPreview({ form, style, dateLabel }) {
  const branding = getReceiptBranding(form.receipt_paper_size);
  return <div style={style} className="mx-auto bg-white p-5 pb-1 font-mono text-[10px] leading-[1.35] text-black shadow-[0_10px_28px_rgba(33,35,42,0.13)] print:shadow-none">{form.receipt_show_salon_name ? <h2 className="text-center text-sm font-black uppercase">{form.salon_name || 'The Hair Cut'}</h2> : null}<p className="text-center font-bold uppercase">{form.receipt_title}</p>{form.receipt_show_address && form.salon_address ? <p className="mt-1 text-center">{form.salon_address}</p> : null}{form.receipt_show_phone && form.salon_phone ? <p className="text-center">Tel: {form.salon_phone}</p> : null}{form.receipt_show_pan_vat && (form.vat_number || form.pan_number) ? <p className="text-center">PAN/VAT: {form.vat_number || form.pan_number}</p> : null}<hr className="my-2 border-dashed border-black" /><div className="grid grid-cols-[auto_1fr] gap-x-3">{form.receipt_show_invoice_number ? <><span>{form.receipt_invoice_label}</span><strong className="text-right">SALON-0000123</strong></> : null}{form.receipt_show_date_time ? <><span>Date / Time</span><span className="text-right">{dateLabel}</span></> : null}{form.receipt_show_customer ? <><span>Customer</span><span className="text-right">Sample Customer</span></> : null}{form.receipt_show_stylist ? <><span>Stylist</span><span className="text-right">Sample Stylist</span></> : null}{form.receipt_show_cashier ? <><span>Cashier</span><span className="text-right">Sample Admin</span></> : null}</div><hr className="my-2 border-dashed border-black" /><ReceiptItemsPreview form={form} /><hr className="my-2 border-dashed border-black" /><div className="grid grid-cols-2 gap-y-1"><span>Subtotal</span><span className="text-right">Rs 800.00</span>{form.receipt_show_discount ? <><span>Discount</span><span className="text-right">- Rs 50.00</span></> : null}{form.receipt_show_tax ? <><span>Tax</span><span className="text-right">Rs 97.50</span></> : null}<strong className="border-t border-black pt-1 text-sm">TOTAL</strong><strong className="border-t border-black pt-1 text-right text-sm">Rs 847.50</strong>{form.receipt_show_payment ? <><span>Payment</span><span className="text-right">Cash · Rs 847.50</span></> : null}</div>{form.receipt_show_notes ? <p className="mt-2">Note: Synthetic preview only.</p> : null}{form.receipt_show_aadhar_branding ? <footer aria-label="Aadhar POS receipt imprint" className="mt-1.5 break-inside-avoid whitespace-nowrap text-center font-sans leading-[1.2]"><div className={`border-b border-black pb-[3px] ${form.receipt_paper_size === '58' ? 'text-[10px]' : 'text-[11px]'}`}>{branding.thanks}</div><div className={`mt-[3px] font-bold tracking-[0.02em] ${form.receipt_paper_size === '58' ? 'text-[8.5px]' : 'text-[10px]'}`}>{branding.tagline}</div><div className={form.receipt_paper_size === '58' ? 'text-[8px]' : 'text-[9px]'}>{branding.verticals.length ? `${branding.verticals.join(' • ')} | ` : null}<strong className="tracking-[0.03em]">{branding.wordmark}</strong>{branding.contact ? ` · ${branding.contact}` : null}</div></footer> : <><hr className="my-2 border-dashed border-black" /><p className="text-center text-[11px]">{form.receipt_footer || 'Thank you for visiting. Please visit again.'}</p></>}</div>;
}

function ReceiptItemsPreview({ form }) {
  if (form.receipt_paper_size === '58') return <table className="w-full table-fixed"><thead><tr className="border-b border-black"><th className="w-[64%] py-1 text-left">{form.receipt_item_label} / {form.receipt_quantity_label}</th><th className="w-[36%] text-right">{form.receipt_amount_label}</th></tr></thead><tbody>{form.receipt_show_services ? <tr><td className="py-1"><strong>Haircut</strong><small className="block">1 × Rs 500.00</small></td><td className="text-right text-[9px]">Rs 500.00</td></tr> : null}{form.receipt_show_products ? <tr><td className="py-1"><strong>Hair Serum</strong><small className="block">1 × Rs 300.00</small></td><td className="text-right text-[9px]">Rs 300.00</td></tr> : null}</tbody></table>;
  return <table className="w-full table-fixed"><thead><tr className="border-b border-black"><th className="w-[46%] py-1 text-left">{form.receipt_item_label}</th><th className="w-[12%] text-right">{form.receipt_quantity_label}</th><th className="w-[20%] text-right">{form.receipt_rate_label}</th><th className="w-[22%] text-right">{form.receipt_amount_label}</th></tr></thead><tbody>{form.receipt_show_services ? <tr><td className="py-1">Haircut</td><td className="text-right">1</td><td className="text-right">500.00</td><td className="text-right">500.00</td></tr> : null}{form.receipt_show_products ? <tr><td className="py-1">Hair Serum</td><td className="text-right">1</td><td className="text-right">300.00</td><td className="text-right">300.00</td></tr> : null}</tbody></table>;
}
