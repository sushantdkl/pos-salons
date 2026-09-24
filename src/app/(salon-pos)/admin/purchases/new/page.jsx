'use client';

/**
 * RECORD PURCHASE — receive products from a supplier. Adds stock, increases what is owed to the
 * supplier, and can pay part of it now (cash from the open drawer, or online). Totals shown here
 * are a preview; the server recomputes everything.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, PackagePlus, Plus, Trash2 } from 'lucide-react';
import {
  AlertBanner, ErpButton, ErpPage, ErrorState, LoadingState, money, PageHeader, SectionHeading,
} from '@/components/erp';
import { erpFetch } from '@/components/erp/use-report';

const FIELD = 'mt-1 block h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900 focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-200';
const LABEL = 'block text-xs font-bold uppercase tracking-[0.04em] text-stone-500';

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());
}

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const emptyLine = () => ({ key: crypto.randomUUID(), productId: '', quantity: '1', unitCost: '' });

export default function NewPurchasePage() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState(null);
  const [products, setProducts] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({
    supplierId: '', purchaseDate: today(), supplierInvoice: '', discount: '', tax: '', notes: '', updateCostPrice: true,
    payNow: '', payMethod: 'credit', payReference: '',
  });
  const [lines, setLines] = useState(() => [emptyLine()]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => crypto.randomUUID());

  useEffect(() => {
    (async () => {
      try {
        const [supplierData, productData] = await Promise.all([erpFetch('/api/suppliers'), erpFetch('/api/admin/salon-products')]);
        setSuppliers(supplierData.suppliers);
        setProducts(productData.products || []);
        const fromUrl = new URLSearchParams(window.location.search).get('supplierId');
        if (fromUrl) setForm((current) => ({ ...current, supplierId: fromUrl }));
      } catch (err) { setLoadError(err.message); }
    })();
  }, []);

  const productById = useMemo(() => new Map(products.map((product) => [String(product.id), product])), [products]);
  const subtotal = round2(lines.reduce((sum, line) => sum + round2(Number(line.quantity) * Number(line.unitCost)), 0));
  const total = round2(subtotal - Number(form.discount || 0) + Number(form.tax || 0));
  const supplier = suppliers?.find((row) => String(row.id) === String(form.supplierId));

  const setLine = (lineKey, patch) => setLines((current) => current.map((line) => {
    if (line.key !== lineKey) return line;
    const next = { ...line, ...patch };
    // Picking a product pre-fills its last purchase price.
    if (patch.productId && !line.unitCost) next.unitCost = String(productById.get(patch.productId)?.purchase_price ?? '');
    return next;
  }));

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const payNow = form.payMethod === 'credit' ? 0 : Number(form.payNow || 0);
      const result = await erpFetch('/api/purchases', {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: {
          supplierId: Number(form.supplierId),
          purchaseDate: form.purchaseDate,
          supplierInvoice: form.supplierInvoice,
          discount: Number(form.discount || 0),
          tax: Number(form.tax || 0),
          notes: form.notes,
          updateCostPrice: form.updateCostPrice,
          items: lines.filter((line) => line.productId).map((line) => ({ productId: Number(line.productId), quantity: Number(line.quantity), unitCost: Number(line.unitCost) })),
          paidNow: payNow > 0 ? { amount: payNow, method: form.payMethod, reference: form.payReference } : null,
        },
      });
      router.push(`/admin/suppliers/${result.purchase.supplierId}`);
    } catch (err) { setError(err.message); setBusy(false); }
  };

  const ready = form.supplierId && lines.some((line) => line.productId) && lines.every((line) => !line.productId || (Number(line.quantity) > 0 && Number(line.unitCost) >= 0 && line.unitCost !== ''));

  return (
    <ErpPage narrow>
      <PageHeader
        icon={PackagePlus}
        iconTone="ops"
        title="Record purchase"
        subtitle="Products received from a supplier. Stock goes up now; the supplier balance goes up by the total."
        actions={<Link href="/admin/purchases" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"><ArrowLeft className="h-4 w-4" /> Purchases</Link>}
      />
      {loadError ? <ErrorState message={loadError} onRetry={() => window.location.reload()} /> : null}
      {!suppliers && !loadError ? <LoadingState /> : null}
      {suppliers ? (
        <div className="space-y-5">
          {!suppliers.length ? <AlertBanner tone="cash" title="No suppliers yet">Add one first under <Link className="font-semibold underline" href="/admin/suppliers">Suppliers</Link>.</AlertBanner> : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <label className={`${LABEL} min-w-0`}>Supplier *
              <select className={FIELD} value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value })}>
                <option value="">Choose…</option>
                {suppliers.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
            </label>
            <label className={`${LABEL} min-w-0`}>Received on<input className={FIELD} type="date" max={today()} value={form.purchaseDate} onChange={(event) => setForm({ ...form, purchaseDate: event.target.value })} /></label>
            <label className={`${LABEL} min-w-0`}>Supplier invoice no.<input className={FIELD} value={form.supplierInvoice} onChange={(event) => setForm({ ...form, supplierInvoice: event.target.value })} /></label>
          </div>
          {supplier ? <p className="text-xs text-stone-500">{supplier.name} — owed now {money(supplier.balance)}</p> : null}

          <div className="min-w-0">
            <SectionHeading title="Products received" action={<ErpButton icon={Plus} onClick={() => setLines([...lines, emptyLine()])}>Add line</ErpButton>} />
            <div className="space-y-2">
              {lines.map((line, index) => {
                const product = productById.get(line.productId);
                return (
                  <div key={line.key} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-stone-200 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_6rem_8rem_7rem_auto] sm:items-end">
                    <label className={`${LABEL} col-span-2 min-w-0 sm:col-span-1`}>Product {index + 1}
                      <select className={FIELD} value={line.productId} onChange={(event) => setLine(line.key, { productId: event.target.value })}>
                        <option value="">Choose…</option>
                        {products.map((row) => <option key={row.id} value={row.id}>{row.name} (in stock {Number(row.current_stock)})</option>)}
                      </select>
                    </label>
                    <label className={`${LABEL} min-w-0`}>Qty<input className={FIELD} type="number" min="1" step="1" inputMode="numeric" value={line.quantity} onChange={(event) => setLine(line.key, { quantity: event.target.value })} /></label>
                    <label className={`${LABEL} min-w-0`}>Unit cost<input className={FIELD} type="number" min="0" step="0.01" inputMode="decimal" value={line.unitCost} onChange={(event) => setLine(line.key, { unitCost: event.target.value })} /></label>
                    <p className="text-right text-sm font-semibold tabular-nums sm:pb-3">{money(round2(Number(line.quantity) * Number(line.unitCost)))}</p>
                    <button type="button" aria-label={`Remove line ${index + 1}`} disabled={lines.length === 1} onClick={() => setLines(lines.filter((row) => row.key !== line.key))} className="justify-self-end rounded-lg p-2 text-stone-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 sm:mb-1.5"><Trash2 className="h-4 w-4" /></button>
                    {product && Number(line.unitCost) && Number(product.purchase_price) && Number(line.unitCost) !== Number(product.purchase_price)
                      ? <p className="col-span-full text-xs text-amber-700">Last cost was {money(product.purchase_price)}.</p> : null}
                  </div>
                );
              })}
            </div>
            <label className="mt-2 flex items-center gap-2 text-sm text-stone-600">
              <input type="checkbox" checked={form.updateCostPrice} onChange={(event) => setForm({ ...form, updateCostPrice: event.target.checked })} />
              Update each product&apos;s cost price to this purchase&apos;s unit cost
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className={`${LABEL} min-w-0`}>Discount<input className={FIELD} type="number" min="0" step="0.01" value={form.discount} onChange={(event) => setForm({ ...form, discount: event.target.value })} /></label>
            <label className={`${LABEL} min-w-0`}>Tax / VAT<input className={FIELD} type="number" min="0" step="0.01" value={form.tax} onChange={(event) => setForm({ ...form, tax: event.target.value })} /></label>
            <label className={`${LABEL} min-w-0 sm:col-span-2`}>Note<input className={FIELD} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
          </div>

          <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
            <dl className="grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-stone-500">Subtotal</dt><dd className="text-right tabular-nums">{money(subtotal)}</dd>
              <dt className="text-stone-500">Discount</dt><dd className="text-right tabular-nums">− {money(form.discount || 0)}</dd>
              <dt className="text-stone-500">Tax</dt><dd className="text-right tabular-nums">{money(form.tax || 0)}</dd>
              <dt className="font-bold">Purchase total</dt><dd className="text-right text-base font-extrabold tabular-nums">{money(total)}</dd>
            </dl>
          </div>

          <div className="min-w-0 rounded-xl border border-stone-200 bg-white p-4">
            <SectionHeading title="Payment" note="Credit = pay later from the supplier's ledger. Paying part now leaves the rest on credit." />
            <div className="grid gap-3 sm:grid-cols-3">
              <label className={`${LABEL} min-w-0`}>Payment
                <select
                  className={FIELD}
                  value={form.payMethod}
                  onChange={(event) => {
                    const method = event.target.value;
                    setForm({ ...form, payMethod: method, payNow: method === 'credit' ? '' : (form.payNow || String(total > 0 ? total : '')) });
                  }}
                >
                  <option value="credit">Credit (pay later)</option>
                  <option value="cash">Cash drawer</option>
                  <option value="online">Online / bank</option>
                </select>
              </label>
              {form.payMethod !== 'credit' ? (
                <>
                  <label className={`${LABEL} min-w-0`}>Amount paid now<input className={FIELD} type="number" min="0" step="0.01" value={form.payNow} onChange={(event) => setForm({ ...form, payNow: event.target.value })} /></label>
                  <label className={`${LABEL} min-w-0`}>Reference<input className={FIELD} value={form.payReference} onChange={(event) => setForm({ ...form, payReference: event.target.value })} /></label>
                </>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-stone-500">
              {form.payMethod === 'credit'
                ? `On credit: ${money(total)} is added to what you owe ${supplier?.name || 'the supplier'}.`
                : `Paid now ${money(form.payNow || 0)} · on credit ${money(Math.max(0, round2(total - Number(form.payNow || 0))))}`}
              {supplier ? ` Owed after this purchase: ${money(round2((supplier.balance || 0) + total - (form.payMethod === 'credit' ? 0 : Number(form.payNow || 0))))}.` : ''}
            </p>
          </div>

          {error ? <AlertBanner tone="outflow">{error}</AlertBanner> : null}
          <div className="flex justify-end gap-2">
            <Link href="/admin/purchases" className="inline-flex min-h-10 items-center rounded-lg border border-stone-300 bg-white px-3.5 text-sm font-semibold text-stone-700 hover:bg-stone-50">Cancel</Link>
            <ErpButton variant="primary" icon={PackagePlus} disabled={busy || !ready} onClick={submit}>{busy ? 'Saving…' : `Receive ${money(total)}`}</ErpButton>
          </div>
        </div>
      ) : null}
    </ErpPage>
  );
}
