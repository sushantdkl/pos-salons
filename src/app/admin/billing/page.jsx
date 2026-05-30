'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '@/components/layout/dashboard-layout';
import { CreditCard, MessageCircle, Minus, Plus, Printer, Receipt, Search, Trash2, Wallet } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';

const draftKey = 'salon_pos_bill_draft';

export default function AdminBilling() {
  const [services, setServices] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [cartServices, setCartServices] = useState([]);
  const [cartProducts, setCartProducts] = useState([]);
  const [customer, setCustomer] = useState({ id: '', name: 'Walk-in Customer', phone: '' });
  const [discountType, setDiscountType] = useState('amount');
  const [discountValue, setDiscountValue] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [amountPaid, setAmountPaid] = useState('');
  const [taxPercent, setTaxPercent] = useState(0);
  const [error, setError] = useState('');
  const [lastBill, setLastBill] = useState(null);

  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

  const fetchData = async () => {
    const [serviceResponse, productResponse, customerResponse, staffResponse] = await Promise.all([
      fetch('/api/admin/services', { headers: headers() }),
      fetch('/api/admin/salon-products', { headers: headers() }),
      fetch('/api/admin/customers', { headers: headers() }),
      fetch('/api/admin/employees', { headers: headers() })
    ]);
    if (serviceResponse.ok) setServices((await serviceResponse.json()).services?.filter((item) => item.is_active) || []);
    if (productResponse.ok) setProducts((await productResponse.json()).products?.filter((item) => item.status === 'active') || []);
    if (customerResponse.ok) setCustomers((await customerResponse.json()).customers || []);
    if (staffResponse.ok) {
      setStaff((await staffResponse.json()).employees?.filter((employee) =>
        employee.is_active && ['barber', 'stylist', 'beautician'].includes(employee.salon_role)
      ) || []);
    }
  };

  useEffect(() => {
    fetchData();
    const draft = localStorage.getItem(draftKey);
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        setCartServices(parsed.cartServices || []);
        setCartProducts(parsed.cartProducts || []);
        setCustomer(parsed.customer || { id: '', name: 'Walk-in Customer', phone: '' });
        setDiscountType(parsed.discountType || 'amount');
        setDiscountValue(parsed.discountValue || '');
        setPaymentMethod(parsed.paymentMethod || 'cash');
      } catch {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify({ cartServices, cartProducts, customer, discountType, discountValue, paymentMethod }));
  }, [cartServices, cartProducts, customer, discountType, discountValue, paymentMethod]);

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

  const addService = (service) => {
    setCartServices((items) => [...items, { ...service, cart_id: crypto.randomUUID(), staff_id: customer.preferred_stylist_id || '' }]);
  };

  const addProduct = (product) => {
    setCartProducts((items) => {
      const existing = items.find((item) => item.id === product.id);
      if (existing) return items.map((item) => item.id === product.id ? { ...item, quantity: Math.min(item.quantity + 1, product.current_stock) } : item);
      return [...items, { ...product, quantity: 1 }];
    });
  };

  const updateProductQty = (id, changeBy) => {
    setCartProducts((items) => items.map((item) => {
      if (item.id !== id) return item;
      const next = item.quantity + changeBy;
      return { ...item, quantity: Math.max(1, Math.min(next, item.current_stock)) };
    }));
  };

  const selectCustomer = (id) => {
    const selected = customers.find((item) => String(item.id) === String(id));
    if (selected) setCustomer({ id: selected.id, name: selected.name, phone: selected.phone || '', preferred_stylist_id: selected.preferred_stylist_id || '' });
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
      setError('Assign a barber, stylist, or beautician for every service.');
      return;
    }
    if (paymentMethod === 'cash' && amountPaid && Number(amountPaid) < total) {
      setError('Cash received is less than the bill total.');
      return;
    }

    const response = await fetch('/api/admin/billing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify({
        customer_id: customer.id || null,
        customer,
        services: cartServices.map((service) => ({ id: service.id, staff_id: service.staff_id })),
        products: cartProducts.map((product) => ({ id: product.id, quantity: product.quantity })),
        discount_type: discountType,
        discount_value: Number(discountValue || 0),
        tax_percent: Number(taxPercent || 0),
        payment_method: paymentMethod,
        amount_paid: Number(amountPaid || total)
      })
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || 'Could not complete bill');
      return;
    }
    setLastBill(data);
    printReceipt(data);
    setCartServices([]);
    setCartProducts([]);
    setDiscountValue('');
    setAmountPaid('');
    setCustomer({ id: '', name: 'Walk-in Customer', phone: '' });
    localStorage.removeItem(draftKey);
    fetchData();
  };

  const printReceipt = (billData = lastBill) => {
    if (!billData?.bill) return;
    const printWindow = window.open('', '', 'width=340,height=700');
    const rows = billData.items.map((item) => `<tr><td>${item.name} x${item.quantity}</td><td style="text-align:right">${formatCurrency(item.subtotal)}</td></tr>`).join('');
    printWindow.document.write(`
      <html><head><title>${billData.bill.bill_number}</title><style>
        body{font-family:Courier New,monospace;width:72mm;margin:0 auto;padding:8px;font-size:12px;color:#111}
        h1{text-align:center;font-size:16px;margin:0 0 4px}.meta{text-align:center;border-bottom:1px dashed #111;padding-bottom:6px;margin-bottom:6px}
        table{width:100%;border-collapse:collapse}td{padding:3px 0}.total{border-top:1px dashed #111;font-weight:bold;font-size:14px}
        .center{text-align:center;margin-top:8px}
      </style></head><body>
        <h1>The Haircut Salon</h1><div class="meta">${billData.bill.bill_number}<br/>${new Date().toLocaleString()}<br/>${billData.bill.customer_name || 'Walk-in Customer'}</div>
        <table>${rows}
          <tr><td>Subtotal</td><td style="text-align:right">${formatCurrency(billData.bill.subtotal)}</td></tr>
          <tr><td>Discount</td><td style="text-align:right">-${formatCurrency(billData.bill.discount_amount)}</td></tr>
          <tr><td>Tax</td><td style="text-align:right">${formatCurrency(billData.bill.tax)}</td></tr>
          <tr class="total"><td>Total</td><td style="text-align:right">${formatCurrency(billData.bill.grand_total)}</td></tr>
          <tr><td>Payment</td><td style="text-align:right">${billData.bill.payment_method}</td></tr>
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
    const message = `Receipt ${lastBill.bill.bill_number} from The Haircut Salon. Total: ${formatCurrency(lastBill.bill.grand_total)}. Thank you.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <AdminLayout>
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
        <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
          <div>
            <div className="mb-5 rounded-lg border border-gray-200 bg-white p-5">
              <h1 className="text-3xl font-semibold text-gray-950">Salon Billing</h1>
              <p className="mt-1 text-sm text-gray-600">Select customer, add services/products, assign stylist, and complete payment.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <select value={customer.id} onChange={(event) => selectCustomer(event.target.value)} className="rounded-lg border border-gray-300 px-4 py-3 text-gray-950">
                  <option value="">Walk-in customer</option>
                  {customers.map((item) => <option key={item.id} value={item.id}>{item.name} {item.phone ? `(${item.phone})` : ''}</option>)}
                </select>
                <input value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} placeholder="Customer name" className="rounded-lg border border-gray-300 px-4 py-3 text-gray-950" />
                <input value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} placeholder="Phone for receipt/reminder" className="rounded-lg border border-gray-300 px-4 py-3 text-gray-950" />
              </div>
            </div>

            <div className="mb-5 rounded-lg border border-gray-200 bg-white p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search services and products" className="w-full rounded-lg border border-gray-300 py-3 pl-10 pr-4 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <section className="rounded-lg border border-gray-200 bg-white p-4">
                <h2 className="mb-4 font-semibold text-gray-950">Services</h2>
                <div className="grid gap-3">
                  {filteredServices.map((service) => (
                    <button key={service.id} onClick={() => addService(service)} className="rounded-lg border border-gray-200 p-4 text-left hover:border-gray-900 hover:bg-gray-50">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-gray-950">{service.name}</p>
                          <p className="text-sm text-gray-500">{service.category} • {service.duration_minutes} min</p>
                        </div>
                        <span className="font-semibold text-gray-950">{formatCurrency(service.price)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-gray-200 bg-white p-4">
                <h2 className="mb-4 font-semibold text-gray-950">Products</h2>
                <div className="grid gap-3">
                  {filteredProducts.map((product) => (
                    <button key={product.id} disabled={product.current_stock <= 0} onClick={() => addProduct(product)} className="rounded-lg border border-gray-200 p-4 text-left hover:border-gray-900 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-gray-950">{product.name}</p>
                          <p className="text-sm text-gray-500">{product.category} • Stock {product.current_stock}</p>
                        </div>
                        <span className="font-semibold text-gray-950">{formatCurrency(product.selling_price)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </div>

          <aside className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xl font-semibold text-gray-950"><Receipt className="h-5 w-5" /> Current Bill</h2>
              <button onClick={() => { setCartServices([]); setCartProducts([]); }} className="text-sm font-medium text-red-600 hover:text-red-700">Clear</button>
            </div>
            {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}
            <div className="max-h-[42vh] space-y-3 overflow-y-auto pr-1">
              {cartServices.map((service) => (
                <div key={service.cart_id} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-950">{service.name}</p>
                      <p className="text-sm text-gray-500">{formatCurrency(service.price)}</p>
                    </div>
                    <button onClick={() => setCartServices((items) => items.filter((item) => item.cart_id !== service.cart_id))} className="p-1 text-red-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <select value={service.staff_id || ''} onChange={(event) => setCartServices((items) => items.map((item) => item.cart_id === service.cart_id ? { ...item, staff_id: event.target.value } : item))} className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-950">
                    <option value="">Assign staff member</option>
                    {staff.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name} ({employee.salon_role})</option>)}
                  </select>
                </div>
              ))}
              {cartProducts.map((product) => (
                <div key={product.id} className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                  <div>
                    <p className="font-medium text-gray-950">{product.name}</p>
                    <p className="text-sm text-gray-500">{formatCurrency(product.selling_price)} each</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => updateProductQty(product.id, -1)} className="rounded-md border border-gray-300 p-1"><Minus className="h-4 w-4" /></button>
                    <span className="w-6 text-center font-medium text-gray-950">{product.quantity}</span>
                    <button onClick={() => updateProductQty(product.id, 1)} className="rounded-md border border-gray-300 p-1"><Plus className="h-4 w-4" /></button>
                    <button onClick={() => setCartProducts((items) => items.filter((item) => item.id !== product.id))} className="p-1 text-red-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
              {cartServices.length === 0 && cartProducts.length === 0 && <div className="rounded-lg bg-gray-50 p-6 text-center text-gray-500">No items added yet.</div>}
            </div>

            <div className="mt-5 space-y-3 border-t border-gray-200 pt-4">
              <div className="grid grid-cols-[130px_1fr] gap-2">
                <select value={discountType} onChange={(event) => setDiscountType(event.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-gray-950">
                  <option value="amount">Discount Rs</option>
                  <option value="percentage">Discount %</option>
                </select>
                <input type="number" min="0" value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-gray-950" />
              </div>
              <input type="number" min="0" max="100" value={taxPercent} onChange={(event) => setTaxPercent(event.target.value)} placeholder="Tax percent" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-950" />
              <div className="space-y-2 rounded-lg bg-gray-50 p-4 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                <div className="flex justify-between text-green-700"><span>Discount</span><span>-{formatCurrency(safeDiscount)}</span></div>
                <div className="flex justify-between"><span>Tax</span><span>{formatCurrency(tax)}</span></div>
                <div className="flex justify-between border-t border-gray-200 pt-2 text-lg font-semibold text-gray-950"><span>Total</span><span>{formatCurrency(total)}</span></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['cash', Wallet, 'Cash'],
                  ['card', CreditCard, 'Card'],
                  ['online', MessageCircle, 'Online'],
                  ['split', Receipt, 'Split']
                ].map(([method, Icon, label]) => (
                  <button key={method} onClick={() => setPaymentMethod(method)} className={`rounded-lg border px-3 py-3 font-medium ${paymentMethod === method ? 'border-gray-950 bg-gray-950 text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                    <Icon className="mx-auto mb-1 h-5 w-5" />{label}
                  </button>
                ))}
              </div>
              {paymentMethod === 'cash' && (
                <div>
                  <input type="number" min="0" value={amountPaid} onChange={(event) => setAmountPaid(event.target.value)} placeholder="Cash received" className="w-full rounded-lg border border-gray-300 px-3 py-3 text-gray-950" />
                  {amountPaid && change >= 0 && <p className="mt-2 text-sm font-medium text-green-700">Change: {formatCurrency(change)}</p>}
                </div>
              )}
              <button onClick={completeBill} className="w-full rounded-lg bg-green-600 px-5 py-3 font-semibold text-white hover:bg-green-700">Confirm Payment</button>
              {lastBill && (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => printReceipt()} className="rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"><Printer className="mr-2 inline h-4 w-4" />Print</button>
                  <button onClick={sendDigitalReceipt} className="rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"><MessageCircle className="mr-2 inline h-4 w-4" />Receipt</button>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </AdminLayout>
  );
}
