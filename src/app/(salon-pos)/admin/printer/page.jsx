'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BookOpen, Eye, Loader2, Printer, QrCode, ReceiptText, Save } from 'lucide-react';
import { getReceiptBranding } from '@/lib/documents/receipt-branding';
import { buildCustomerReceiptHtml } from '@/lib/documents/customer-receipt';
import { buildStatementHtml } from '@/lib/documents/statement';
import { buildReviewQrSheetHtml } from '@/lib/documents/review-qr-sheet';
import { DOCUMENT_DEFAULTS } from '@/lib/documents/settings';

const BOOLEAN_KEYS = Object.keys(DOCUMENT_DEFAULTS).filter((key) => ['true', 'false'].includes(DOCUMENT_DEFAULTS[key]));
const SAVE_KEYS = Object.keys(DOCUMENT_DEFAULTS).filter((key) => /^(receipt|statement|qr)_/.test(key));
const printerDefaults = {
  ...Object.fromEntries(Object.entries(DOCUMENT_DEFAULTS).map(([key, value]) => [key, BOOLEAN_KEYS.includes(key) ? value === 'true' : value])),
  salon_name: 'The Hair Cut', salon_address: '', salon_phone: '', vat_number: '', pan_number: '',
};

const RECEIPT_TOGGLES = [
  ['receipt_show_salon_name', 'Salon name'], ['receipt_show_address', 'Address'], ['receipt_show_phone', 'Phone'],
  ['receipt_show_pan_vat', 'PAN / VAT'], ['receipt_show_customer', 'Customer'], ['receipt_show_stylist', 'Stylist'],
  ['receipt_show_services', 'Services'], ['receipt_show_products', 'Retail products'],
  ['receipt_show_invoice_number', 'Invoice number'], ['receipt_show_date_time', 'Date & time'], ['receipt_show_cashier', 'Cashier'],
  ['receipt_show_payment', 'Payment details'], ['receipt_show_tax', 'Tax'], ['receipt_show_discount', 'Discount'], ['receipt_show_notes', 'Notes'],
  ['receipt_show_aadhar_branding', 'Aadhar POS branding'],
];
const STATEMENT_TOGGLES = [
  ['statement_show_not_tax_invoice', '“Not a tax invoice”'], ['statement_show_pan', 'PAN number'], ['statement_show_address', 'Address'],
  ['statement_show_phone', 'Party phone'], ['statement_show_printed_at', 'Printed date and time'],
];
const QR_TOGGLES = [['qr_show_salon_name', 'Salon name'], ['qr_show_border', 'Card border'], ['qr_show_url', 'Web address under QR']];

const TABS = [
  { key: 'receipt', label: 'Customer receipt', hint: 'Thermal bill', icon: ReceiptText },
  { key: 'statement', label: 'Credit statements', hint: 'Customers & suppliers', icon: BookOpen },
  { key: 'qr', label: 'Review QR sheets', hint: 'Counter & mirror cards', icon: QrCode },
];

// Paper widths in CSS px (96 dpi) for the true-to-print previews.
const PAPER_PX = { a4: [794, 1123], a5: [559, 794], a6: [397, 559], 80: [302, 0], 58: [219, 0] };

const SAMPLE_STATEMENT = {
  name: 'Anita Shrestha', phone: '98XXXXXXXX', owed: 1650,
  open: [{ date: '2026-09-18', label: 'SALON-0000118', total: 2450, due: 1650 }],
  statement: [
    { date: '2026-09-02', detail: 'Credit sale · SALON-0000097 · Hair spa', added: 1800, removed: 0, balance: 1800 },
    { date: '2026-09-10', detail: 'Credit collection · eSewa', added: 0, removed: 1800, balance: 0 },
    { date: '2026-09-18', detail: 'Credit sale · SALON-0000118 · Keratin', added: 2450, removed: 0, balance: 2450 },
    { date: '2026-09-21', detail: 'Credit collection · Cash', added: 0, removed: 800, balance: 1650 },
  ],
};

