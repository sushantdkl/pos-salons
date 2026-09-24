'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  CheckCircle2, MessageCircle, Minus, Plus, Printer, QrCode, Receipt, Search, Sparkles, Trash2, User, UserPlus, Wallet, X, Ticket
} from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import { buildCustomerReceiptHtml } from '@/lib/documents/customer-receipt';
import { PHONE_ERROR_MESSAGE, isValidPhone, sanitizePhoneInput } from '@/lib/validation/phone';
import { activeServiceStaffFilter, staffForService as filterStaffForService } from '@/lib/staff/service-staff';

const draftKey = 'salon_pos_bill_draft';
const walkInCustomer = { id: '', name: 'Walk-in Customer', phone: '' };

function paymentLabel(method) {
  return {
    cash: 'Cash',
    card: 'Card',
    online: 'Online QR',
    credit: 'Customer Credit',
    split: 'Split',
  }[method] || method || '-';
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
  const router = useRouter();
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
  const [splitCreditAmount, setSplitCreditAmount] = useState('');
  const [splitQrType, setSplitQrType] = useState('');
  const [onlineQrType, setOnlineQrType] = useState('');
  const [splitQrEdited, setSplitQrEdited] = useState(false);
  const [taxPercent, setTaxPercent] = useState('');
  const [error, setError] = useState('');
  const [lastBill, setLastBill] = useState(null);
  const [successBill, setSuccessBill] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [selectedToken, setSelectedToken] = useState(null);
  // The appointment this bill settles (opened from Appointments with ?appointmentId=).
  const [appointmentLink, setAppointmentLink] = useState(null);
  const [paymentQr, setPaymentQr] = useState(null);
  const [salonInfo, setSalonInfo] = useState({
    salon_name: 'The Hair Cut',
    salon_address: '',
    salon_phone: '',
    salon_email: '',
    vat_number: '',
    receipt_footer: 'Thank you for visiting. Please visit again.',
    receipt_paper_size: '80',
    receipt_title: 'Customer Receipt',
  });
  const [qrModal, setQrModal] = useState(null);
  const [processingBill, setProcessingBill] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  // Loyalty: the selected customer's cards; the cashier chooses to apply a reward (never automatic).
  const [loyalty, setLoyalty] = useState({ customerId: null, programs: [] });
  const [appliedRewardId, setAppliedRewardId] = useState(null);
  const idempotencyKey = useRef(null);

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
        receipt_paper_size: settings.receipt_paper_size || '80',
        receipt_title: settings.receipt_title || 'Customer Receipt',
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
        setSplitCreditAmount(parsed.splitCreditAmount || '');
        setSplitQrType(parsed.splitQrType || '');
        setOnlineQrType(parsed.onlineQrType || '');
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
      splitCreditAmount,
      splitQrType,
      onlineQrType,
    }));
  }, [cartServices, cartProducts, customer, discountType, discountValue, paymentMethod, splitCashAmount, splitQrAmount, splitCreditAmount, splitQrType, onlineQrType]);

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
  // Preview only — the server validates the reward against the loyalty ledger and recomputes.
  const appliedReward = loyalty.programs.find((program) => program.programId === appliedRewardId && program.available > 0) || null;
  const rewardLine = appliedReward?.rewardType === 'FREE_SERVICE' ? cartServices.find((item) => Number(item.id) === Number(appliedReward.rewardServiceId)) : null;
  const rewardDiscount = !appliedReward ? 0 : Math.min(subtotal - safeDiscount, appliedReward.rewardType === 'FREE_SERVICE'
    ? Number(rewardLine?.price || 0)
    : appliedReward.rewardType === 'FIXED_DISCOUNT' ? Number(appliedReward.rewardValue) : (subtotal - safeDiscount) * Number(appliedReward.rewardValue) / 100);
  const tax = (subtotal - safeDiscount - rewardDiscount) * (Number(taxPercent || 0) / 100);
  const total = subtotal - safeDiscount - rewardDiscount + tax;
  const change = Number(amountPaid || total) - total;
  const cartCount = cartServices.length + cartProducts.length;
  const splitTotal = Number(splitCashAmount || 0) + Number(splitQrAmount || 0) + Number(splitCreditAmount || 0);
  const splitBalance = total - splitTotal;

  useEffect(() => {
    if (paymentMethod !== 'split' || splitQrEdited) return;
    const cash = Math.max(0, Number(splitCashAmount || 0));
    setSplitQrAmount(Math.max(0, total - cash - Number(splitCreditAmount || 0)).toFixed(2));
  }, [paymentMethod, splitCashAmount, splitCreditAmount, splitQrEdited, total]);

  // Loyalty cards for the selected customer (by id, or by a full phone number typed in).
  const loyaltyKey = customer.id ? `id:${customer.id}` : String(customer.phone || '').replace(/\D/g, '').length >= 10 ? `phone:${customer.phone}` : '';
  useEffect(() => {
    setAppliedRewardId(null);
    if (!loyaltyKey) { setLoyalty({ customerId: null, programs: [] }); return undefined; }
    let alive = true;
    const query = customer.id ? `customerId=${encodeURIComponent(customer.id)}` : `phone=${encodeURIComponent(customer.phone)}`;
    fetch(`/api/crm/loyalty/customer?${query}`, { headers: headers() })
      .then((response) => (response.ok ? response.json() : { customerId: null, programs: [] }))
      .then((data) => { if (alive) setLoyalty({ customerId: data.customerId || null, programs: data.programs || [] }); })
      .catch(() => { if (alive) setLoyalty({ customerId: null, programs: [] }); });
    return () => { alive = false; };
    // customer.id / phone are captured by loyaltyKey.
  }, [loyaltyKey]);

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

  // Appointment -> bill: prefill customer, the booked services and the assigned staff member.
  // The server links the bill to the appointment once; a second bill for it is rejected.
  useEffect(() => {
    const appointmentId = searchParams.get('appointmentId');
    if (!appointmentId || !services.length) return;
    let cancelled = false;
    (async () => {
      const response = await fetch(`/api/appointments/${encodeURIComponent(appointmentId)}`, { headers: headers() });
      const payload = await response.json().catch(() => ({}));
      if (cancelled) return;
      if (!response.ok) { setError(payload.error || 'Could not load the appointment.'); return; }
      const appointment = payload.appointment;
      if (appointment.billId) { setError(`Appointment ${appointment.number} is already billed (${appointment.billNumber}).`); return; }
      if (['CANCELLED', 'NO_SHOW'].includes(appointment.status)) {
        setError(`Appointment ${appointment.number} is ${appointment.status.toLowerCase().replace('_', ' ')} and cannot be billed.`);
        return;
      }
      const lines = appointment.services
        .map((line, index) => {
          const service = services.find((item) => Number(item.id) === Number(line.serviceId));
          return service ? { ...service, cart_id: `appointment-${appointment.id}-${index}`, staff_id: appointment.staffId || '' } : null;
        })
        .filter(Boolean);
      setAppointmentLink({ id: appointment.id, number: appointment.number });
      setCustomer({ id: appointment.customerId || '', name: appointment.customerName || 'Walk-in Customer', phone: appointment.customerPhone || '' });
      setCartServices(lines);
      setCartProducts([]);
      const token = appointment.tokenId ? tokens.find((item) => String(item.id) === String(appointment.tokenId)) : null;
      setSelectedToken(token || null);
      setError(lines.length === appointment.services.length ? '' : 'Some booked services are no longer active — add them manually.');
    })();
    return () => { cancelled = true; };
  }, [services, tokens, searchParams]);

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
    setAppliedRewardId(null);
    setCartServices([]);
    setCartProducts([]);
    setDiscountValue('');
    setAmountPaid('');
    setSplitCashAmount('');
    setSplitQrAmount('');
    setSplitCreditAmount('');
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
    if (paymentMethod === 'online' && !onlineQrType) {
      setError('Select a QR type for online payment.');
      return;
    }
    if (paymentMethod === 'credit' && !customer.id) {
      setError('Select an existing customer before using credit.');
      return;
    }
    if (paymentMethod === 'split') {
      const cash = Number(splitCashAmount || 0);
      const qr = Number(splitQrAmount || 0);
      const credit = Number(splitCreditAmount || 0);
      if (cash < 0 || qr < 0 || credit < 0) {
        setError('Split payment amounts cannot be negative.');
        return;
      }
      if (cash > total || qr > total || credit > total) {
        setError('Split payment amounts cannot exceed the bill total.');
        return;
      }
      if (qr > 0 && !splitQrType) {
        setError('Select a QR type for split payment.');
        return;
      }
      if (credit > 0 && !customer.id) {
        setError('Select an existing customer before allocating credit.');
        return;
      }
      if (Math.abs((cash + qr + credit) - total) > 0.001) {
        setError('Cash, online, and credit allocations must equal the exact total.');
        return;
      }
    }

    setProcessingBill(true);
    if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
    try {
      const response = await fetch('/api/admin/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey.current, ...headers() },
        body: JSON.stringify({
        customer_id: customer.id || loyalty.customerId || null,
        customer,
        loyalty_redemption: appliedReward ? { programId: appliedReward.programId } : undefined,
        services: cartServices.map((service) => ({ id: service.id, staff_id: service.staff_id })),
        products: cartProducts.map((product) => ({ id: product.id, quantity: product.quantity })),
        token_id: selectedToken?.id || null,
        appointment_id: appointmentLink?.id || null,
        discount_type: discountType,
        discount_value: Number(discountValue || 0),
        tax_percent: Number(taxPercent || 0),
        payment_method: paymentMethod,
        amount_paid: Number(amountPaid || total),
        cash_amount: paymentMethod === 'split' ? Number(splitCashAmount || 0) : undefined,
        qr_amount: paymentMethod === 'split' ? Number(splitQrAmount || 0) : undefined,
        qr_type: paymentMethod === 'online' ? onlineQrType : paymentMethod === 'split' ? splitQrType : undefined,
        allocations: paymentMethod === 'credit'
          ? [{ method: 'credit', amount: total }]
          : paymentMethod === 'split'
            ? [
                { method: 'cash', amount: Number(splitCashAmount || 0), cashTendered: Number(splitCashAmount || 0) },
                { method: 'online', amount: Number(splitQrAmount || 0), provider: splitQrType },
                { method: 'credit', amount: Number(splitCreditAmount || 0) },
              ].filter((entry) => entry.amount > 0)
            : undefined,
        should_print: false,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.message || data.error || 'Unable to complete the bill. No transaction was saved. Please try again.');
        return;
      }
      setLastBill(data);
      setSuccessBill(data);
      clearCart();
      setCustomer(walkInCustomer);
      setSelectedToken(null);
      setAppointmentLink(null);
      setTaxPercent('');
      localStorage.removeItem(draftKey);
      idempotencyKey.current = null;
      fetchData();
      router.refresh();
    } catch {
      setError('Connection interrupted. The request can be retried safely without creating a duplicate bill.');
    } finally {
      setProcessingBill(false);
    }
  };

  // A saved bill closes the payment pop-up; its receipt pop-up takes over.
  useEffect(() => { if (successBill) setPayOpen(false); }, [successBill]);

  const closeSuccessBill = () => setSuccessBill(null);

  const printReceipt = (billData = lastBill, printWindow = window.open('', '', 'width=360,height=720')) => {
    if (!billData?.bill || !printWindow) return;
    printWindow.document.open();
    printWindow.document.write(buildCustomerReceiptHtml(billData, { ...salonInfo, site_origin: window.location.origin }));
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
                  className={`min-w-0 flex-1 rounded-lg border px-3 py-2.5 text-sm text-gray-950 outline-none focus:ring-2 focus:ring-gray-200 ${
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
                    {appointmentLink ? (
                      <span className="inline-flex items-center rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-800">
                        Billing appointment {appointmentLink.number}
                      </span>
                    ) : null}
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

          {/* Current order */}
          <aside className="h-fit xl:sticky xl:top-4">
            <div className="flex max-h-[calc(100vh-2rem)] min-h-[560px] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-2 border-b border-stone-100 bg-gradient-to-r from-[#FBF7EF] to-white px-5 py-4">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 text-lg font-extrabold text-stone-900"><Receipt className="h-5 w-5 text-[#9B742D]" />Current Order</h2>
                  <p className="text-xs text-stone-500">{cartCount ? `${cartCount} item${cartCount === 1 ? '' : 's'} · ${isWalkIn ? 'Walk-in' : customer.name}` : 'Ready — pick a token or add services'}</p>
                </div>
                {cartCount > 0 ? (
                  <button type="button" onClick={clearCart} className="text-xs font-semibold text-rose-600 hover:text-rose-700">Clear all</button>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
                  {cartServices.map((service) => (
                    <div key={service.cart_id} className="rounded-lg border border-gray-200 bg-gray-50/50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-950">{service.name}</p>
                          <p className="text-sm text-gray-600">{formatCurrency(service.price)}</p>
                        </div>
                        <button
                          type="button"
                          aria-label={`Remove ${service.name}`}
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
                        <button type="button" onClick={() => updateProductQty(product.id, -1)} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md border border-gray-300 hover:bg-gray-50">
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="w-6 text-center text-sm font-semibold">{product.quantity}</span>
                        <button type="button" onClick={() => updateProductQty(product.id, 1)} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md border border-gray-300 hover:bg-gray-50">
                          <Plus className="h-4 w-4" />
                        </button>
                        <button type="button" aria-label={`Remove ${product.name}`} onClick={() => setCartProducts((items) => items.filter((item) => item.id !== product.id))} className="p-1 text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {cartCount === 0 ? (
                    <div className="flex h-full min-h-[220px] flex-col items-center justify-center text-center text-stone-400">
                      <Receipt className="mb-2 h-9 w-9 text-stone-300" />
                      <p className="text-sm font-semibold text-stone-500">Order is empty</p>
                      <p className="text-xs">Tap a service or product to add it here.</p>
                    </div>
                  ) : null}
              </div>

              <div className="space-y-3 border-t border-stone-100 bg-[#FCFAF6] p-4">
                {error && !payOpen ? (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</div>
                ) : null}
                <div className="space-y-1.5 rounded-xl border border-stone-200 bg-white p-3 text-sm">
                  <div className="flex justify-between text-stone-600"><span>Subtotal</span><span className="font-semibold text-stone-900">{formatCurrency(subtotal)}</span></div>
                  {safeDiscount > 0 ? <div className="flex justify-between text-rose-600"><span>Discount</span><span>-{formatCurrency(safeDiscount)}</span></div> : null}
                  {appliedReward ? <div className="flex justify-between text-pink-700"><span>Loyalty reward</span><span>-{formatCurrency(rewardDiscount)}</span></div> : null}
                  {tax > 0 ? <div className="flex justify-between text-stone-600"><span>Tax</span><span>{formatCurrency(tax)}</span></div> : null}
                  <div className="flex justify-between border-t border-stone-100 pt-2 text-lg font-extrabold text-stone-900"><span>Total</span><span className="text-emerald-700">{formatCurrency(total)}</span></div>
                </div>
                {loyalty.programs.some((program) => program.available > 0) ? (
                  <p className="rounded-lg bg-pink-50 px-3 py-2 text-xs font-semibold text-pink-800">This customer has a loyalty reward ready — apply it in Bill Payment.</p>
                ) : null}
                <button
                  type="button"
                  onClick={() => { setError(''); setPayOpen(true); }}
                  disabled={cartCount === 0 || processingBill}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-700/40"
                >
                  <Wallet className="h-4 w-4" />
                  Bill Payment{cartCount ? ` · ${formatCurrency(total)}` : ''}
                </button>
                {lastBill && !successBill ? (
                  <button type="button" onClick={sendDigitalReceipt} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white text-sm font-semibold text-stone-700 hover:bg-stone-50">
                    <MessageCircle className="h-4 w-4" />Send last receipt on WhatsApp
                  </button>
                ) : null}
              </div>
            </div>
          </aside>

          {payOpen ? (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Bill payment" onClick={() => !processingBill && setPayOpen(false)}>
              <div className="flex max-h-[96vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-center justify-between gap-3 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-white px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 text-white"><Wallet className="h-5 w-5" /></span>
                    <div>
                      <h3 className="text-lg font-extrabold text-stone-900">Bill Payment</h3>
                      <p className="text-xs text-stone-500">Choose customer and collect payment</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => setPayOpen(false)} disabled={processingBill} aria-label="Close" className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700"><X className="h-5 w-5" /></button>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={setWalkInCustomer} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border text-sm font-semibold ${isWalkIn ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'}`}><User className="h-4 w-4" />Walk-in</button>
                    <select
                      value={customer.id || ''}
                      onChange={(event) => selectCustomer(event.target.value)}
                      aria-label="Saved customer"
                      className={`min-h-11 min-w-0 rounded-xl border px-3 text-sm font-semibold ${!isWalkIn ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 bg-white text-stone-700'}`}
                    >
                      <option value="">Customer…</option>
                      {customers.map((item) => <option key={item.id} value={item.id}>{item.name}{item.phone ? ` · ${item.phone}` : ''}</option>)}
                    </select>
                  </div>

                  {loyalty.programs.filter((program) => program.available > 0).map((program) => (
                    <div key={program.programId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-pink-200 bg-pink-50 p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-pink-900">Reward available</p>
                        <p className="text-xs text-pink-800">{program.rewardLabel} · {program.name}{program.rewardType === 'FREE_SERVICE' && !cartServices.some((item) => Number(item.id) === Number(program.rewardServiceId)) ? ` — add ${program.rewardServiceName} to use it` : ''}</p>
                      </div>
                      {appliedRewardId === program.programId
                        ? <button type="button" onClick={() => setAppliedRewardId(null)} className="rounded-lg border border-pink-300 bg-white px-3 py-2 text-xs font-bold text-pink-800">Remove reward</button>
                        : <button type="button" disabled={program.rewardType === 'FREE_SERVICE' && !cartServices.some((item) => Number(item.id) === Number(program.rewardServiceId))} onClick={() => setAppliedRewardId(program.programId)} className="rounded-lg bg-pink-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Apply Reward</button>}
                    </div>
                  ))}
                  {loyalty.programs.filter((program) => program.available === 0 && program.enrolled).map((program) => (
                    <p key={program.programId} className="text-xs text-gray-500">{program.name}: {program.progress}/{program.requiredVisits} — {program.remaining} more until {program.rewardLabel}</p>
                  ))}

                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="text-[13px] font-bold text-stone-800">Manual discount</p>
                      <div className="inline-flex rounded-lg bg-stone-100 p-0.5 text-xs font-bold">
                        {[['percentage', '%'], ['amount', 'Rs']].map(([type, label]) => (
                          <button key={type} type="button" onClick={() => setDiscountType(type)} className={`rounded-md px-2.5 py-1 ${discountType === type ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}>{label}</button>
                        ))}
                      </div>
                    </div>
                    <label className="flex min-h-11 items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 focus-within:border-emerald-500">
                      <span className="text-sm text-stone-400">{discountType === 'percentage' ? '%' : 'Rs'}</span>
                      <input type="number" min="0" value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} placeholder="0" aria-label="Manual discount" className="min-w-0 flex-1 bg-transparent py-2 text-sm text-stone-900 outline-none" />
                    </label>
                  </div>

                  <label className="block">
                    <span className="text-[13px] font-bold text-stone-800">Tax % <span className="font-normal text-stone-400">(optional)</span></span>
                    <input type="number" min="0" max="100" value={taxPercent} onChange={(event) => setTaxPercent(event.target.value)} placeholder="0" className="mt-1.5 block min-h-11 w-full rounded-xl border border-stone-300 px-3 text-sm" />
                  </label>

                  <div className="space-y-1.5 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 text-sm">
                    <div className="flex justify-between text-stone-600"><span>Subtotal</span><span className="font-semibold text-stone-900">{formatCurrency(subtotal)}</span></div>
                    {safeDiscount > 0 ? <div className="flex justify-between text-rose-600"><span>Discount</span><span>-{formatCurrency(safeDiscount)}</span></div> : null}
                    {appliedReward ? <div className="flex justify-between text-pink-700"><span>Loyalty reward · {appliedReward.rewardLabel}</span><span>-{formatCurrency(rewardDiscount)}</span></div> : null}
                    {tax > 0 ? <div className="flex justify-between text-stone-600"><span>Tax</span><span>{formatCurrency(tax)}</span></div> : null}
                    <div className="flex justify-between border-t border-emerald-200 pt-2 text-lg font-extrabold"><span className="text-stone-900">Total</span><span className="text-emerald-700">{formatCurrency(total)}</span></div>
                  </div>

                  <div>
                    <p className="mb-1.5 text-[13px] font-bold text-stone-800">Payment</p>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        ['cash', Wallet, 'Cash'],
                        ['online', QrCode, 'Online'],
                        ['credit', User, 'Credit'],
                        ['split', Sparkles, 'Split'],
                      ].map(([method, Icon, label]) => (
                        <button
                          key={method}
                          type="button"
                          onClick={() => setPaymentMethod(method)}
                          className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border text-xs font-bold transition ${paymentMethod === method ? 'border-emerald-700 bg-emerald-700 text-white shadow-sm' : 'border-emerald-200 bg-white text-stone-700 hover:bg-emerald-50'}`}
                        >
                          <Icon className="h-5 w-5" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {paymentMethod === 'cash' ? (
                    <div className="rounded-xl border border-emerald-200 p-3">
                      <div className="flex justify-between text-sm"><span className="text-stone-500">Amount due</span><span className="font-bold text-stone-900">{formatCurrency(total)}</span></div>
                      <label className="mt-2 block text-[13px] font-bold text-stone-800">Amount received
                        <input type="number" min="0" value={amountPaid} onChange={(event) => setAmountPaid(event.target.value)} placeholder={total.toFixed(2)} className="mt-1 block min-h-12 w-full rounded-xl border border-stone-300 px-3 text-lg font-bold text-stone-900" />
                      </label>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {[['Exact', total], ...[50, 100, 500, 1000].map((step) => [null, Math.ceil(total / step) * step])]
                          .filter(([, value], index, list) => value > 0 && list.findIndex(([, other]) => other === value) === index)
                          .map(([label, value]) => (
                            <button key={value} type="button" onClick={() => setAmountPaid(value.toFixed(2))} className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${Number(amountPaid) === value ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-stone-200 text-stone-600 hover:bg-stone-50'}`}>
                              {label || formatCurrency(value)}
                            </button>
                          ))}
                      </div>
                      <p className={`mt-2 text-sm font-bold ${change >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{change >= 0 ? `Change: ${formatCurrency(change)}` : `Short by ${formatCurrency(-change)}`}</p>
                    </div>
                  ) : null}
                  {paymentMethod === 'online' ? (
                    <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                      <p className="mb-2 text-sm font-semibold text-blue-950">Show QR to customer</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="text-xs font-semibold text-blue-950 sm:col-span-2">
                          QR Type
                          <select
                            value={onlineQrType}
                            onChange={(event) => {
                              setOnlineQrType(event.target.value);
                              const qr = qrConfigForType(event.target.value, paymentQr);
                              if (qr) setQrModal({ ...qr, amount: total });
                            }}
                            className={`${inputClass} mt-1 bg-white`}
                          >
                            <option value="">Select QR type</option>
                            <option value="ESEWA_PHONEPAY">Esewa / PhonePay QR</option>
                            <option value="BANK">Bank QR</option>
                          </select>
                        </label>
                        <button
                          type="button"
                          disabled={!onlineQrType || !qrConfigForType(onlineQrType, paymentQr)?.imageUrl}
                          onClick={() => {
                            const qr = qrConfigForType(onlineQrType, paymentQr);
                            if (qr) setQrModal({ ...qr, amount: total });
                          }}
                          className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-900 disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2"
                        >
                          Show Selected QR
                        </button>
                      </div>
                      {!paymentQr?.esewa_phonepay_qr_url && !paymentQr?.bank_qr_url ? (
                        <p className="mt-2 text-xs font-medium text-blue-800">QR images are not configured yet. Admin can add them in Settings.</p>
                      ) : null}
                    </div>
                  ) : null}
                  {paymentMethod === 'split' ? (
                    <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
                      <p className="mb-2 text-sm font-semibold text-amber-950">Split payment allocation</p>
                      <div className="grid gap-2 sm:grid-cols-3">
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
                                setSplitQrAmount(Math.max(0, total - cash - Number(splitCreditAmount || 0)).toFixed(2));
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
                        <label className="text-xs font-semibold text-gray-700">
                          Credit Amount
                          <input type="number" min="0" value={splitCreditAmount} onChange={(event) => setSplitCreditAmount(event.target.value)} placeholder="0.00" className={`${inputClass} mt-1`} />
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
                  {paymentMethod === 'credit' ? (
                    <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900">
                      {customer.id ? `Credit will be recorded against ${customer.name}. The server enforces the customer credit limit.` : 'Select a saved customer above to use credit.'}
                    </div>
                  ) : null}

                  {error ? <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</div> : null}
                </div>

                <div className="grid grid-cols-[1fr_1.4fr] gap-2 border-t border-stone-100 px-5 py-4">
                  <button type="button" onClick={() => setPayOpen(false)} disabled={processingBill} className="min-h-12 rounded-xl border border-stone-300 bg-white text-sm font-bold text-stone-700 hover:bg-stone-50">Cancel</button>
                  <button type="button" onClick={completeBill} disabled={cartCount === 0 || processingBill} className="min-h-12 rounded-xl bg-emerald-700 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
                    {processingBill ? 'Completing…' : `Pay ${formatCurrency(total)}`}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
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
                  {/* Keyed by index: the same service can appear twice on one bill. */}
                  {(successBill.items || []).map((item, index) => (
                    <div key={`${item.item_id || item.id}-${index}`} className="flex justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{item.name}</p>
                        <p className="text-[10px] text-gray-500">Qty {item.quantity}</p>
                        {item.staff_name_snapshot ? <p className="text-[10px] text-gray-500">Staff: {item.staff_name_snapshot}</p> : null}
                      </div>
                      <span className="shrink-0 font-semibold">{formatCurrency(item.subtotal)}</span>
                    </div>
                  ))}
                </div>
                <div className="my-3 border-t border-dashed border-gray-300" />
                <div className="space-y-1">
                  <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(successBill.bill.subtotal)}</span></div>
                  {Number(successBill.bill.discount_amount || 0) - Number(successBill.bill.loyalty_discount || 0) > 0 ? (
                    <div className="flex justify-between"><span>Discount</span><span>-{formatCurrency(Number(successBill.bill.discount_amount) - Number(successBill.bill.loyalty_discount || 0))}</span></div>
                  ) : null}
                  {Number(successBill.bill.loyalty_discount || 0) > 0 ? (
                    <div className="flex justify-between text-pink-700"><span>Loyalty reward{successBill.bill.loyalty_reward_label ? ` · ${successBill.bill.loyalty_reward_label}` : ''}</span><span>-{formatCurrency(successBill.bill.loyalty_discount)}</span></div>
                  ) : null}
                  {successBill.bill.loyalty_progress?.map((program) => (
                    <div key={program.programId} className="flex justify-between text-xs text-pink-800"><span>{program.name}</span><span>{program.available > 0 ? `${program.rewardLabel} ready` : `${program.progress}/${program.requiredVisits}`}</span></div>
                  ))}
                  {successBill.bill.loyalty_claim_code ? (
                    <div className="flex justify-between text-xs text-pink-800"><span>Reward code (on receipt)</span><span className="font-mono font-bold tracking-widest">{successBill.bill.loyalty_claim_code}</span></div>
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-4">
      <div className="max-h-[calc(100vh-24px)] w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 shadow-2xl sm:p-5">
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
          <div className="relative aspect-square w-full max-w-72">
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
