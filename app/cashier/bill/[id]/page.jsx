'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, CreditCard, Wallet, Smartphone, Banknote,
  Tag, User, Phone, Receipt, Printer, Check, AlertCircle
} from 'lucide-react';

export default function BillDetailsPage({ params }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [order, setOrder] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  
  // Payment form state
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [discountReason, setDiscountReason] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerData, setCustomerData] = useState(null);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [customerFormData, setCustomerFormData] = useState({
    name: '',
    phone: '',
    address: '',
    age: ''
  });
  const [splitPaymentMode, setSplitPaymentMode] = useState(false);
  const [splitPayments, setSplitPayments] = useState([
    { method: 'cash', amount: 0 }
  ]);
  const [receiptData, setReceiptData] = useState(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [selectedQR, setSelectedQR] = useState({ image: '', title: '' });
  const [settings, setSettings] = useState({
    vat_percentage: 13,
    service_charge_percentage: 10,
    restaurant_name: 'Restaurant',
    restaurant_address: '',
    restaurant_phone: '',
    vat_number: '',
    pan_number: '',
    bank_qr_image: '',
    esewa_qr_image: ''
  });

  useEffect(() => {
    fetchOrderDetails();
    fetchSettings();
  }, [resolvedParams.id]);

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem('pos_token');
      const response = await fetch('/api/admin/settings', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setSettings(data.settings);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const fetchOrderDetails = async () => {
    try {
      const token = localStorage.getItem('pos_token');
      
      // Don't fetch if no valid token
      if (!token || token === 'null' || token === 'undefined') {
        router.push('/login');
        return;
      }
      
      const orderRes = await fetch(`/api/restaurant/orders/${resolvedParams.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (orderRes.ok) {
        const data = await orderRes.json();
        setOrder(data.order);
        setOrderItems(data.items || []);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error fetching order:', error);
      setLoading(false);
    }
  };

  const calculateBill = () => {
    const subtotal = order?.total_amount || 0;
    const taxRate = (settings.vat_percentage || 13) / 100;
    const serviceChargeRate = (settings.service_charge_percentage || 10) / 100;
    
    const taxAmount = subtotal * taxRate;
    const serviceCharge = subtotal * serviceChargeRate;
    const discountedAmount = Math.max(0, discountAmount);
    const finalAmount = subtotal + taxAmount + serviceCharge - discountedAmount;

    return {
      subtotal,
      taxAmount,
      serviceCharge,
      discountAmount: discountedAmount,
      finalAmount
    };
  };

  const searchCustomer = async (phone) => {
    if (!phone || phone.length < 10) {
      setCustomerData(null);
      return;
    }

    try {
      const token = localStorage.getItem('pos_token');
      const response = await fetch(`/api/admin/customers?phone=${phone}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        const customer = data.customers.find(c => c.phone === phone);
        if (customer) {
          setCustomerData(customer);
          setShowCustomerForm(false);
        } else {
          setCustomerData(null);
          if (paymentMethod === 'credit') {
            setShowCustomerForm(true);
            setCustomerFormData({ ...customerFormData, phone });
          }
        }
      }
    } catch (error) {
      console.error('Error searching customer:', error);
    }
  };

  const handlePhoneChange = (phone) => {
    setCustomerPhone(phone);
    if (phone.length >= 10) {
      searchCustomer(phone);
    } else {
      setCustomerData(null);
    }
  };

  const saveNewCustomer = async () => {
    try {
      const token = localStorage.getItem('pos_token');
      const response = await fetch('/api/admin/customers', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(customerFormData)
      });

      if (response.ok) {
        const data = await response.json();
        setCustomerData(data.customer);
        setShowCustomerForm(false);
        alert('Customer saved successfully!');
      } else {
        alert('Failed to save customer');
      }
    } catch (error) {
      console.error('Error saving customer:', error);
      alert('Failed to save customer');
    }
  };

  const addSplitPayment = () => {
    setSplitPayments([...splitPayments, { method: 'cash', amount: 0 }]);
  };

  const removeSplitPayment = (index) => {
    if (splitPayments.length > 1) {
      setSplitPayments(splitPayments.filter((_, i) => i !== index));
    }
  };

  const updateSplitPayment = (index, field, value) => {
    const updated = [...splitPayments];
    updated[index][field] = field === 'amount' ? parseFloat(value) || 0 : value;
    setSplitPayments(updated);
  };

  const validateSplitPayments = () => {
    const total = splitPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const { finalAmount } = calculateBill();
    return Math.abs(total - finalAmount) < 0.01;
  };

  const processPayment = async () => {
    try {
      setProcessing(true);
      const token = localStorage.getItem('pos_token');
      
      if (!token || token === 'null' || token === 'undefined') {
        alert('Session expired. Please login again.');
        router.push('/login');
        return;
      }
      
      const { finalAmount } = calculateBill();

      if (splitPaymentMode && !validateSplitPayments()) {
        alert('Split payment amounts must equal the total bill amount');
        setProcessing(false);
        return;
      }

      // Validate credit payment requires customer
      if (paymentMethod === 'credit' && !customerData) {
        alert('Please add customer details for credit payment');
        setProcessing(false);
        return;
      }

      const paymentData = {
        payment_method: splitPaymentMode ? 'split' : paymentMethod,
        amount_paid: finalAmount,
        discount_amount: discountAmount,
        discount_reason: discountReason,
        customer_name: customerData?.name || '',
        customer_phone: customerPhone,
        customer_id: customerData?.id || null,
        split_payments: splitPaymentMode ? splitPayments : null
      };

      const response = await fetch(`/api/restaurant/bills/${resolvedParams.id}/payment`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(paymentData)
      });

      const data = await response.json();

      if (response.ok) {
        setReceiptData(data.receipt);
        setShowReceipt(true);
        
        // Print thermal bill immediately
        printThermalBill(data.receipt);
      } else {
        alert(data.error || 'Failed to process payment');
      }

      setProcessing(false);
    } catch (error) {
      console.error('Payment error:', error);
      alert('Failed to process payment');
      setProcessing(false);
    }
  };

  const printThermalBill = (receipt) => {
    const printWindow = window.open('', '', 'width=300,height=600');
    
    const billHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Bill - ${receipt.order_id}</title>
        <style>
          @media print {
            @page {
              size: 72mm auto;
              margin: 0;
            }
          }
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            width: 72mm;
            max-width: 72mm;
            margin: 0 auto;
            font-family: 'Courier New', monospace;
            font-size: 9px;
            padding: 2mm;
            line-height: 1.2;
            background: white;
          }
          .header {
            text-align: center;
            margin-bottom: 3px;
            border-bottom: 1px dashed #000;
            padding-bottom: 3px;
          }
          .shop-name {
            font-size: 12px;
            font-weight: bold;
            margin-bottom: 1px;
          }
          .bill-info {
            margin: 3px 0;
            font-size: 8px;
          }
          .bill-info div {
            margin: 1px 0;
          }
          table {
            width: 100%;
            margin: 3px 0;
            border-collapse: collapse;
          }
          th {
            border-top: 1px dashed #000;
            border-bottom: 1px dashed #000;
            padding: 2px 0;
            text-align: left;
            font-size: 8px;
          }
          td {
            padding: 1px 0;
            font-size: 8px;
          }
          .item-name {
            width: 50%;
          }
          .item-qty {
            width: 15%;
            text-align: center;
          }
          .item-price {
            width: 17.5%;
            text-align: right;
          }
          .item-total {
            width: 17.5%;
            text-align: right;
          }
          .totals {
            border-top: 1px dashed #000;
            margin-top: 3px;
            padding-top: 2px;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            margin: 1px 0;
            font-size: 8px;
          }
          .grand-total {
            border-top: 1px dashed #000;
            border-bottom: 1px dashed #000;
            padding: 3px 0;
            margin: 3px 0;
            font-size: 10px;
            font-weight: bold;
          }
          .payment-info {
            margin: 3px 0;
            font-size: 8px;
          }
          .footer {
            text-align: center;
            margin-top: 4px;
            border-top: 1px dashed #000;
            padding-top: 3px;
            font-size: 8px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="shop-name">${settings.restaurant_name || 'RESTAURANT POS'}</div>
          ${settings.restaurant_address ? `<div style="font-size: 10px; margin-top: 3px;">${settings.restaurant_address}</div>` : ''}
          ${settings.restaurant_phone ? `<div style="font-size: 10px;">Tel: ${settings.restaurant_phone}</div>` : ''}
          ${settings.vat_number ? `<div style="font-size: 9px; margin-top: 2px;">VAT: ${settings.vat_number}</div>` : ''}
          ${settings.pan_number ? `<div style="font-size: 9px;">PAN: ${settings.pan_number}</div>` : ''}
          <div style="margin-top: 5px;">Tax Invoice</div>
        </div>

        <div class="bill-info">
          <div><strong>Receipt No:</strong> #${receipt.order_id.toString().padStart(6, '0')}</div>
          <div><strong>Date:</strong> ${new Date(receipt.processed_at).toLocaleString('en-NP', { timeZone: 'Asia/Kathmandu' })}</div>
          <div><strong>Table:</strong> ${receipt.table_number}</div>
          <div><strong>Cashier:</strong> ${receipt.processed_by}</div>
          ${receipt.customer_name ? `<div><strong>Customer:</strong> ${receipt.customer_name}</div>` : ''}
          ${receipt.customer_phone ? `<div><strong>Phone:</strong> ${receipt.customer_phone}</div>` : ''}
        </div>

        <table>
          <thead>
            <tr>
              <th class="item-name">Item</th>
              <th class="item-qty">Qty</th>
              <th class="item-price">Price</th>
              <th class="item-total">Total</th>
            </tr>
          </thead>
          <tbody>
            ${(receipt.items || []).map(item => `
              <tr>
                <td class="item-name">${item.item_name}</td>
                <td class="item-qty">${item.quantity}</td>
                <td class="item-price">Rs ${item.unit_price.toFixed(2)}</td>
                <td class="item-total">Rs ${item.subtotal.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="totals">
          <div class="total-row">
            <span>Subtotal:</span>
            <span>Rs ${receipt.subtotal.toFixed(2)}</span>
          </div>
          <div class="total-row">
            <span>Tax (${settings.vat_percentage}%):</span>
            <span>Rs ${receipt.tax_amount.toFixed(2)}</span>
          </div>
          <div class="total-row">
            <span>Service (${settings.service_charge_percentage}%):</span>
            <span>Rs ${receipt.service_charge.toFixed(2)}</span>
          </div>
          ${receipt.discount_amount > 0 ? `
          <div class="total-row">
            <span>Discount:</span>
            <span>- Rs ${receipt.discount_amount.toFixed(2)}</span>
          </div>
          ` : ''}
          <div class="total-row grand-total">
            <span>GRAND TOTAL:</span>
            <span>Rs ${receipt.final_amount.toFixed(2)}</span>
          </div>
        </div>

        <div class="payment-info">
          <div class="total-row">
            <span><strong>Payment:</strong></span>
            <span>${receipt.payment_method.toUpperCase()}</span>
          </div>
          ${receipt.split_payments ? receipt.split_payments.map(sp => `
          <div class="total-row">
            <span>${sp.method.toUpperCase()}:</span>
            <span>Rs ${sp.amount.toFixed(2)}</span>
          </div>
          `).join('') : ''}
          <div class="total-row">
            <span>Amount Paid:</span>
            <span>Rs ${receipt.amount_paid.toFixed(2)}</span>
          </div>
          ${receipt.change > 0 ? `
          <div class="total-row">
            <span>Change:</span>
            <span>Rs ${receipt.change.toFixed(2)}</span>
          </div>
          ` : ''}
        </div>

        <div class="footer">
          <div>Thank you for your visit!</div>
          <div>Please come again</div>
          ${settings.vat_number ? `<div style="margin-top: 5px;">VAT No: ${settings.vat_number}</div>` : ''}
          ${settings.pan_number ? `<div>PAN No: ${settings.pan_number}</div>` : ''}
        </div>

        <div style="height: 10mm;"></div>

        <script>
          // Prevent double printing
          let printed = false;
          
          // Single print trigger
          window.onload = function() {
            if (!printed) {
              printed = true;
              window.focus();
              window.print();
              // Close after user finishes printing
              setTimeout(() => {
                window.close();
              }, 500);
            }
          };
        </script>
      </body>
      </html>
    `;
    
    printWindow.document.write(billHTML);
    printWindow.document.close();
    printWindow.focus();
  };

  const printReceipt = () => {
    if (receiptData) {
      printThermalBill(receiptData);
    } else {
      window.print();
    }
  };

  const formatCurrency = (amount) => {
    return `Rs ${amount?.toFixed(2) || '0.00'}`;
  };

  const isOrderCompleted = order?.status === 'completed';
  const canProcessPayment = order && ['served', 'pending', 'preparing', 'ready'].includes(order.status);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-800 text-lg">Loading bill details...</p>
        </div>
      </div>
    );
  }

  if (showReceipt && receiptData) {
    return (
      <>
        <style jsx global>{`
          @media print {
            body { margin: 0; padding: 20px; }
            @page { margin: 10mm; }
            .print\\:hidden { display: none !important; }
            .print\\:border-0 { border: 0 !important; }
          }
        `}</style>
        <div className="min-h-screen bg-white p-8">
          <div className="max-w-2xl mx-auto">
            <div className="print:hidden mb-6 flex space-x-4">
              <button
                onClick={printReceipt}
                className="flex-1 flex items-center justify-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-semibold"
              >
                <Printer className="w-5 h-5" />
                <span>Print Receipt</span>
              </button>
              <button
                onClick={() => router.push('/cashier')}
                className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all font-semibold"
              >
                Back to Dashboard
              </button>
            </div>

            {/* Receipt */}
            <div className="bg-white border-2 border-gray-300 rounded-lg p-8 print:border-0">
              <div className="text-center border-b-2 border-dashed border-gray-300 pb-6 mb-6">
                <h1 className="text-3xl font-bold text-black mb-2">{settings.restaurant_name || 'Restaurant'}</h1>
              <p className="text-black">{settings.restaurant_address || 'Address'}</p>
              <p className="text-black">Tel: {settings.restaurant_phone || 'Phone'}</p>
              <p className="text-black mt-2">TAX INVOICE</p>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-black">Receipt #:</p>
                <p className="font-bold text-black">#{receiptData.order_id.toString().padStart(6, '0')}</p>
              </div>
              <div>
                <p className="text-black">Date:</p>
                <p className="font-bold text-black">{new Date(receiptData.processed_at).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-black">Table:</p>
                <p className="font-bold text-black">{receiptData.table_number}</p>
              </div>
              <div>
                <p className="text-black">Cashier:</p>
                <p className="font-bold text-black">{receiptData.processed_by}</p>
              </div>
            </div>

            {(receiptData.customer_name || receiptData.customer_phone) && (
              <div className="mb-6 text-sm">
                {receiptData.customer_name && <p className="text-black">Customer: <span className="font-bold text-black">{receiptData.customer_name}</span></p>}
                {receiptData.customer_phone && <p className="text-black">Phone: <span className="font-bold text-black">{receiptData.customer_phone}</span></p>}
              </div>
            )}

            <table className="w-full mb-6">
              <thead className="border-b-2 border-gray-300">
                <tr>
                  <th className="text-left py-2 text-black">Item</th>
                  <th className="text-center py-2 text-black">Qty</th>
                  <th className="text-right py-2 text-black">Price</th>
                  <th className="text-right py-2 text-black">Total</th>
                </tr>
              </thead>
              <tbody>
                {(receiptData.items || []).map((item, index) => (
                  <tr key={index} className="border-b border-gray-200">
                    <td className="py-3 text-black">{item.item_name}</td>
                    <td className="text-center py-3 text-black">{item.quantity}</td>
                    <td className="text-right py-3 text-black">{formatCurrency(item.unit_price)}</td>
                    <td className="text-right py-3 text-black">{formatCurrency(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="border-t-2 border-gray-300 pt-4 space-y-2">
              <div className="flex justify-between text-lg text-black">
                <span>Subtotal:</span>
                <span className="font-semibold">{formatCurrency(receiptData.subtotal)}</span>
              </div>
              <div className="flex justify-between text-black">
                <span>Tax ({settings.vat_percentage}%):</span>
                <span>{formatCurrency(receiptData.tax_amount)}</span>
              </div>
              <div className="flex justify-between text-black">
                <span>Service Charge ({settings.service_charge_percentage}%):</span>
                <span>{formatCurrency(receiptData.service_charge)}</span>
              </div>
              {receiptData.discount_amount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Discount:</span>
                  <span>- {formatCurrency(receiptData.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-2xl font-bold pt-2 border-t-2 border-gray-300 text-black">
                <span>Total:</span>
                <span>{formatCurrency(receiptData.final_amount)}</span>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t-2 border-dashed border-gray-300">
              <div className="flex justify-between text-lg mb-2 text-black">
                <span>Payment Method:</span>
                <span className="font-semibold uppercase">{receiptData.payment_method}</span>
              </div>
              {receiptData.split_payments && (
                <div className="mt-2 text-sm text-black">
                  {receiptData.split_payments.map((sp, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span className="uppercase">{sp.method}:</span>
                      <span>{formatCurrency(sp.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-between text-lg mt-2 text-black">
                <span>Amount Paid:</span>
                <span className="font-semibold">{formatCurrency(receiptData.amount_paid)}</span>
              </div>
              {receiptData.change > 0 && (
                <div className="flex justify-between text-lg text-black font-bold">
                  <span>Change:</span>
                  <span>{formatCurrency(receiptData.change)}</span>
                </div>
              )}
            </div>

            <div className="text-center mt-8 pt-6 border-t border-gray-200">
              <p className="text-lg font-semibold text-black">Thank you for dining with us!</p>
              <p className="text-black mt-2">Please visit again</p>
              {settings.vat_number && <p className="text-sm text-black mt-4">VAT No: {settings.vat_number}</p>}
              {settings.pan_number && <p className="text-sm text-black">PAN No: {settings.pan_number}</p>}
            </div>
          </div>
        </div>
      </div>
      </>
    );
  }

  const bill = calculateBill();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => router.push('/cashier')}
            className="flex items-center space-x-2 text-gray-800 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-semibold">Back to Dashboard</span>
          </button>
          <h1 className="text-3xl font-bold text-gray-800">{isOrderCompleted ? 'Order Details' : 'Process Payment'}</h1>
        </div>

        {/* Order Status Banner */}
        {isOrderCompleted && (
          <div className="mb-6 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl shadow-xl p-6">
            <div className="flex items-center space-x-4">
              <div className="bg-white/20 p-3 rounded-full">
                <Check className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Order Completed</h3>
                <p className="text-purple-100">This order has already been paid and completed. You can only view the details.</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Order Details */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-black mb-4 flex items-center">
                <Receipt className="w-6 h-6 mr-2 text-blue-600" />
                Order Details
              </h2>
              
              <div className="space-y-3 mb-6">
                <div className="flex justify-between">
                  <span className="text-black">Order ID:</span>
                  <span className="font-bold text-black">#{order?.id.toString().padStart(4, '0')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-black">Table:</span>
                  <span className="font-bold text-black">{order?.table_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-black">Status:</span>
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                    {order?.status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-black">Time:</span>
                  <span className="font-semibold text-black">{new Date(order?.created_at).toLocaleString()}</span>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <h3 className="font-bold text-black mb-3">Items</h3>
                <div className="space-y-2">
                  {orderItems.map((item, index) => (
                    <div key={index} className="flex justify-between items-center py-2 border-b border-gray-100">
                      <div className="flex-1">
                        <p className="font-semibold text-black">{item.item_name}</p>
                        <p className="text-sm text-black">Qty: {item.quantity} × {formatCurrency(item.price)}</p>
                      </div>
                      <span className="font-bold text-black">
                        {formatCurrency(item.quantity * item.price)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bill Summary */}
            <div className="bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl shadow-lg p-6 text-white">
              <h2 className="text-xl font-bold mb-4">Bill Summary</h2>
              <div className="space-y-3">
                <div className="flex justify-between text-lg">
                  <span>Subtotal:</span>
                  <span className="font-semibold">{formatCurrency(bill.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-100">Tax ({settings.vat_percentage}%):</span>
                  <span>{formatCurrency(bill.taxAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-100">Service Charge ({settings.service_charge_percentage}%):</span>
                  <span>{formatCurrency(bill.serviceCharge)}</span>
                </div>
                {bill.discountAmount > 0 && (
                  <div className="flex justify-between text-yellow-300">
                    <span>Discount:</span>
                    <span>- {formatCurrency(bill.discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-2xl font-bold pt-3 border-t-2 border-white/30">
                  <span>Total:</span>
                  <span>{formatCurrency(bill.finalAmount)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Payment Form */}
          <div className="space-y-6">
            {isOrderCompleted ? (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
                  <Check className="w-6 h-6 mr-2 text-green-600" />
                  Payment Completed
                </h2>
                <div className="text-center py-12">
                  <div className="bg-green-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check className="w-12 h-12 text-green-600" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900 mb-2">Payment Processed</p>
                  <p className="text-gray-600">This order has been completed and paid.</p>
                  <div className="mt-8 space-y-2">
                    <button
                      onClick={() => router.push('/cashier')}
                      className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-semibold"
                    >
                      Back to Dashboard
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
                  <CreditCard className="w-6 h-6 mr-2 text-blue-600" />
                  Payment Details
                </h2>

              {/* Payment Method Dropdown */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none text-gray-900 font-semibold"
                >
                  <option value="cash">Cash</option>
                  <option value="qr">QR Payment (eSewa/Bank)</option>
                  <option value="card">Card</option>
                  <option value="credit">Credit (Customer Account)</option>
                </select>
              </div>

              {/* QR Payment Options */}
              {paymentMethod === 'qr' && (
                <div className="mb-6 p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
                  <h3 className="font-semibold text-gray-900 mb-4 text-center">Scan to Pay</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {settings.esewa_qr_image && (
                      <div className="text-center cursor-pointer" onClick={() => {
                        setSelectedQR({ image: settings.esewa_qr_image, title: 'eSewa QR Code' });
                        setShowQRModal(true);
                      }}>
                        <p className="text-sm font-semibold text-gray-900 mb-2">eSewa</p>
                        <img 
                          src={settings.esewa_qr_image} 
                          alt="eSewa QR" 
                          className="w-full max-w-[200px] mx-auto border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:shadow-lg transition-all"
                        />
                        <p className="text-xs text-blue-600 mt-1">Click to enlarge</p>
                      </div>
                    )}
                    {settings.bank_qr_image && (
                      <div className="text-center cursor-pointer" onClick={() => {
                        setSelectedQR({ image: settings.bank_qr_image, title: 'Bank QR Code' });
                        setShowQRModal(true);
                      }}>
                        <p className="text-sm font-semibold text-gray-900 mb-2">Bank QR</p>
                        <img 
                          src={settings.bank_qr_image} 
                          alt="Bank QR" 
                          className="w-full max-w-[200px] mx-auto border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:shadow-lg transition-all"
                        />
                        <p className="text-xs text-blue-600 mt-1">Click to enlarge</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Customer Search for Credit Payment */}
              {paymentMethod === 'credit' && (
                <div className="mb-6 p-4 bg-yellow-50 rounded-lg border-2 border-yellow-200">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2 flex items-center">
                        <Phone className="w-4 h-4 mr-2" />
                        Customer Phone Number *
                      </label>
                      <input
                        type="tel"
                        value={customerPhone}
                        onChange={(e) => handlePhoneChange(e.target.value)}
                        className="w-full px-4 py-3 border-2 border-yellow-300 rounded-lg focus:border-yellow-500 focus:outline-none text-gray-900"
                        placeholder="Enter phone number to search"
                        required
                      />
                    </div>

                    {customerData && (
                      <div className="p-3 bg-green-50 border-2 border-green-300 rounded-lg">
                        <p className="text-sm font-semibold text-green-800 mb-1">✓ Customer Found</p>
                        <p className="text-black font-semibold">{customerData.name}</p>
                        <p className="text-sm text-black">{customerData.phone}</p>
                        {customerData.address && <p className="text-sm text-black">{customerData.address}</p>}
                      </div>
                    )}

                    {!customerData && customerPhone.length >= 10 && (
                      <div className="p-3 bg-red-50 border-2 border-red-300 rounded-lg">
                        <p className="text-sm font-semibold text-red-800 mb-2">Customer not found</p>
                        <button
                          onClick={() => setShowCustomerForm(true)}
                          className="text-sm px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-semibold"
                        >
                          + Add New Customer
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Optional Customer Info for Cash/Online/Card */}
              {paymentMethod !== 'credit' && (
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2 flex items-center">
                      <Phone className="w-4 h-4 mr-2" />
                      Phone Number (Optional)
                    </label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none text-gray-900"
                      placeholder="Enter phone number"
                    />
                  </div>
                  {customerData && (
                    <div className="p-3 bg-blue-50 border-2 border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-800 font-semibold">Customer: {customerData.name}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Discount */}
              <div className="space-y-4 mb-6 p-4 bg-yellow-50 rounded-lg border-2 border-yellow-200">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2 flex items-center">
                    <Tag className="w-4 h-4 mr-2" />
                    Discount Amount
                  </label>
                  <input
                    type="number"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-3 border-2 border-yellow-300 rounded-lg focus:border-yellow-500 focus:outline-none text-gray-900"
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                </div>
                {discountAmount > 0 && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      Discount Reason
                    </label>
                    <input
                      type="text"
                      value={discountReason}
                      onChange={(e) => setDiscountReason(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-yellow-300 rounded-lg focus:border-yellow-500 focus:outline-none text-gray-900"
                      placeholder="e.g., Senior citizen, Promotional offer"
                      required
                    />
                  </div>
                )}
              </div>

              {/* Split Payment Toggle */}
              <div className="mb-6">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={splitPaymentMode}
                    onChange={(e) => setSplitPaymentMode(e.target.checked)}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="font-semibold text-gray-900">Split Payment</span>
                </label>
              </div>

              {/* Split Payment */}
              {splitPaymentMode && (
                <div className="space-y-4 mb-6">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-semibold text-gray-900">
                      Split Payment Methods
                    </label>
                    <button
                      onClick={addSplitPayment}
                      className="text-sm px-3 py-1 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors font-semibold"
                    >
                      + Add Method
                    </button>
                  </div>
                  
                  {splitPayments.map((sp, index) => (
                    <div key={index} className="flex space-x-2">
                      <select
                        value={sp.method}
                        onChange={(e) => updateSplitPayment(index, 'method', e.target.value)}
                        className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none text-gray-900"
                      >
                        <option value="cash">Cash</option>
                        <option value="online">Online</option>
                        <option value="card">Card</option>
                        <option value="credit">Credit</option>
                      </select>
                      <input
                        type="number"
                        value={sp.amount}
                        onChange={(e) => updateSplitPayment(index, 'amount', e.target.value)}
                        className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none text-gray-900"
                        placeholder="Amount"
                        min="0"
                        step="0.01"
                      />
                      {splitPayments.length > 1 && (
                        <button
                          onClick={() => removeSplitPayment(index)}
                          className="px-4 py-3 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  
                  {splitPaymentMode && (
                    <div className="p-3 bg-gray-100 rounded-lg">
                      <div className="flex justify-between text-sm">
                        <span>Split Total:</span>
                        <span className="font-bold">
                          {formatCurrency(splitPayments.reduce((sum, p) => sum + (p.amount || 0), 0))}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm mt-1">
                        <span>Required:</span>
                        <span className="font-bold">{formatCurrency(bill.finalAmount)}</span>
                      </div>
                      {!validateSplitPayments() && (
                        <p className="text-xs text-red-600 mt-2 flex items-center">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          Split amounts must equal total
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Process Payment Button */}
              <button
                onClick={processPayment}
                disabled={processing || (splitPaymentMode && !validateSplitPayments()) || !canProcessPayment}
                className="w-full py-4 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl hover:from-green-600 hover:to-green-700 transition-all font-bold text-lg shadow-xl hover:shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {processing ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-6 h-6" />
                    <span>Process Payment - {formatCurrency(bill.finalAmount)}</span>
                  </>
                )}
              </button>
            </div>
            )}
          </div>
        </div>
      </div>

      {/* Customer Form Modal */}
      {showCustomerForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-black mb-4">Add New Customer</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-black mb-2">
                  Name *
                </label>
                <input
                  type="text"
                  value={customerFormData.name}
                  onChange={(e) => setCustomerFormData({...customerFormData, name: e.target.value})}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-gray-900"
                  placeholder="Customer name"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-black mb-2">
                  Phone *
                </label>
                <input
                  type="tel"
                  value={customerFormData.phone}
                  onChange={(e) => setCustomerFormData({...customerFormData, phone: e.target.value})}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-gray-900"
                  placeholder="Phone number"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-black mb-2">
                  Address (Optional)
                </label>
                <input
                  type="text"
                  value={customerFormData.address}
                  onChange={(e) => setCustomerFormData({...customerFormData, address: e.target.value})}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-gray-900"
                  placeholder="Customer address"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-black mb-2">
                  Age (Optional)
                </label>
                <input
                  type="number"
                  value={customerFormData.age}
                  onChange={(e) => setCustomerFormData({...customerFormData, age: e.target.value})}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-gray-900"
                  placeholder="Customer age"
                  min="0"
                />
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setShowCustomerForm(false)}
                className="flex-1 px-4 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={saveNewCustomer}
                disabled={!customerFormData.name || !customerFormData.phone}
                className="flex-1 px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save Customer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {showQRModal && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setShowQRModal(false)}
        >
          <div 
            className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-black">{selectedQR.title}</h3>
              <button
                onClick={() => setShowQRModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
              >
                ×
              </button>
            </div>
            
            <div className="flex justify-center">
              <img 
                src={selectedQR.image} 
                alt={selectedQR.title}
                className="max-w-full max-h-[70vh] border-4 border-blue-500 rounded-lg shadow-lg"
              />
            </div>

            <p className="text-center text-sm text-gray-600 mt-4">
              Scan this QR code to complete payment
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
