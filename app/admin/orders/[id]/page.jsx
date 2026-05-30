'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin/admin-layout';
import { ArrowLeft, Printer, Clock, User, Phone, CreditCard, MapPin } from 'lucide-react';

export default function OrderView() {
  const params = useParams();
  const router = useRouter();
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params.id) {
      fetchOrderDetails();
    }
  }, [params.id]);

  const fetchOrderDetails = async () => {
    try {
      const token = localStorage.getItem('pos_token');
      const response = await fetch(`/api/admin/orders/${params.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setOrder(data.order);
        setItems(data.items);
      }
    } catch (error) {
      console.error('Error fetching order:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      preparing: 'bg-blue-100 text-blue-800 border-blue-300',
      ready: 'bg-green-100 text-green-800 border-green-300',
      completed: 'bg-gray-100 text-gray-800 border-gray-300',
      cancelled: 'bg-red-100 text-red-800 border-red-300'
    };
    return colors[status] || 'bg-gray-100 text-gray-800 border-gray-300';
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-xl text-gray-900">Loading order details...</div>
        </div>
      </AdminLayout>
    );
  }

  if (!order) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-xl text-gray-900">Order not found</div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-8 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-6 h-6 text-gray-900" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Order #{order.order_number}</h1>
              <p className="text-gray-700 mt-1">
                {new Date(order.created_at).toLocaleString()}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className={`px-4 py-2 rounded-lg border font-semibold ${getStatusColor(order.status)}`}>
              {order.status?.toUpperCase()}
            </span>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Printer className="w-5 h-5" />
              Print
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="p-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Order Items */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-xl font-bold text-gray-900">Order Items</h2>
              </div>
              <div className="p-6">
                <table className="w-full">
                  <thead className="border-b border-gray-200">
                    <tr>
                      <th className="text-left pb-3 font-semibold text-gray-900">Item</th>
                      <th className="text-center pb-3 font-semibold text-gray-900">Qty</th>
                      <th className="text-right pb-3 font-semibold text-gray-900">Price</th>
                      <th className="text-right pb-3 font-semibold text-gray-900">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td className="py-4">
                          <div>
                            <div className="font-medium text-gray-900">{item.menu_item_name}</div>
                            {item.special_instructions && (
                              <div className="text-sm text-gray-700 mt-1">
                                Note: {item.special_instructions}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-4 text-center text-gray-900">{item.quantity}</td>
                        <td className="py-4 text-right text-gray-900">Rs {((item.subtotal || 0) / (item.quantity || 1)).toFixed(2)}</td>
                        <td className="py-4 text-right font-semibold text-gray-900">
                          Rs {(item.subtotal || 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Order Details */}
          <div className="space-y-6">
            {/* Customer Info */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Customer Details</h3>
              <div className="space-y-3">
                {order.customer_name && (
                  <div className="flex items-center gap-3">
                    <User className="w-5 h-5 text-gray-700" />
                    <div>
                      <div className="text-sm text-gray-700">Name</div>
                      <div className="font-medium text-gray-900">{order.customer_name}</div>
                    </div>
                  </div>
                )}
                {order.customer_phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="w-5 h-5 text-gray-700" />
                    <div>
                      <div className="text-sm text-gray-700">Phone</div>
                      <div className="font-medium text-gray-900">{order.customer_phone}</div>
                    </div>
                  </div>
                )}
                {order.table_number && (
                  <div className="flex items-center gap-3">
                    <MapPin className="w-5 h-5 text-gray-700" />
                    <div>
                      <div className="text-sm text-gray-700">Table</div>
                      <div className="font-medium text-gray-900">{order.table_number}</div>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-gray-700" />
                  <div>
                    <div className="text-sm text-gray-700">Order Type</div>
                    <div className="font-medium text-gray-900 capitalize">{order.order_type || 'dine-in'}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Summary */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Payment Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-gray-900">
                  <span>Subtotal</span>
                  <span className="font-medium">Rs {(order.total || 0).toFixed(2)}</span>
                </div>
                {order.discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span className="font-medium">- Rs {(order.discount || 0).toFixed(2)}</span>
                  </div>
                )}
                {order.tax > 0 && (
                  <div className="flex justify-between text-gray-900">
                    <span>Tax</span>
                    <span className="font-medium">Rs {(order.tax || 0).toFixed(2)}</span>
                  </div>
                )}
                <div className="pt-3 border-t border-gray-200 flex justify-between text-lg font-bold text-gray-900">
                  <span>Total</span>
                  <span>Rs {(order.final_total || 0).toFixed(2)}</span>
                </div>
              </div>

              {/* Payment Method */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-gray-700">
                    <CreditCard className="w-5 h-5" />
                    <span className="font-medium">Payment Method</span>
                  </div>
                  <span className="font-semibold text-gray-900 capitalize">
                    {order.payment_method || 'Cash'}
                  </span>
                </div>
                {order.amount_paid > 0 && (
                  <>
                    <div className="flex justify-between mt-3 text-gray-900">
                      <span>Amount Paid</span>
                      <span className="font-medium">Rs {(order.amount_paid || 0).toFixed(2)}</span>
                    </div>
                    {order.change_amount > 0 && (
                      <div className="flex justify-between mt-2 text-gray-900">
                        <span>Change</span>
                        <span className="font-medium">Rs {(order.change_amount || 0).toFixed(2)}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Order Notes */}
            {order.notes && (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-3">Order Notes</h3>
                <p className="text-gray-800">{order.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