export default function PrinterPage() {
  const [form, setForm] = useState(printerDefaults);
  const [tab, setTab] = useState('receipt');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ tone: '', text: '' });
  const [origin, setOrigin] = useState('');
  const [isCashier, setIsCashier] = useState(false);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    setOrigin(window.location.origin);
    try { setIsCashier(JSON.parse(localStorage.getItem('pos_user') || '{}').role === 'cashier'); } catch { /* storage unavailable */ }
    try { const saved = sessionStorage.getItem('printer_tab'); if (TABS.some((item) => item.key === saved)) setTab(saved); } catch { /* storage unavailable */ }
    fetch('/api/admin/settings?mode=documents', { headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` } })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Unable to load printer settings'); return body.settings || {}; })
      .then((settings) => setForm((current) => {
        const next = { ...current, ...settings };
        for (const key of BOOLEAN_KEYS) next[key] = String(settings[key] ?? DOCUMENT_DEFAULTS[key]) !== 'false';
        return next;
      }))
      .catch((error) => setMessage({ tone: 'error', text: error.message || 'Unable to load printer settings' }))
      .finally(() => setLoading(false));
  }, []);

  const chooseTab = (key) => {
    setTab(key);
    try { sessionStorage.setItem('printer_tab', key); } catch { /* storage unavailable */ }
  };

  const save = async () => {
    setSaving(true); setMessage({ tone: '', text: '' });
    try {
      const payload = Object.fromEntries(SAVE_KEYS.map((key) => [key, BOOLEAN_KEYS.includes(key) ? String(Boolean(form[key])) : String(form[key] ?? '')]));
      const response = await fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('pos_token')}` }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to save printer settings');
      setMessage({ tone: 'success', text: 'Saved. Receipts, statements and QR sheets print with these settings from now on.' });
    } catch (error) { setMessage({ tone: 'error', text: error.message || 'Unable to save printer settings' }); }
    finally { setSaving(false); }
  };

  const fmtDate = useCallback((value) => String(value || '').slice(0, 10), []);
  const statementHtml = useMemo(() => buildStatementHtml({ view: SAMPLE_STATEMENT, kind: 'customer', mode: 'all', settings: form, fmtDate, printedAt: '2026-09-24 10:35' }), [form, fmtDate]);
  const qrHtml = useMemo(() => buildReviewQrSheetHtml(form, { qrSrc: origin ? `${origin}/api/public/qr` : '', reviewUrl: origin ? `${origin.replace(/^https?:\/\//, '')}/review` : 'your-salon.com/review', autoPrint: false }), [form, origin]);

  const openPrint = (html, size = 'width=900,height=1000', delay = 300) => {
    const printWindow = window.open('', '', size);
    if (!printWindow) return setMessage({ tone: 'error', text: 'Allow pop-ups to open the browser print preview.' });
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    if (delay !== null) setTimeout(() => printWindow.print(), delay);
    return undefined;
  };

  const printReceiptTest = () => {
    const sample = {
      bill: { bill_number: 'SALON-0000123', customer_name: 'Sample Customer', subtotal: 800, discount_amount: 50, tax: 97.5, tax_percent: 13, service_charge: 0, grand_total: 847.5, payment_method: 'cash', amount_paid: 850, cashier_name: 'Sample Admin', transaction_time: new Date().toISOString() },
      items: [
        { item_type: 'service', name: 'Haircut', quantity: 1, unit_price: 500, subtotal: 500, staff_name_snapshot: 'Sample Stylist' },
        { item_type: 'product', name: 'Hair Serum', quantity: 1, unit_price: 300, subtotal: 300 },
      ],
    };
    openPrint(buildCustomerReceiptHtml(sample, form), 'width=380,height=760', 0);
  };
  // The QR sheet prints itself once the QR image has loaded.
  const printQrSheet = () => openPrint(buildReviewQrSheetHtml(form, { qrSrc: `${origin}/api/public/qr`, reviewUrl: `${origin.replace(/^https?:\/\//, '')}/review` }), 'width=900,height=1100', null);

  const inputClass = 'min-h-11 w-full rounded-xl border border-[#D8D1C8] bg-white px-3.5 text-sm text-[#17140F] outline-none transition focus:border-[#6B46E5] focus:ring-2 focus:ring-[#6B46E5]/15';
  const text = (key, label, props = {}) => <Field label={label}><input value={form[key] ?? ''} maxLength={200} onChange={(event) => update(key, event.target.value)} className={inputClass} {...props} /></Field>;
  const select = (key, label, options) => <Field label={label}><select value={String(form[key])} onChange={(event) => update(key, event.target.value)} className={inputClass}>{options.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></Field>;
  const active = TABS.find((item) => item.key === tab);

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#F7F5F2]"><Loader2 className="h-8 w-8 animate-spin text-[#5433C9]" /></div>;

  return (
    <main className="min-h-screen bg-[#F7F5F2]">
      <header className="print-hide border-b border-[#E8E2DB] bg-white px-4 py-5 sm:px-8">
        <div className="mx-auto flex max-w-[1420px] flex-wrap items-end justify-between gap-4">
          <div>
            <Link href={isCashier ? '/dashboard/cashier' : '/admin/settings'} className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-[#6B625A] hover:text-[#17140F]"><ArrowLeft className="h-4 w-4" />{isCashier ? 'Dashboard' : 'Configuration Center'}</Link>
            <h1 className="flex items-center gap-2.5 text-2xl font-extrabold tracking-[-0.025em] text-[#17140F] sm:text-3xl"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#171E2D] text-white"><Printer className="h-5 w-5" /></span>Printer & Documents</h1>
            <p className="mt-1.5 text-sm text-[#6B625A]">Edit every printed label and see exactly how the page will print.</p>
          </div>
          <button type="button" onClick={save} disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#171E2D] px-5 text-sm font-bold text-white shadow-[0_6px_16px_rgba(23,30,45,0.18)] transition hover:bg-[#242d42] disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save all templates</button>
        </div>
      </header>

      <div className="mx-auto max-w-[1420px] px-4 py-6 sm:px-8">
        {message.text ? <div role="status" className={`print-hide mb-5 rounded-xl border px-4 py-3 text-sm font-semibold ${message.tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{message.text}</div> : null}

        <nav className="mb-6 grid gap-2 sm:grid-cols-3" aria-label="Document type">
          {TABS.map(({ key, label, hint, icon: Icon }) => (
            <button key={key} type="button" onClick={() => chooseTab(key)} aria-pressed={tab === key}
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${tab === key ? 'border-[#171E2D] bg-[#171E2D] text-white shadow-[0_10px_24px_rgba(23,30,45,0.18)]' : 'border-[#E8E2DB] bg-white text-[#332E29] hover:border-[#CFC6BB]'}`}>
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tab === key ? 'bg-white/10 text-[#E9C77B]' : 'bg-[#F4EFE8] text-[#8A6A2F]'}`}><Icon className="h-5 w-5" /></span>
              <span className="min-w-0"><span className="block text-sm font-bold">{label}</span><span className={`block text-xs ${tab === key ? 'text-white/70' : 'text-[#8A8178]'}`}>{hint}</span></span>
            </button>
          ))}
        </nav>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_480px]">
          <section className="print-hide rounded-2xl border border-[#EEE8E1] bg-white p-5 shadow-[0_2px_14px_rgba(42,34,28,0.05)] sm:p-7">
            {tab === 'receipt' ? (
              <>
                <SectionTitle title="Customer receipt" hint="Thermal receipt wording, visible details, and paper size." />
                <div className="grid gap-4 sm:grid-cols-2">
                  {select('receipt_paper_size', 'Paper size', [['58', '58 mm compact'], ['80', '80 mm standard']])}
                  {text('receipt_title', 'Document title')}{text('receipt_invoice_label', 'Invoice label')}
                  {text('receipt_item_label', 'Item column')}{text('receipt_quantity_label', 'Quantity column')}
                  {text('receipt_rate_label', 'Rate column')}{text('receipt_amount_label', 'Amount column')}
                  <div className="sm:col-span-2">{text('receipt_footer', 'Footer (when Aadhar branding is off)')}</div>
                </div>
                <Toggles title="Details shown on receipts" items={RECEIPT_TOGGLES} form={form} update={update} />
              </>
            ) : null}
            {tab === 'statement' ? (
              <>
                <SectionTitle title="Credit statements" hint="Full A4 statements are recommended; thermal sizes remain available." />
                <div className="grid gap-4 sm:grid-cols-2">
                  {select('statement_paper_size', 'Statement page', [['a4', 'A4 full page (recommended)'], ['80', '80 mm standard'], ['58', '58 mm compact']])}
                  {text('statement_customer_title', 'Customer statement title')}{text('statement_supplier_title', 'Supplier statement title')}
                  {text('statement_date_label', 'Date / note column')}{text('statement_debit_label', 'Debit column')}{text('statement_credit_label', 'Credit column')}
                  {text('statement_balance_label', 'Balance column')}
                  <div className="sm:col-span-2">{text('statement_footer', 'Statement footer')}</div>
                </div>
                <Toggles title="Details shown on statements" items={STATEMENT_TOGGLES} form={form} update={update} />
                <Note>Print a statement from <b>Customer Ledger</b> or <b>Supplier Ledger</b> → open a party → <b>Print statement</b>.</Note>
              </>
            ) : null}
            {tab === 'qr' ? (
              <>
                <SectionTitle title="Review QR sheets" hint="Large, top-aligned cards customers scan to review their visit and check rewards." />
                <div className="grid gap-4 sm:grid-cols-2">
                  {text('qr_title', 'Headline')}
                  {text('qr_station_label', 'Station / chair label (optional)', { placeholder: 'e.g. Chair 3 · Front desk' })}
                  {text('qr_instruction', 'Scan instruction')}
                  {select('qr_print_size_mm', 'QR size', [['60', '60 mm small'], ['90', '90 mm'], ['110', '110 mm recommended'], ['130', '130 mm large']])}
                  {select('qr_sheet_size', 'Sheet', [['a4', 'A4 poster'], ['a5', 'A5 counter card'], ['a6', 'A6 mirror card']])}
                  {text('qr_footer', 'Footer')}
                </div>
                <Toggles title="Shown on the sheet" items={QR_TOGGLES} form={form} update={update} />
                <Note>The QR always opens <b>/review</b> — it holds no customer data and never gives a stamp by itself. Larger QR sizes are reduced to fit A5 and A6 sheets.</Note>
              </>
            ) : null}
            <div className="mt-6 rounded-xl bg-[#FFF7E6] p-4 text-sm text-[#6B4E16]"><strong>Browser printing:</strong> this system opens the browser print dialog. It does not silently control printer hardware or confirm that paper was printed.</div>
          </section>

          <section className="self-start rounded-2xl border border-[#DCDEE4] bg-[#E7E8EC] p-4 xl:sticky xl:top-5">
            <div className="print-hide mb-4 flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-[#5A5E68]"><Eye className="h-4 w-4" />Live preview · {tab === 'receipt' ? `${form.receipt_paper_size} mm` : tab === 'statement' ? (form.statement_paper_size === 'a4' ? 'A4' : `${form.statement_paper_size} mm`) : String(form.qr_sheet_size).toUpperCase()}</p>
              <button type="button" onClick={tab === 'receipt' ? printReceiptTest : tab === 'statement' ? () => openPrint(statementHtml) : printQrSheet} className="inline-flex min-h-10 items-center gap-2 rounded-[10px] bg-white px-3 text-sm font-bold text-[#332E29] shadow-sm hover:bg-[#FAFAFA]"><Printer className="h-4 w-4" />{tab === 'qr' ? 'Print QR sheet' : 'Print test'}</button>
            </div>
            {tab === 'receipt' ? <ReceiptPreview form={form} /> : null}
            {tab === 'statement' ? <PaperFrame html={statementHtml} paper={form.statement_paper_size} title="Credit statement preview" /> : null}
            {tab === 'qr' ? <PaperFrame html={qrHtml} paper={form.qr_sheet_size} title="Review QR sheet preview" /> : null}
            <p className="print-hide mt-3 text-center text-[11px] text-[#6B6F78]">{active?.key === 'statement' ? 'Sample customer — real statements use the ledger entries.' : active?.key === 'qr' ? 'This is the live QR for your salon.' : 'Synthetic sample bill.'}</p>
          </section>
        </div>
      </div>
    </main>
  );
}

function SectionTitle({ title, hint }) { return <div className="mb-6 border-b border-[#F0EBE4] pb-4"><h2 className="text-lg font-bold text-[#17140F]">{title}</h2><p className="mt-1 text-sm text-[#746C64]">{hint}</p></div>; }
function Field({ label, children }) { return <label className="block"><span className="mb-1.5 block text-sm font-semibold text-[#332E29]">{label}</span>{children}</label>; }
function Note({ children }) { return <p className="mt-5 rounded-xl border border-[#E8E2DB] bg-[#FBFAF8] px-4 py-3 text-sm text-[#5C544C]">{children}</p>; }
function Toggles({ title, items, form, update }) {
  return (
    <div className="mt-6">
      <h3 className="mb-3 text-sm font-bold text-[#332E29]">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {items.map(([key, label]) => <label key={key} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition ${form[key] ? 'border-[#9DE4C1] bg-[#ECFBF3] text-[#115C3B]' : 'border-[#DDD7D0] bg-[#F7F5F2] text-[#746C64]'}`}><input type="checkbox" checked={Boolean(form[key])} onChange={(event) => update(key, event.target.checked)} className="h-4 w-4 accent-[#178A59]" />{label}</label>)}
      </div>
    </div>
  );
}

