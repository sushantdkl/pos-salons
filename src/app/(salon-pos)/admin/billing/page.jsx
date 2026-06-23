'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import {
  CreditCard, MessageCircle, Minus, Plus, Receipt, Search, Trash2, User, UserPlus, Wallet, X, Ticket
} from 'lucide-react';
import { formatCurrency } from '@/lib/currency';

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
  if (bill.payment_method !== 'split') return '';
  return `
    <tr><td>Cash Paid</td><td style="text-align:right">${formatCurrency(bill.cash_amount || 0)}</td></tr>
    <tr><td>QR Paid</td><td style="text-align:right">${formatCurrency(bill.qr_amount || 0)}</td></tr>
    <tr><td>QR Type</td><td style="text-align:right">${qrTypeLabel(bill.qr_type)}</td></tr>
    <tr><td>Total Paid</td><td style="text-align:right">${formatCurrency(bill.total_paid || bill.amount_paid || 0)}</td></tr>
  `;
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
  const [taxPercent, setTaxPercent] = useState(0);
  const [error, setError] = useState('');
  const [lastBill, setLastBill] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [selectedToken, setSelectedToken] = useState(null);
  const [paymentQr, setPaymentQr] = useState(null);
  const [qrModal, setQrModal] = useState(null);

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
      setStaff((await staffResponse.json()).employees?.filter((employee) => {
        const role = String(employee.salon_role || employee.role || '').toLowerCase();
        return employee.is_active && ['barber', 'stylist', 'beautician'].includes(role);
      }) || []);
    }
    if (tokenResponse.ok) {
      setTokens(((await tokenResponse.json()).tokens || []).filter((token) => token.status === 'WAITING'));
    }
  };

  const fetchPaymentQr = async () => {
    const response = await fetch('/api/admin/settings?mode=payment-qr', { headers: headers() });
    if (response.ok) setPaymentQr((await response.json()).settings || {});
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

  const staffForService = () => {
    return staff;
  };

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

  const completeBill = async (shouldPrint = false) => {
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
      setError('Assign a barber, stylist, or beautician for every service.');
      return;
    }
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

    const receiptWindow = shouldPrint ? window.open('', '', 'width=340,height=700') : null;
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
        should_print: shouldPrint,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      if (receiptWindow) receiptWindow.close();
      setError(data.error || 'Could not complete bill');
      return;
    }
    setLastBill(data);
    if (shouldPrint) printReceipt(data, receiptWindow);
    clearCart();
    setCustomer(walkInCustomer);
    setSelectedToken(null);
    localStorage.removeItem(draftKey);
    fetchData();
  };

  const printReceipt = (billData = lastBill, printWindow = window.open('', '', 'width=340,height=700')) => {
    if (!billData?.bill || !printWindow) return;
    const rows = billData.items.map((item) => `<tr><td>${item.name} x${item.quantity}</td><td style="text-align:right">${formatCurrency(item.subtotal)}</td></tr>`).join('');
    printWindow.document.write(`
      <html><head><title>${billData.bill.bill_number}</title><style>
        body{font-family:Courier New,monospace;width:72mm;margin:0 auto;padding:8px;font-size:12px;color:#111}
        h1{text-align:center;font-size:16px;margin:0 0 4px}.meta{text-align:center;border-bottom:1px dashed #111;padding-bottom:6px;margin-bottom:6px}
        table{width:100%;border-collapse:collapse}td{padding:3px 0}.total{border-top:1px dashed #111;font-weight:bold;font-size:14px}
        .center{text-align:center;margin-top:8px}
      </style></head><body>
        <h1>The Hair Cut</h1><div class="meta">${billData.bill.bill_number}<br/>${new Date().toLocaleString()}<br/>${billData.bill.customer_name || 'Walk-in Customer'}</div>
        ${billData.bill.token_number ? `<div class="center">Token: ${billData.bill.token_number}</div>` : ''}
        <table>${rows}
          <tr><td>Subtotal</td><td style="text-align:right">${formatCurrency(billData.bill.subtotal)}</td></tr>
          <tr><td>Discount</td><td style="text-align:right">-${formatCurrency(billData.bill.discount_amount)}</td></tr>
          <tr><td>Tax</td><td style="text-align:right">${formatCurrency(billData.bill.tax)}</td></tr>
          <tr class="total"><td>Total</td><td style="text-align:right">${formatCurrency(billData.bill.grand_total)}</td></tr>
          <tr><td>Payment</td><td style="text-align:right">${paymentLabel(billData.bill.payment_method)}</td></tr>
          ${paymentBreakdownRows(billData.bill)}
        </table><div class="center">Thank you. Please visit again.</div>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const sendDigitalReceipt = () => {
    if (!lastBill?.bill?.customer_phone) {
      alert('Customer phone number is required for digital receipt.');
      return;
    }
    const phone = lastBill.bill.customer_phone.replace(/[^\d]/g, '');
    const message = `Receipt ${lastBill.bill.bill_number} from The Hair Cut. Total: ${formatCurrency(lastBill.bill.grand_total)}. Thank you.`;
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
                  onChange={(event) => setCustomer({ ...customer, phone: event.target.value })}
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
                    placeholder="Tax %"
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
                      onClick={() => completeBill(false)}
                      disabled={cartCount === 0}
                      className="rounded-lg bg-gray-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Complete bill
                    </button>
                    <button
                      type="button"
                      onClick={() => completeBill(true)}
                      disabled={cartCount === 0}
                      className="rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Bill &amp; print receipt
                    </button>
                  </div>

                  {lastBill ? (
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
