'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { ArrowLeft, Plus, Clock, DollarSign, User, MapPin, Phone, Check, X, RefreshCw, ChefHat } from 'lucide-react'

export default function OrderDetailsPage() {
  const { user, apiCall } = useAuth()
  const router = useRouter()
  const params = useParams()
  const { addToast } = useToast()

  const [order, setOrder] = useState(null)
  const [orderItems, setOrderItems] = useState([])
  const [kots, setKots] = useState([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    fetchOrderDetails()
    const interval = setInterval(fetchOrderDetails, 10000) // Refresh every 10s
    return () => clearInterval(interval)
  }, [params.id])

  const fetchOrderDetails = async () => {
    try {
      const res = await apiCall(`/api/restaurant/orders/${params.id}`)
      if (res.ok) {
        const data = await res.json()
        setOrder(data.order)
        setOrderItems(data.items || [])
        setKots(data.kots || [])
      } else {
        throw new Error('Failed to fetch order')
      }
    } catch (error) {
      console.error('Error fetching order:', error)
      addToast({ title: 'Error', description: 'Failed to load order', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const serveOrder = async () => {
    if (!confirm('Mark this order as served? Customer can still order more items.')) {
      return
    }
    
    setUpdating(true)
    try {
      const res = await apiCall(`/api/restaurant/orders/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'served' })
      })

      if (res.ok) {
        addToast({ 
          title: '✓ Success', 
          description: 'Order marked as served', 
          variant: 'success' 
        })
        fetchOrderDetails()
      } else {
        const error = await res.json()
        throw new Error(error.error || 'Failed to serve order')
      }
    } catch (error) {
      console.error('Error serving order:', error)
      addToast({ title: '✗ Error', description: error.message, variant: 'error' })
    } finally {
      setUpdating(false)
    }
  }

  const completeOrder = async () => {
    if (!confirm('Mark this order as ready for payment? This will free the table and notify the cashier that customer is ready to pay.')) {
      return
    }
    
    setUpdating(true)
    try {
      const res = await apiCall(`/api/restaurant/orders/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'served' })
      })

      if (res.ok) {
        addToast({ 
          title: '✓ Success', 
          description: 'Order ready for payment. Table freed. Cashier will complete payment.', 
          variant: 'success' 
        })
        setTimeout(() => router.push('/waiter'), 500)
      } else {
        const error = await res.json()
        throw new Error(error.error || 'Failed to mark order as served')
      }
    } catch (error) {
      console.error('Error marking order as served:', error)
      addToast({ title: '✗ Error', description: error.message, variant: 'error' })
    } finally {
      setUpdating(false)
    }
  }

  const cancelOrder = async () => {
    if (!confirm('Are you sure you want to cancel this order?')) {
      return
    }
    
    setUpdating(true)
    try {
      const res = await apiCall(`/api/restaurant/orders/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' })
      })

      if (res.ok) {
        addToast({ 
          title: 'Success', 
          description: 'Order cancelled', 
          variant: 'success' 
        })
        router.push('/waiter')
      } else {
        throw new Error('Failed to cancel order')
      }
    } catch (error) {
      console.error('Error cancelling order:', error)
      addToast({ title: 'Error', description: error.message, variant: 'error' })
    } finally {
      setUpdating(false)
    }
  }

  const getStatusColor = (status) => {
    if (status === 'completed') return 'bg-purple-100 text-purple-800 border-purple-500'
    if (status === 'served') return 'bg-blue-100 text-blue-800 border-blue-500'
    if (status === 'ready') return 'bg-green-100 text-green-800 border-green-500'
    if (status === 'cancelled') return 'bg-red-100 text-red-800 border-red-500'
    return 'bg-yellow-100 text-yellow-800 border-yellow-500'
  }

  const getStatusText = (status) => {
    if (status === 'completed') return '✓ Completed'
    if (status === 'served') return '🍽 Served'
    if (status === 'ready') return '✓ Ready'
    if (status === 'cancelled') return '✗ Cancelled'
    if (status === 'pending') return '⏱ Preparing'
    return '⏱ Active'
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-800">Loading order...</p>
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
        <Card className="shadow-xl">
          <CardContent className="py-12 text-center">
            <p className="text-gray-800 text-lg">Order not found</p>
            <Button className="mt-6" onClick={() => router.back()}>Go Back</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const isActive = order.status === 'pending' || order.status === 'ready' || order.status === 'served'
  const isCompleted = order.status === 'completed'
  const isReady = order.status === 'ready'
  const isServed = order.status === 'served'

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white border-b-4 border-indigo-800 sticky top-0 z-10 shadow-2xl">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="sm" onClick={() => router.back()} className="bg-white/10 border-white/20 text-white hover:bg-white/20">
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold">{order.order_number}</h1>
                <p className="text-sm text-blue-100">
                  {new Date(order.created_at).toLocaleString()}
                </p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <div className={`px-4 py-2 rounded-xl font-bold text-lg shadow-lg ${getStatusColor(order.status)}`}>
                {getStatusText(order.status)}
              </div>
              <Button onClick={fetchOrderDetails} variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Order Summary Card */}
            <Card className="shadow-xl border-2 border-blue-100">
              <CardContent className="pt-8">
                <div className="grid grid-cols-3 gap-6 text-center">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-2xl">
                    <Clock className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-800 mb-1">Duration</p>
                    <p className="text-2xl font-bold text-blue-900">
                      {Math.round((new Date() - new Date(order.created_at)) / 60000)} min
                    </p>
                  </div>
                  <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-2xl">
                    <DollarSign className="w-8 h-8 text-green-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-800 mb-1">Total Amount</p>
                    <p className="text-2xl font-bold text-green-900">₹{order.total_amount}</p>
                  </div>
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-2xl">
                    <ChefHat className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-800 mb-1">Items</p>
                    <p className="text-2xl font-bold text-purple-900">{orderItems.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Order Items */}
            <Card className="shadow-xl border-2 border-blue-100">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b-2">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-xl">Order Items ({orderItems.length})</CardTitle>
                  {isActive && (
                    <Button size="sm" onClick={() => router.push(`/waiter/new-order?order=${order.order_id}`)} className="shadow-md">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Items
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {orderItems.map((item, index) => (
                    <div key={index} className="bg-gradient-to-r from-gray-50 to-white p-4 rounded-xl border-2 border-gray-100 hover:border-blue-200 transition-all">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-bold text-lg text-gray-900">{item.item_name}</p>
                          {item.special_instructions && (
                            <p className="text-sm text-orange-600 italic mt-1 bg-orange-50 px-3 py-1 rounded-lg inline-block">
                              📝 {item.special_instructions}
                            </p>
                          )}
                          <p className="text-sm text-gray-800 mt-2">
                            ₹{item.price} × {item.quantity}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-2xl text-green-600">
                            ₹{item.price * item.quantity}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 pt-6 border-t-2 border-dashed">
                  <div className="flex justify-between items-center bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-xl">
                    <span className="text-xl font-bold text-gray-900">Total Amount:</span>
                    <span className="text-3xl font-bold text-green-600">₹{order.total_amount}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Table/Customer Info */}
            <Card className="shadow-xl border-2 border-blue-100">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b-2">
                <CardTitle>Order Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <div className="bg-gradient-to-r from-purple-50 to-purple-100 p-4 rounded-xl">
                  <div className="flex items-center gap-3">
                    <MapPin className="w-6 h-6 text-purple-600" />
                    <div>
                      <p className="text-xs text-purple-600 font-medium uppercase">Location</p>
                      <p className="text-lg font-bold text-purple-900">
                        {order.order_type === 'dine-in' 
                          ? `Table ${order.table_number}` 
                          : 'Takeaway'}
                      </p>
                    </div>
                  </div>
                </div>

                {order.customer_name && (
                  <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-4 rounded-xl">
                    <div className="flex items-center gap-3">
                      <User className="w-6 h-6 text-blue-600" />
                      <div>
                        <p className="text-xs text-blue-600 font-medium uppercase">Customer</p>
                        <p className="text-lg font-bold text-blue-900">{order.customer_name}</p>
                      </div>
                    </div>
                  </div>
                )}

                {order.customer_phone && (
                  <div className="bg-gradient-to-r from-green-50 to-green-100 p-4 rounded-xl">
                    <div className="flex items-center gap-3">
                      <Phone className="w-6 h-6 text-green-600" />
                      <div>
                        <p className="text-xs text-green-600 font-medium uppercase">Phone</p>
                        <p className="text-lg font-bold text-green-900">{order.customer_phone}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-gradient-to-r from-orange-50 to-orange-100 p-4 rounded-xl">
                  <div className="flex items-center gap-3">
                    <User className="w-6 h-6 text-orange-600" />
                    <div>
                      <p className="text-xs text-orange-600 font-medium uppercase">Waiter</p>
                      <p className="text-lg font-bold text-orange-900">{order.waiter_name}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card className="shadow-xl border-2 border-blue-100">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b-2">
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-6">
                {isReady && (
                  <>
                    <div className="bg-green-50 border-2 border-green-400 rounded-lg p-4 mb-4">
                      <p className="text-center text-green-900 font-bold text-lg mb-2">🎉 Order is Ready!</p>
                      <p className="text-center text-green-700 text-sm">Food is prepared and ready to serve</p>
                    </div>
                    
                    <Button 
                      className="w-full h-16 text-xl font-bold shadow-xl bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 animate-pulse" 
                      onClick={serveOrder}
                      disabled={updating}
                    >
                      <Check className="w-6 h-6 mr-3" />
                      Serve Order
                    </Button>

                    <Button 
                      className="w-full h-12 shadow-md" 
                      variant="destructive"
                      onClick={cancelOrder}
                      disabled={updating}
                    >
                      <X className="w-4 h-4 mr-2" />
                      Cancel Order
                    </Button>
                  </>
                )}

                {isServed && (
                  <>
                    <div className="bg-blue-50 border-2 border-blue-400 rounded-lg p-4 mb-4">
                      <p className="text-center text-blue-900 font-bold text-lg mb-2">✅ Food Served</p>
                      <p className="text-center text-blue-700 text-sm">Customer is eating. Add more items or mark ready for payment to free the table.</p>
                    </div>

                    <Button 
                      className="w-full h-14 text-lg font-bold shadow-lg bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700" 
                      onClick={() => router.push(`/waiter/new-order?order=${order.order_id}`)}
                    >
                      <Plus className="w-5 h-5 mr-2" />
                      Add More Items
                    </Button>
                    
                    <Button 
                      className="w-full h-14 text-lg font-bold shadow-lg bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700" 
                      onClick={completeOrder}
                      disabled={updating}
                    >
                      <Check className="w-5 h-5 mr-2" />
                      Ready for Payment (Free Table)
                    </Button>

                    <Button 
                      className="w-full h-12 shadow-md" 
                      variant="destructive"
                      onClick={cancelOrder}
                      disabled={updating}
                    >
                      <X className="w-4 h-4 mr-2" />
                      Cancel Order
                    </Button>
                  </>
                )}

                {order.status === 'pending' && (
                  <>
                    <Button 
                      className="w-full h-12 shadow-md" 
                      variant="outline"
                      onClick={() => router.push(`/waiter/new-order?order=${order.order_id}`)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add More Items
                    </Button>

                    <Button 
                      className="w-full h-12 shadow-md" 
                      variant="destructive"
                      onClick={cancelOrder}
                      disabled={updating}
                    >
                      <X className="w-4 h-4 mr-2" />
                      Cancel Order
                    </Button>
                  </>
                )}
                
                {isCompleted && (
                  <div className="text-center py-8">
                    <Check className="w-16 h-16 text-purple-500 mx-auto mb-4" />
                    <p className="text-lg font-bold text-purple-900">Order Completed</p>
                    <p className="text-sm text-gray-800 mt-2">Table has been freed</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
