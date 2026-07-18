'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import {
  CheckCircle2, CreditCard, MessageCircle, Minus, Plus, Printer, Receipt, Search, Trash2, User, UserPlus, Wallet, X, Ticket
} from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import { PHONE_ERROR_MESSAGE, isValidPhone, sanitizePhoneInput } from '@/lib/validation/phone';
import { activeServiceStaffFilter, staffForService as filterStaffForService } from '@/lib/staff/service-staff';

const draftKey = 'salon_pos_bill_draft';
const walkInCustomer = { id: '', name: 'Walk-in Customer', phone: '' };

function paymentLabel(method) {
  return {
    cash: 'Cash',
    card: 'Card',
    online: 'Online QR',
    split: 'Split',
  }[method] || method || '-';
}

function qrTypeLabel(type) {
  return {
    ESEWA_PHONEPAY: 'Esewa / PhonePay',
    BANK: 'Bank QR',
  }[type] || '';
}

function paymentBreakdownRows(bill) {
  if (bill.payment_method !== 'split') {
    if (bill.payment_method === 'cash' && Number(bill.amount_paid || 0) > 0) {
      const change = Math.max(0, Number(bill.amount_paid || 0) - Number(bill.grand_total || 0));
      return `
        <tr><td>Cash received</td><td style="text-align:right">${formatCurrency(bill.amount_paid || 0)}</td></tr>
        ${change > 0 ? `<tr><td>Change</td><td style="text-align:right">${formatCurrency(change)}</td></tr>` : ''}
      `;
    }
    return '';
  }
  return `
    <tr><td>Cash paid</td><td style="text-align:right">${formatCurrency(bill.cash_amount || 0)}</td></tr>
    <tr><td>QR paid</td><td style="text-align:right">${formatCurrency(bill.qr_amount || 0)}</td></tr>
    <tr><td>QR type</td><td style="text-align:right">${qrTypeLabel(bill.qr_type)}</td></tr>
  `;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function buildReceiptHtml(billData, salon = {}) {
  const bill = billData.bill;
  const salonName = escapeHtml(salon.salon_name || 'The Hair Cut');
  const address = escapeHtml(salon.salon_address || '');
  const phone = escapeHtml(salon.salon_phone || '');
  const email = escapeHtml(salon.salon_email || '');
  const vat = escapeHtml(salon.vat_number || '');
  const footer = escapeHtml(salon.receipt_footer || 'Thank you for visiting. Please visit again.');
  const billDate = new Date(bill.created_at || Date.now()).toLocaleString();
  const customerPhone = bill.customer_phone ? `<div>${escapeHtml(bill.customer_phone)}</div>` : '';
  const itemRows = (billData.items || []).map((item) => `
    <tr>
      <td>
        <div class="item-name">${escapeHtml(item.name)}</div>
        <div class="item-meta">Qty ${Number(item.quantity || 1)} × ${formatCurrency(item.unit_price ?? (Number(item.subtotal || 0) / Number(item.quantity || 1)))}</div>
      </td>
      <td class="right">${formatCurrency(item.subtotal)}</td>
    </tr>
  `).join('');

  const discountRow = Number(bill.discount_amount || 0) > 0
    ? `<tr><td>Discount</td><td class="right">-${formatCurrency(bill.discount_amount)}</td></tr>`
    : '';
  const taxRow = Number(bill.tax || 0) > 0
    ? `<tr><td>Tax${bill.tax_percent ? ` (${bill.tax_percent}%)` : ''}</td><td class="right">${formatCurrency(bill.tax)}</td></tr>`
    : '';
  const serviceChargeRow = Number(bill.service_charge || 0) > 0
    ? `<tr><td>Service charge</td><td class="right">${formatCurrency(bill.service_charge)}</td></tr>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(bill.bill_number)}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body {
      font-family: "Courier New", Courier, monospace;
      width: 76mm;
      margin: 0 auto;
      padding: 10px 8px 14px;
      color: #111;
      font-size: 12px;
      line-height: 1.35;
      background: #fff;
    }
    .brand { text-align: center; margin-bottom: 8px; }
    .brand h1 {
      margin: 0;
      font-size: 18px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .muted { color: #444; font-size: 11px; }
    .divider {
      border: 0;
      border-top: 1px dashed #222;
      margin: 8px 0;
    }
    .meta, .customer { text-align: center; }
    .customer { margin-top: 4px; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 3px 0; vertical-align: top; }
    .right { text-align: right; white-space: nowrap; }
    .item-name { font-weight: bold; }
    .item-meta { color: #555; font-size: 10px; }
    .totals td { padding-top: 4px; }
    .grand td {
      border-top: 1px dashed #222;
      padding-top: 6px;
      font-size: 14px;
      font-weight: bold;
    }
    .footer {
      text-align: center;
      margin-top: 10px;
      font-size: 11px;
    }
    .token {
      text-align: center;
      margin: 4px 0 0;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="brand">
    <h1>${salonName}</h1>
    ${address ? `<div class="muted">${address}</div>` : ''}
    ${phone ? `<div class="muted">Tel: ${phone}</div>` : ''}
    ${email ? `<div class="muted">${email}</div>` : ''}
    ${vat ? `<div class="muted">VAT/PAN: ${vat}</div>` : ''}
  </div>
  <hr class="divider" />
  <div class="meta">
    <div><strong>${escapeHtml(bill.bill_number)}</strong></div>
    <div class="muted">${escapeHtml(billDate)}</div>
  </div>
  <div class="customer">${escapeHtml(bill.customer_name || 'Walk-in Customer')}</div>
  ${customerPhone}
  ${bill.token_number ? `<div class="token">Token #${escapeHtml(bill.token_number)}</div>` : ''}
  <hr class="divider" />
  <table>
    ${itemRows}
  </table>
  <hr class="divider" />
  <table class="totals">
    <tr><td>Subtotal</td><td class="right">${formatCurrency(bill.subtotal)}</td></tr>
    ${discountRow}
    ${taxRow}
    ${serviceChargeRow}
    <tr class="grand"><td>TOTAL</td><td class="right">${formatCurrency(bill.grand_total)}</td></tr>
    <tr><td>Payment</td><td class="right">${escapeHtml(paymentLabel(bill.payment_method))}</td></tr>
    ${paymentBreakdownRows(bill)}
  </table>
  <hr class="divider" />
  <div class="footer">${footer}</div>
</body>
</html>`;
}

function qrConfigForType(type, paymentQr) {
  if (type === 'ESEWA_PHONEPAY') {
    return paymentQr?.show_esewa_phonepay_qr === false ? null : {
      label: paymentQr?.esewa_phonepay_label || 'Esewa / PhonePay QR',
      imageUrl: paymentQr?.esewa_phonepay_qr_url,
    };
  }
  if (type === 'BANK') {
    return paymentQr?.show_bank_qr === false ? null : {
      label: paymentQr?.bank_label || 'Bank QR',
      imageUrl: paymentQr?.bank_qr_url,
      bankName: paymentQr?.bank_name,
      accountName: paymentQr?.bank_account_name,
      accountNumber: paymentQr?.bank_account_number,
    };
  }
  return null;
}

function BillingContent() {
  const searchParams = useSearchParams();
  const [services, setServices] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [catalogTab, setCatalogTab] = useState('services');
  const [cartServices, setCartServices] = useState([]);
  const [cartProducts, setCartProducts] = useState([]);
  const [customer, setCustomer] = useState(walkInCustomer);
  const [discountType, setDiscountType] = useState('amount');
  const [discountValue, setDiscountValue] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [amountPaid, setAmountPaid] = useState('');
  const [splitCashAmount, setSplitCashAmount] = useState('');
  const [splitQrAmount, setSplitQrAmount] = useState('');
  const [splitQrType, setSplitQrType] = useState('');
  const [splitQrEdited, setSplitQrEdited] = useState(false);
  const [taxPercent, setTaxPercent] = useState('');
  const [error, setError] = useState('');
  const [lastBill, setLastBill] = useState(null);
  const [successBill, setSuccessBill] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [selectedToken, setSelectedToken] = useState(null);
  const [paymentQr, setPaymentQr] = useState(null);
  const [salonInfo, setSalonInfo] = useState({
    salon_name: 'The Hair Cut',
    salon_address: '',
    salon_phone: '',
    salon_email: '',
    vat_number: '',
    receipt_footer: 'Thank you for visiting. Please visit again.',
  });
  const [qrModal, setQrModal] = useState(null);
  const [processingBill, setProcessingBill] = useState(false);

  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });
  const isWalkIn = !customer.id;

  const fetchData = async () => {
    const [serviceResponse, productResponse, customerResponse, staffResponse, tokenResponse] = await Promise.all([
      fetch('/api/admin/services', { headers: headers() }),
      fetch('/api/admin/salon-products', { headers: headers() }),
      fetch('/api/admin/customers', { headers: headers() }),
      fetch('/api/admin/employees', { headers: headers() }),
      fetch('/api/admin/tokens', { headers: headers() }),
    ]);
    if (serviceResponse.ok) setServices((await serviceResponse.json()).services?.filter((item) => item.is_active) || []);
    if (productResponse.ok) setProducts((await productResponse.json()).products?.filter((item) => item.status === 'active') || []);
    if (customerResponse.ok) setCustomers((await customerResponse.json()).customers || []);
    if (staffResponse.ok) {
      setStaff((await staffResponse.json()).employees?.filter(activeServiceStaffFilter) || []);
    }
    if (tokenResponse.ok) {
      setTokens(((await tokenResponse.json()).tokens || []).filter((token) => token.status === 'WAITING'));
    }
  };

  const fetchPaymentQr = async () => {
    const response = await fetch('/api/admin/settings?mode=payment-qr', { headers: headers() });
    if (response.ok) {
      const settings = (await response.json()).settings || {};
      setPaymentQr(settings);
      setSalonInfo({
        salon_name: settings.salon_name || 'The Hair Cut',
        salon_address: settings.salon_address || '',
        salon_phone: settings.salon_phone || '',
        salon_email: settings.salon_email || '',
        vat_number: settings.vat_number || '',
        receipt_footer: settings.receipt_footer || 'Thank you for visiting. Please visit again.',
      });
    }
  };

  useEffect(() => {
    fetchData();
    fetchPaymentQr();
    const draft = localStorage.getItem(draftKey);
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        setCartServices(parsed.cartServices || []);
        setCartProducts(parsed.cartProducts || []);
        setCustomer(parsed.customer || walkInCustomer);
        setDiscountType(parsed.discountType || 'amount');
        setDiscountValue(parsed.discountValue || '');
        setPaymentMethod(parsed.paymentMethod || 'cash');
        setSplitCashAmount(parsed.splitCashAmount || '');
        setSplitQrAmount(parsed.splitQrAmount || '');
        setSplitQrType(parsed.splitQrType || '');
      } catch {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify({
      cartServices,
      cartProducts,
      customer,
      discountType,
      discountValue,
      paymentMethod,
      splitCashAmount,
      splitQrAmount,
      splitQrType,
    }));
  }, [cartServices, cartProducts, customer, discountType, discountValue, paymentMethod, splitCashAmount, splitQrAmount, splitQrType]);

  const filteredServices = useMemo(() => services.filter((service) =>
    service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    service.category.toLowerCase().includes(searchTerm.toLowerCase())
  ), [services, searchTerm]);

  const filteredProducts = useMemo(() => products.filter((product) =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.category.toLowerCase().includes(searchTerm.toLowerCase())
  ), [products, searchTerm]);

  const subtotal = cartServices.reduce((sum, item) => sum + Number(item.price), 0)
    + cartProducts.reduce((sum, item) => sum + Number(item.selling_price) * item.quantity, 0);
  const discountAmount = discountType === 'percentage' ? subtotal * (Number(discountValue || 0) / 100) : Number(discountValue || 0);
  const safeDiscount = Math.min(Math.max(discountAmount, 0), subtotal);
  const tax = (subtotal - safeDiscount) * (Number(taxPercent || 0) / 100);
  const total = subtotal - safeDiscount + tax;
  const change = Number(amountPaid || total) - total;
  const cartCount = cartServices.length + cartProducts.length;
  const splitTotal = Number(splitCashAmount || 0) + Number(splitQrAmount || 0);
  const splitBalance = total - splitTotal;

  useEffect(() => {
    if (paymentMethod !== 'split' || splitQrEdited) return;
    const cash = Math.max(0, Number(splitCashAmount || 0));
    setSplitQrAmount(Math.max(0, total - cash).toFixed(2));
  }, [paymentMethod, splitCashAmount, splitQrEdited, total]);

  const setWalkInCustomer = () => {
    setCustomer(walkInCustomer);
    setSelectedToken(null);
    setError('');
  };

  const selectCustomer = (id) => {
    if (!id) {
      setWalkInCustomer();
      return;
    }
    const selected = customers.find((item) => String(item.id) === String(id));
    if (selected) {
      setCustomer({
        id: selected.id,
        name: selected.name,
        phone: selected.phone || '',
        preferred_barber_id: selected.preferred_barber_id || '',
        preferred_stylist_id: selected.preferred_stylist_id || '',
        preferred_beautician_id: selected.preferred_beautician_id || '',
      });
      setSelectedToken(null);
      setError('');
    }
  };

  const addService = (service) => {
    setCartServices((items) => [...items, {
      ...service,
      cart_id: crypto.randomUUID(),
      staff_id: customer.preferred_stylist_id || customer.preferred_barber_id || customer.preferred_beautician_id || '',
    }]);
    setError('');
  };

  function loadToken(token) {
    const service = services.find((item) => Number(item.id) === Number(token.service_id));
    if (!service) {
      setError('Token service is not available for billing.');
      return;
    }
    setSelectedToken(token);
    setCustomer({
      id: token.customer_id || '',
      name: token.customer_name || 'Walk-in Customer',
      phone: token.customer_phone || '',
    });
    setCartServices([{
      ...service,
      cart_id: `token-${token.id}`,
      staff_id: token.assigned_staff_id || '',
    }]);
    setCartProducts([]);
    setSearchTerm('');
    setError('');
  }

  const clearToken = () => {
    setSelectedToken(null);
    setCartServices((items) => items.filter((item) => !String(item.cart_id).startsWith('token-')));
  };

  useEffect(() => {
    const tokenId = searchParams.get('tokenId');
    if (tokenId && tokens.length && services.length) {
      const token = tokens.find((item) => String(item.id) === String(tokenId));
      if (token) loadToken(token);
    }
  }, [tokens, services, searchParams]);

  const staffForService = (service) => filterStaffForService(staff, service);

  const addProduct = (product) => {
    setCartProducts((items) => {
      const existing = items.find((item) => item.id === product.id);
      if (existing) {
        return items.map((item) => item.id === product.id
          ? { ...item, quantity: Math.min(item.quantity + 1, product.current_stock) }
          : item);
      }
      return [...items, { ...product, quantity: 1 }];
    });
    setError('');
  };

  const updateProductQty = (id, changeBy) => {
    setCartProducts((items) => items.map((item) => {
      if (item.id !== id) return item;
      const next = item.quantity + changeBy;
      return { ...item, quantity: Math.max(1, Math.min(next, item.current_stock)) };
    }));
  };

  const clearCart = () => {
    setCartServices([]);
    setCartProducts([]);
    setDiscountValue('');
    setAmountPaid('');
    setSplitCashAmount('');
    setSplitQrAmount('');
    setSplitQrType('');
    setSplitQrEdited(false);
    setError('');
  };

  const completeBill = async () => {
    setError('');
    if (cartServices.length === 0 && cartProducts.length === 0) {
      setError('Add at least one service or product.');
      return;
    }
    if (discountType === 'percentage' && Number(discountValue || 0) > 100) {
      setError('Percentage discount cannot exceed 100.');
      return;
    }
    if (cartServices.some((service) => !service.staff_id)) {
      setError('Please assign a staff member to every service before completing the bill.');
      return;
    }
    if (customer.phone && !isValidPhone(customer.phone)) {
      setError(PHONE_ERROR_MESSAGE);
      return;
    }
    if (processingBill) return;
    if (paymentMethod === 'cash' && amountPaid && Number(amountPaid) < total) {
      setError('Cash received is less than the bill total.');
      return;
    }
    if (paymentMethod === 'split') {
      const cash = Number(splitCashAmount || 0);
      const qr = Number(splitQrAmount || 0);
      if (cash < 0 || qr < 0) {
        setError('Split payment amounts cannot be negative.');
        return;
      }
      if (cash > total || qr > total) {
        setError('Split payment amounts cannot exceed the bill total.');
        return;
      }
      if (!splitQrType) {
        setError('Select a QR type for split payment.');
        return;
      }
      if (Math.abs((cash + qr) - total) > 0.01) {
        setError('Cash amount and QR amount must equal the total payable.');
        return;
      }
    }

    setProcessingBill(true);
    const response = await fetch('/api/admin/billing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify({
        customer_id: customer.id || null,
        customer,
        services: cartServices.map((service) => ({ id: service.id, staff_id: service.staff_id })),
        products: cartProducts.map((product) => ({ id: product.id, quantity: product.quantity })),
        token_id: selectedToken?.id || null,
        discount_type: discountType,
        discount_value: Number(discountValue || 0),
        tax_percent: Number(taxPercent || 0),
        payment_method: paymentMethod,
        amount_paid: Number(amountPaid || total),
        cash_amount: paymentMethod === 'split' ? Number(splitCashAmount || 0) : undefined,
        qr_amount: paymentMethod === 'split' ? Number(splitQrAmount || 0) : undefined,
        qr_type: paymentMethod === 'split' ? splitQrType : undefined,
        should_print: false,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.message || data.error || 'Unable to complete the bill. No transaction was saved. Please try again.');
      setProcessingBill(false);
      return;
    }
    setLastBill(data);
    setSuccessBill(data);
    clearCart();
    setCustomer(walkInCustomer);
    setSelectedToken(null);
    setTaxPercent('');
    localStorage.removeItem(draftKey);
    fetchData();
    setProcessingBill(false);
  };

  const closeSuccessBill = () => setSuccessBill(null);

  const printReceipt = (billData = lastBill, printWindow = window.open('', '', 'width=360,height=720')) => {
    if (!billData?.bill || !printWindow) return;
    printWindow.document.open();
    printWindow.document.write(buildReceiptHtml(billData, salonInfo));
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const sendDigitalReceipt = () => {
    if (!lastBill?.bill?.customer_phone) {
      setError('Customer phone number is required for digital receipt.');
      return;
    }
    const phone = lastBill.bill.customer_phone.replace(/[^\d]/g, '');
    const salonName = salonInfo.salon_name || 'The Hair Cut';
    const message = `Receipt ${lastBill.bill.bill_number} from ${salonName}. Total: ${formatCurrency(lastBill.bill.grand_total)}. ${salonInfo.receipt_footer || 'Thank you.'}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-950 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200';

  return (
    <>
      <header className="border-b border-gray-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-950">Salon Billing</h1>
            <p className="text-sm text-gray-600">Add items, assign staff, and complete payment.</p>
          </div>
          {cartCount > 0 ? (
            <span className="inline-flex w-fit items-center rounded-full bg-gray-900 px-3 py-1 text-sm font-semibold text-white">
              {cartCount} item{cartCount === 1 ? '' : 's'} in cart
            </span>
          ) : null}
        </div>
      </header>

      <div className="bg-gray-50 p-4 sm:p-6">
        <div className="mx-auto grid max-w-7xl gap-5 xl:grid-cols-[1fr_400px]">
          <div className="space-y-5">
            {/* Customer */}
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-gray-950">Customer</h2>
                {!isWalkIn ? (
                  <button
                    type="button"
                    onClick={setWalkInCustomer}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 transition hover:text-gray-900"
                  >
                    <UserPlus className="h-4 w-4" />
                    Switch to walk-in
                  </button>
                ) : null}
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={setWalkInCustomer}
                  className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition ${
                    isWalkIn
                      ? 'border-gray-900 bg-gray-900 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <User className="h-4 w-4" />
                  Walk-in
                </button>
                <select
                  value={customer.id || ''}
                  onChange={(event) => selectCustomer(event.target.value)}
                  className={`min-w-[200px] flex-1 rounded-lg border px-3 py-2.5 text-sm text-gray-950 outline-none focus:ring-2 focus:ring-gray-200 ${
                    !isWalkIn ? 'border-gray-900 bg-gray-50' : 'border-gray-300 bg-white'
                  }`}
                >
                  <option value="">Select saved customer…</option>
                  {customers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}{item.phone ? ` · ${item.phone}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={customer.name}
                  onChange={(event) => setCustomer({ ...customer, name: event.target.value, id: customer.id })}
                  placeholder="Customer name"
                  className={inputClass}
                />
                <input
                  value={customer.phone}
                  onChange={(event) => setCustomer({ ...customer, phone: sanitizePhoneInput(event.target.value) })}
                  placeholder="Phone (optional)"
                  className={inputClass}
                />
              </div>

              {tokens.length > 0 ? (
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
                    <Ticket className="h-4 w-4 text-amber-600" />
                    Load from waiting token
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <select
                      value={selectedToken?.id || ''}
                      onChange={(event) => {
                        const token = tokens.find((item) => String(item.id) === event.target.value);
                        if (token) loadToken(token);
                        else clearToken();
                      }}
                      className="flex-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-gray-950"
                    >
                      <option value="">No token — manual billing</option>
                      {tokens.map((token) => (
                        <option key={token.id} value={token.id}>
                          {token.token_number} · {token.customer_name || 'Walk-in'} · {token.service_name}
                        </option>
                      ))}
                    </select>
                    {selectedToken ? (
                      <button
                        type="button"
                        onClick={clearToken}
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        <X className="h-4 w-4" />
                        Clear token
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </section>

            {/* Catalog */}
            <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 p-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search services or products…"
                    className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm text-gray-950 outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div className="mt-3 flex gap-2">
                  {[
                    ['services', `Services (${filteredServices.length})`],
                    ['products', `Products (${filteredProducts.length})`],
                  ].map(([tab, label]) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setCatalogTab(tab)}
                      className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                        catalogTab === tab
                          ? 'bg-gray-900 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="max-h-[52vh] overflow-y-auto p-4">
                {catalogTab === 'services' ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {filteredServices.map((service) => (
                      <button
                        key={service.id}
                        type="button"
                        onClick={() => addService(service)}
                        className="rounded-lg border border-gray-200 p-3 text-left transition hover:border-gray-900 hover:bg-gray-50"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-gray-950">{service.name}</p>
                            <p className="mt-0.5 text-xs text-gray-500">
                              {service.category} · {service.duration_minutes} min
                              {service.is_package ? ' · Package' : ''}
                            </p>
                          </div>
                          <span className="shrink-0 text-sm font-semibold text-gray-950">{formatCurrency(service.price)}</span>
                        </div>
                      </button>
                    ))}
                    {filteredServices.length === 0 ? (
                      <p className="col-span-full py-8 text-center text-sm text-gray-500">No services match your search.</p>
                    ) : null}
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {filteredProducts.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        disabled={product.current_stock <= 0}
                        onClick={() => addProduct(product)}
                        className="rounded-lg border border-gray-200 p-3 text-left transition hover:border-gray-900 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-gray-950">{product.name}</p>
                            <p className="mt-0.5 text-xs text-gray-500">
                              {product.category} · Stock {product.current_stock}
                            </p>
                          </div>
                          <span className="shrink-0 text-sm font-semibold text-gray-950">{formatCurrency(product.selling_price)}</span>
                        </div>
                      </button>
                    ))}
                    {filteredProducts.length === 0 ? (
                      <p className="col-span-full py-8 text-center text-sm text-gray-500">No products match your search.</p>
                    ) : null}
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Cart */}
          <aside className="h-fit xl:sticky xl:top-4">
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-950">
                  <Receipt className="h-5 w-5" />
                  Bill
                </h2>
                {cartCount > 0 ? (
                  <button
                    type="button"
                    onClick={clearCart}
                    className="text-sm font-medium text-red-600 hover:text-red-700"
                  >
                    Clear all
                  </button>
                ) : null}
              </div>

              <div className="p-5">
                {error ? (
                  <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
                    {error}
                  </div>
                ) : null}

                <div className="max-h-[36vh] space-y-2 overflow-y-auto">
                  {cartServices.map((service) => (
                    <div key={service.cart_id} className="rounded-lg border border-gray-200 bg-gray-50/50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-950">{service.name}</p>
                          <p className="text-sm text-gray-600">{formatCurrency(service.price)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCartServices((items) => items.filter((item) => item.cart_id !== service.cart_id))}
                          className="shrink-0 p-1 text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <select
                        value={service.staff_id || ''}
                        onChange={(event) => setCartServices((items) => items.map((item) => (
                          item.cart_id === service.cart_id ? { ...item, staff_id: event.target.value } : item
                        )))}
                        className={`mt-2 w-full rounded-lg border px-2.5 py-2 text-sm text-gray-950 ${
                          service.staff_id ? 'border-gray-300' : 'border-amber-300 bg-amber-50'
                        }`}
                      >
                        <option value="">Assign staff *</option>
                        {staffForService(service).map((employee) => (
                          <option key={employee.id} value={employee.id}>
                            {employee.full_name} ({employee.salon_role})
                          </option>
                        ))}
                        {staffForService(service).length === 0 ? (
                          <option value="" disabled>No active service staff available</option>
                        ) : null}
                      </select>
                    </div>
                  ))}

                  {cartProducts.map((product) => (
                    <div key={product.id} className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-950">{product.name}</p>
                        <p className="text-sm text-gray-600">{formatCurrency(product.selling_price)} each</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => updateProductQty(product.id, -1)} className="rounded-md border border-gray-300 p-1 hover:bg-gray-50">
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-5 text-center text-sm font-semibold">{product.quantity}</span>
                        <button type="button" onClick={() => updateProductQty(product.id, 1)} className="rounded-md border border-gray-300 p-1 hover:bg-gray-50">
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => setCartProducts((items) => items.filter((item) => item.id !== product.id))} className="p-1 text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {cartCount === 0 ? (
                    <div className="rounded-lg border border-dashed border-gray-200 py-10 text-center text-sm text-gray-500">
                      Tap a service or product to add it here.
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                  <div className="grid grid-cols-2 gap-2">
                    <select value={discountType} onChange={(event) => setDiscountType(event.target.value)} className={inputClass}>
                      <option value="amount">Discount Rs</option>
                      <option value="percentage">Discount %</option>
                    </select>
                    <input
                      type="number"
                      min="0"
                      value={discountValue}
                      onChange={(event) => setDiscountValue(event.target.value)}
                      placeholder="0"
                      className={inputClass}
                    />
                  </div>

                  {paymentMethod === 'online' ? (
                    <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                      <p className="mb-2 text-sm font-semibold text-blue-950">Show QR to customer</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {paymentQr?.show_esewa_phonepay_qr !== false ? (
                          <QrButton
                            label={paymentQr?.esewa_phonepay_label || 'Esewa / PhonePay QR'}
                            imageUrl={paymentQr?.esewa_phonepay_qr_url}
                            onClick={() => setQrModal({
                              label: paymentQr?.esewa_phonepay_label || 'Esewa / PhonePay QR',
                              imageUrl: paymentQr?.esewa_phonepay_qr_url,
                            })}
                          />
                        ) : null}
                        {paymentQr?.show_bank_qr !== false ? (
                          <QrButton
                            label={paymentQr?.bank_label || 'Bank QR'}
                            imageUrl={paymentQr?.bank_qr_url}
                            detail={[paymentQr?.bank_name, paymentQr?.bank_account_name].filter(Boolean).join(' · ')}
                            onClick={() => setQrModal({
                              label: paymentQr?.bank_label || 'Bank QR',
                              imageUrl: paymentQr?.bank_qr_url,
                              bankName: paymentQr?.bank_name,
                              accountName: paymentQr?.bank_account_name,
                              accountNumber: paymentQr?.bank_account_number,
                            })}
                          />
                        ) : null}
                      </div>
                      {!paymentQr?.esewa_phonepay_qr_url && !paymentQr?.bank_qr_url ? (
                        <p className="mt-2 text-xs font-medium text-blue-800">QR images are not configured yet. Admin can add them in Settings.</p>
                      ) : null}
                    </div>
                  ) : null}
                  {paymentMethod === 'split' ? (
                    <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
                      <p className="mb-2 text-sm font-semibold text-amber-950">Split payment: Cash + QR</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="text-xs font-semibold text-gray-700">
                          Cash Amount
                          <input
                            type="number"
                            min="0"
                            value={splitCashAmount}
                            onChange={(event) => {
                              setSplitCashAmount(event.target.value);
                              if (!splitQrEdited) {
                                const cash = Number(event.target.value || 0);
                                setSplitQrAmount(Math.max(0, total - cash).toFixed(2));
                              }
                            }}
                            placeholder="0.00"
                            className={`${inputClass} mt-1`}
                          />
                        </label>
                        <label className="text-xs font-semibold text-gray-700">
                          QR Amount
                          <input
                            type="number"
                            min="0"
                            value={splitQrAmount}
                            onChange={(event) => {
                              setSplitQrEdited(true);
                              setSplitQrAmount(event.target.value);
                            }}
                            placeholder={formatCurrency(total)}
                            className={`${inputClass} mt-1`}
                          />
                        </label>
                      </div>
                      <label className="mt-2 block text-xs font-semibold text-gray-700">
                        QR Type
                        <select
                          value={splitQrType}
                          onChange={(event) => {
                            setSplitQrType(event.target.value);
                            const qr = qrConfigForType(event.target.value, paymentQr);
                            if (qr) setQrModal({ ...qr, amount: Number(splitQrAmount || 0) });
                          }}
                          className={`${inputClass} mt-1`}
                        >
                          <option value="">Select QR type</option>
                          <option value="ESEWA_PHONEPAY">Esewa / PhonePay QR</option>
                          <option value="BANK">Bank QR</option>
                        </select>
                      </label>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          disabled={!splitQrType || !qrConfigForType(splitQrType, paymentQr)?.imageUrl}
                          onClick={() => {
                            const qr = qrConfigForType(splitQrType, paymentQr);
                            if (qr) setQrModal({ ...qr, amount: Number(splitQrAmount || 0) });
                          }}
                          className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-amber-900 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Show Selected QR
                        </button>
                        <p className={`rounded-lg px-3 py-2 text-xs font-semibold ${Math.abs(splitBalance) <= 0.01 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>
                          Balance: {formatCurrency(splitBalance)}
                        </p>
                      </div>
                    </div>
                  ) : null}
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={taxPercent}
                    onChange={(event) => setTaxPercent(event.target.value)}
                    placeholder="Tax % (optional)"
                    className={inputClass}
                  />

                  <div className="space-y-1.5 rounded-lg bg-gray-50 p-3 text-sm">
                    <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                    <div className="flex justify-between text-green-700"><span>Discount</span><span>-{formatCurrency(safeDiscount)}</span></div>
                    <div className="flex justify-between text-gray-600"><span>Tax</span><span>{formatCurrency(tax)}</span></div>
                    <div className="flex justify-between border-t border-gray-200 pt-2 text-lg font-bold text-gray-950">
                      <span>Total</span>
                      <span>{formatCurrency(total)}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ['cash', Wallet, 'Cash'],
                      ['card', CreditCard, 'Card'],
                      ['online', MessageCircle, 'Online'],
                      ['split', Receipt, 'Split'],
                    ].map(([method, Icon, label]) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPaymentMethod(method)}
                        className={`rounded-lg border px-2 py-2.5 text-xs font-semibold transition ${
                          paymentMethod === method
                            ? 'border-gray-900 bg-gray-900 text-white'
                            : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <Icon className="mx-auto mb-1 h-4 w-4" />
                        {label}
                      </button>
                    ))}
                  </div>

                  {paymentMethod === 'cash' ? (
                    <div>
                      <input
                        type="number"
                        min="0"
                        value={amountPaid}
                        onChange={(event) => setAmountPaid(event.target.value)}
                        placeholder={`Cash received (${formatCurrency(total)})`}
                        className={inputClass}
                      />
                      {amountPaid && change >= 0 ? (
                        <p className="mt-1.5 text-sm font-semibold text-green-700">Change: {formatCurrency(change)}</p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="grid gap-2 pt-1">
                    <button
                      type="button"
                      onClick={completeBill}
                      disabled={cartCount === 0 || processingBill}
                      className="rounded-lg bg-gray-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {processingBill ? 'Completing...' : 'Complete bill'}
                    </button>
                  </div>

                  {lastBill && !successBill ? (
                    <button
                      type="button"
                      onClick={sendDigitalReceipt}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <MessageCircle className="mr-2 inline h-4 w-4" />
                      Send digital receipt
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
      {successBill?.bill ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-gray-100 px-5 py-4 text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <CheckCircle2 className="h-7 w-7 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-950">Bill completed</h3>
              <p className="mt-1 text-sm text-gray-600">Payment saved successfully.</p>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 font-mono text-xs text-gray-900">
                <p className="text-center text-sm font-bold uppercase tracking-wide">{salonInfo.salon_name || 'The Hair Cut'}</p>
                {salonInfo.salon_address ? <p className="mt-1 text-center text-gray-500">{salonInfo.salon_address}</p> : null}
                {salonInfo.salon_phone ? <p className="text-center text-gray-500">Tel: {salonInfo.salon_phone}</p> : null}
                {salonInfo.vat_number ? <p className="text-center text-gray-500">VAT/PAN: {salonInfo.vat_number}</p> : null}
                <div className="my-3 border-t border-dashed border-gray-300" />
                <p className="text-center font-semibold text-gray-800">{successBill.bill.bill_number}</p>
                <p className="text-center text-gray-500">{new Date(successBill.bill.created_at || Date.now()).toLocaleString()}</p>
                <p className="mt-2 text-center font-semibold">{successBill.bill.customer_name || 'Walk-in Customer'}</p>
                {successBill.bill.customer_phone ? <p className="text-center text-gray-500">{successBill.bill.customer_phone}</p> : null}
                {successBill.bill.token_number ? (
                  <p className="mt-1 text-center font-semibold text-gray-700">Token #{successBill.bill.token_number}</p>
                ) : null}
                <div className="my-3 border-t border-dashed border-gray-300" />
                <div className="space-y-2">
                  {(successBill.items || []).map((item) => (
                    <div key={`${item.name}-${item.item_id || item.id}`} className="flex justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{item.name}</p>
                        <p className="text-[10px] text-gray-500">Qty {item.quantity}</p>
                      </div>
                      <span className="shrink-0 font-semibold">{formatCurrency(item.subtotal)}</span>
                    </div>
                  ))}
                </div>
                <div className="my-3 border-t border-dashed border-gray-300" />
                <div className="space-y-1">
                  <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(successBill.bill.subtotal)}</span></div>
                  {Number(successBill.bill.discount_amount || 0) > 0 ? (
                    <div className="flex justify-between"><span>Discount</span><span>-{formatCurrency(successBill.bill.discount_amount)}</span></div>
                  ) : null}
                  {Number(successBill.bill.tax || 0) > 0 ? (
                    <div className="flex justify-between"><span>Tax</span><span>{formatCurrency(successBill.bill.tax)}</span></div>
                  ) : null}
                  <div className="flex justify-between text-sm font-bold"><span>Total</span><span>{formatCurrency(successBill.bill.grand_total)}</span></div>
                  <div className="flex justify-between"><span>Payment</span><span>{paymentLabel(successBill.bill.payment_method)}</span></div>
                </div>
                <p className="mt-3 text-center text-gray-500">{salonInfo.receipt_footer || 'Thank you for visiting. Please visit again.'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-gray-100 px-5 py-4">
              <button
                type="button"
                onClick={closeSuccessBill}
                className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50"
              >
                Okay
              </button>
              <button
                type="button"
                onClick={() => printReceipt(successBill)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800"
              >
                <Printer className="h-4 w-4" />
                Print
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {qrModal ? (
        <PaymentQrModal
          qr={qrModal}
          amount={qrModal.amount ?? total}
          onClose={() => setQrModal(null)}
          onReceived={() => {
            if (paymentMethod === 'split') {
              setSplitQrAmount(String(qrModal.amount ?? splitQrAmount));
            } else {
              setAmountPaid(total.toFixed(2));
            }
            setQrModal(null);
          }}
        />
      ) : null}
    </>
  );
}

function QrButton({ label, imageUrl, detail, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!imageUrl}
      className="rounded-lg border border-blue-200 bg-white p-3 text-left transition hover:border-blue-500 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <p className="text-sm font-semibold text-gray-950">{label}</p>
      {detail ? <p className="mt-1 text-xs text-gray-500">{detail}</p> : null}
      <p className="mt-2 text-xs font-medium text-blue-700">{imageUrl ? 'Open QR' : 'Not configured'}</p>
    </button>
  );
}

function PaymentQrModal({ qr, amount, onClose, onReceived }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-950">{qr.label}</h2>
            <p className="text-sm text-gray-600">Amount to pay: <strong>{formatCurrency(amount)}</strong></p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex justify-center rounded-lg bg-gray-50 p-4">
          <div className="relative h-72 w-72">
            <Image src={qr.imageUrl} alt={qr.label} fill sizes="288px" className="object-contain" unoptimized />
          </div>
        </div>
        {qr.bankName || qr.accountName || qr.accountNumber ? (
          <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
            {qr.bankName ? <p><strong>Bank:</strong> {qr.bankName}</p> : null}
            {qr.accountName ? <p><strong>Account:</strong> {qr.accountName}</p> : null}
            {qr.accountNumber ? <p><strong>Number:</strong> {qr.accountNumber}</p> : null}
          </div>
        ) : null}
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            Close
          </button>
          <button type="button" onClick={onReceived} className="rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700">
            Payment Received
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminBilling() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 p-6 text-gray-600">Loading billing…</div>}>
      <BillingContent />
    </Suspense>
  );
}