/** Renders the real print HTML at true paper width, scaled down to fit the preview column. */
function PaperFrame({ html, paper, title }) {
  const boxRef = useRef(null);
  const frameRef = useRef(null);
  const [boxWidth, setBoxWidth] = useState(440);
  const [contentHeight, setContentHeight] = useState(600);
  const [paperWidth, paperHeight] = PAPER_PX[paper] || PAPER_PX.a4;

  useLayoutEffect(() => {
    const node = boxRef.current;
    if (!node) return undefined;
    const measure = () => setBoxWidth(node.clientWidth || 440);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const fit = () => {
    const doc = frameRef.current?.contentDocument;
    if (doc?.body) setContentHeight(Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight));
  };
  useEffect(() => { const timer = setTimeout(fit, 60); return () => clearTimeout(timer); }, [html, paper]);

  const scale = Math.min(1, boxWidth / paperWidth);
  const height = Math.max(paperHeight || 0, contentHeight);
  return (
    <div ref={boxRef} className="w-full overflow-hidden">
      <div style={{ width: paperWidth * scale, height: height * scale }} className="mx-auto overflow-hidden bg-white shadow-[0_10px_28px_rgba(33,35,42,0.13)]">
        <iframe ref={frameRef} title={title} srcDoc={html} onLoad={fit} scrolling="no" style={{ width: paperWidth, height, transform: `scale(${scale})`, transformOrigin: 'top left', border: 0, display: 'block', pointerEvents: 'none' }} />
      </div>
    </div>
  );
}

function ReceiptPreview({ form }) {
  const branding = getReceiptBranding(form.receipt_paper_size);
  const dateLabel = form.calendar_system === 'BS' ? '2083-06-05 BS · 10:35 AM' : '2026-09-21 AD · 10:35 AM';
  const style = { width: form.receipt_paper_size === '58' ? 250 : 340, maxWidth: '100%' };
  return <div style={style} className="mx-auto bg-white p-5 pb-1 font-mono text-[10px] leading-[1.35] text-black shadow-[0_10px_28px_rgba(33,35,42,0.13)] print:shadow-none">{form.receipt_show_salon_name ? <h2 className="text-center text-sm font-black uppercase">{form.salon_name || 'The Hair Cut'}</h2> : null}<p className="text-center font-bold uppercase">{form.receipt_title}</p>{form.receipt_show_address && form.salon_address ? <p className="mt-1 text-center">{form.salon_address}</p> : null}{form.receipt_show_phone && form.salon_phone ? <p className="text-center">Tel: {form.salon_phone}</p> : null}{form.receipt_show_pan_vat && (form.vat_number || form.pan_number) ? <p className="text-center">PAN/VAT: {form.vat_number || form.pan_number}</p> : null}<hr className="my-2 border-dashed border-black" /><div className="grid grid-cols-[auto_1fr] gap-x-3">{form.receipt_show_invoice_number ? <><span>{form.receipt_invoice_label}</span><strong className="text-right">SALON-0000123</strong></> : null}{form.receipt_show_date_time ? <><span>Date / Time</span><span className="text-right">{dateLabel}</span></> : null}{form.receipt_show_customer ? <><span>Customer</span><span className="text-right">Sample Customer</span></> : null}{form.receipt_show_stylist ? <><span>Stylist</span><span className="text-right">Sample Stylist</span></> : null}{form.receipt_show_cashier ? <><span>Cashier</span><span className="text-right">Sample Admin</span></> : null}</div><hr className="my-2 border-dashed border-black" /><ReceiptItemsPreview form={form} /><hr className="my-2 border-dashed border-black" /><div className="grid grid-cols-2 gap-y-1"><span>Subtotal</span><span className="text-right">Rs 800.00</span>{form.receipt_show_discount ? <><span>Discount</span><span className="text-right">- Rs 50.00</span></> : null}{form.receipt_show_tax ? <><span>Tax</span><span className="text-right">Rs 97.50</span></> : null}<strong className="border-t border-black pt-1 text-sm">TOTAL</strong><strong className="border-t border-black pt-1 text-right text-sm">Rs 847.50</strong>{form.receipt_show_payment ? <><span>Payment</span><span className="text-right">Cash · Rs 847.50</span></> : null}</div>{form.receipt_show_notes ? <p className="mt-2">Note: Synthetic preview only.</p> : null}{form.receipt_show_aadhar_branding ? <footer aria-label="Aadhar POS receipt imprint" className="mt-1.5 break-inside-avoid whitespace-nowrap text-center font-sans leading-[1.2]"><div className={`border-b border-black pb-[3px] ${form.receipt_paper_size === '58' ? 'text-[10px]' : 'text-[11px]'}`}>{branding.thanks}</div><div className={`mt-[3px] font-bold tracking-[0.02em] ${form.receipt_paper_size === '58' ? 'text-[8.5px]' : 'text-[10px]'}`}>{branding.tagline}</div><div className={form.receipt_paper_size === '58' ? 'text-[8px]' : 'text-[9px]'}>{branding.verticals.length ? `${branding.verticals.join(' • ')} | ` : null}<strong className="tracking-[0.03em]">{branding.wordmark}</strong>{branding.contact ? ` · ${branding.contact}` : null}</div></footer> : <><hr className="my-2 border-dashed border-black" /><p className="text-center text-[11px]">{form.receipt_footer || 'Thank you for visiting. Please visit again.'}</p></>}</div>;
}

function ReceiptItemsPreview({ form }) {
  if (form.receipt_paper_size === '58') return <table className="w-full table-fixed"><thead><tr className="border-b border-black"><th className="w-[64%] py-1 text-left">{form.receipt_item_label} / {form.receipt_quantity_label}</th><th className="w-[36%] text-right">{form.receipt_amount_label}</th></tr></thead><tbody>{form.receipt_show_services ? <tr><td className="py-1"><strong>Haircut</strong><small className="block">1 × Rs 500.00</small></td><td className="text-right text-[9px]">Rs 500.00</td></tr> : null}{form.receipt_show_products ? <tr><td className="py-1"><strong>Hair Serum</strong><small className="block">1 × Rs 300.00</small></td><td className="text-right text-[9px]">Rs 300.00</td></tr> : null}</tbody></table>;
  return <table className="w-full table-fixed"><thead><tr className="border-b border-black"><th className="w-[46%] py-1 text-left">{form.receipt_item_label}</th><th className="w-[12%] text-right">{form.receipt_quantity_label}</th><th className="w-[20%] text-right">{form.receipt_rate_label}</th><th className="w-[22%] text-right">{form.receipt_amount_label}</th></tr></thead><tbody>{form.receipt_show_services ? <tr><td className="py-1">Haircut</td><td className="text-right">1</td><td className="text-right">500.00</td><td className="text-right">500.00</td></tr> : null}{form.receipt_show_products ? <tr><td className="py-1">Hair Serum</td><td className="text-right">1</td><td className="text-right">300.00</td><td className="text-right">300.00</td></tr> : null}</tbody></table>;
}
