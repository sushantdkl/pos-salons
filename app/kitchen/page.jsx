'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/toast'
import { LogOut, Clock, ChefHat, Flame, Wine, Dessert, UtensilsCrossed, CheckCircle, PlayCircle, AlertCircle } from 'lucide-react'

export default function KitchenDashboard() {
  const { user, logout, apiCall } = useAuth()
  const router = useRouter()
  const { addToast } = useToast()

  const [kots, setKots] = useState([])
  const [selectedStation, setSelectedStation] = useState('all')
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ pending: 0, prepared: 0 })
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)

  const stations = [
    { id: 'all', name: 'All Stations', icon: UtensilsCrossed },
    { id: 'grill', name: 'Grill', icon: Flame },
    { id: 'chinese', name: 'Chinese', icon: ChefHat },
    { id: 'bar', name: 'Bar', icon: Wine },
    { id: 'dessert', name: 'Dessert', icon: Dessert },
    { id: 'main', name: 'Main Kitchen', icon: UtensilsCrossed }
  ]

  useEffect(() => {
    if (user && user.role !== 'kitchen' && user.role !== 'admin') {
      router.push('/login')
      return
    }
    if (user) {
      fetchKOTs()
      const interval = setInterval(fetchKOTs, 5000) // Refresh every 5 seconds
      return () => clearInterval(interval)
    }
  }, [user, selectedStation])

  const fetchKOTs = async () => {
    try {
      // Fetch pending and prepared orders
      const res = await apiCall('/api/restaurant/orders')
      
      if (res.ok) {
        const data = await res.json()
        const allOrders = data.orders || []
        
        // Only show pending and prepared orders in kitchen
        const activeOrders = allOrders.filter(o => o.status === 'pending' || o.status === 'prepared')
        
        // Get order items for each order
        const ordersWithItems = await Promise.all(
          activeOrders.map(async (order) => {
            const itemsRes = await apiCall(`/api/restaurant/orders/${order.order_id}`)
            if (itemsRes.ok) {
              const itemsData = await itemsRes.json()
              return {
                ...order,
                items: itemsData.items || []
              }
            }
            return order
          })
        )
        
        setKots(ordersWithItems)
        
        // Count pending vs prepared
        const pending = ordersWithItems.filter(o => o.status === 'pending').length
        const prepared = ordersWithItems.filter(o => o.status === 'prepared').length
        setStats({ pending, prepared })
      }
    } catch (error) {
      console.error('Error fetching orders:', error)
    } finally {
      setLoading(false)
    }
  }

  const markItemReady = async (itemId) => {
    try {
      const res = await apiCall(`/api/restaurant/order-items/${itemId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: 'ready'
        })
      })

      if (res.ok) {
        // Update local state
        const updatedOrder = {
          ...selectedOrder,
          items: selectedOrder.items.map(item => 
            item.id === itemId ? { ...item, status: 'ready' } : item
          )
        }
        setSelectedOrder(updatedOrder)
        
        // Check if all items are ready
        const allReady = updatedOrder.items.every(item => item.status === 'ready')
        if (allReady) {
          await markOrderPrepared(selectedOrder.order_id)
        } else {
          fetchKOTs() // Refresh the list
        }
      } else {
        throw new Error('Failed to mark item as ready')
      }
    } catch (error) {
      addToast({
        title: 'Error',
        description: error.message,
        variant: 'error'
      })
    }
  }

  const markOrderPrepared = async (orderId) => {
    try {
      const res = await apiCall(`/api/restaurant/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: 'ready'
        })
      })

      if (res.ok) {
        addToast({
          title: '✓ Order Ready',
          description: `${selectedOrder.table_number ? `Table ${selectedOrder.table_number}` : 'Takeaway'} - All items prepared and ready for pickup`,
          variant: 'success'
        })
        setModalOpen(false)
        setSelectedOrder(null)
        fetchKOTs()
      } else {
        throw new Error('Failed to mark order as prepared')
      }
    } catch (error) {
      addToast({
        title: 'Error',
        description: error.message,
        variant: 'error'
      })
    }
  }

  const getStatusColor = (status) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      preparing: 'bg-blue-100 text-blue-800 border-blue-300',
      ready: 'bg-green-100 text-green-800 border-green-300',
      served: 'bg-gray-100 text-gray-800 border-gray-300'
    }
    return colors[status] || colors.pending
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending': return <AlertCircle className="w-5 h-5" />
      case 'preparing': return <PlayCircle className="w-5 h-5" />
      case 'ready': return <CheckCircle className="w-5 h-5" />
      default: return <Clock className="w-5 h-5" />
    }
  }

  const getElapsedTime = (createdAt) => {
    const elapsed = Math.floor((new Date() - new Date(createdAt)) / 60000)
    if (elapsed < 60) return `${elapsed}m`
    return `${Math.floor(elapsed / 60)}h ${elapsed % 60}m`
  }

  const getTimerColor = (createdAt, status) => {
    const elapsed = Math.floor((new Date() - new Date(createdAt)) / 60000)
    if (status === 'ready') return 'text-green-600'
    if (elapsed > 30) return 'text-red-600 font-bold'
    if (elapsed > 20) return 'text-orange-600 font-semibold'
    return 'text-gray-800'
  }

  // Show all orders for now (station filtering can be added later)
  const pendingKots = kots

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-700">Loading Kitchen Display...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-[1800px] mx-auto px-3 sm:px-6 py-3 sm:py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-blue-600 rounded-lg">
                <ChefHat className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900">Kitchen</h1>
                <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">{user?.full_name}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="flex gap-2 sm:gap-3 text-sm">
                <div className="text-center bg-white border border-gray-200 px-2 py-1.5 sm:px-4 sm:py-2 rounded-lg shadow-sm">
                  <p className="text-gray-900 text-base sm:text-xl font-bold">{stats.pending}</p>
                  <p className="text-gray-600 text-[10px] sm:text-xs">Pending</p>
                </div>
                <div className="text-center bg-white border border-gray-200 px-2 py-1.5 sm:px-4 sm:py-2 rounded-lg shadow-sm">
                  <p className="text-gray-900 text-base sm:text-xl font-bold">{stats.prepared}</p>
                  <p className="text-gray-600 text-[10px] sm:text-xs">Ready</p>
                </div>
              </div>
              
              <Button onClick={logout} className="bg-red-600 hover:bg-red-700 text-white" size="sm">
                <LogOut className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          </div>

        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-[1800px] mx-auto px-3 sm:px-6 py-3 sm:py-6">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-3 sm:mb-4">Active Orders</h2>
        {pendingKots.length === 0 ? (
          <Card className="shadow border border-gray-200">
            <CardContent className="py-8 sm:py-12 text-center">
              <AlertCircle className="w-12 h-12 sm:w-16 sm:h-16 text-gray-300 mx-auto mb-3 sm:mb-4" />
              <p className="text-gray-700 text-lg sm:text-xl font-semibold">No active orders</p>
              <p className="text-gray-600 mt-1 text-xs sm:text-sm">New orders will appear here</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
            {pendingKots.map(order => (
              <OrderCard 
                key={order.order_id} 
                order={order} 
                getElapsedTime={getElapsedTime}
                onClick={() => {
                  setSelectedOrder(order)
                  setModalOpen(true)
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Order Details Modal */}
      {modalOpen && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="bg-blue-600 text-white p-6 sticky top-0">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold">{selectedOrder.order_number}</h2>
                  <p className="text-blue-100 text-lg mt-1">
                    {selectedOrder.table_number ? `🍽 Table ${selectedOrder.table_number}` : '📦 Takeaway'}
                  </p>
                </div>
                <div className="text-right">
                  <div className="bg-white/20 px-4 py-2 rounded-lg">
                    <p className="text-xl font-bold">
                      <Clock className="w-5 h-5 inline mr-2" />
                      {getElapsedTime(selectedOrder.created_at)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <h3 className="font-bold text-gray-900 text-xl mb-4 flex items-center gap-2">
                  <UtensilsCrossed className="w-5 h-5 text-blue-600" />
                  Order Items
                </h3>
                <div className="space-y-4">
                  {(selectedOrder.items || []).map((item) => {
                    const itemStatus = item.status || 'pending'
                    const isReady = itemStatus === 'ready'
                    
                    return (
                      <div key={item.id || item.item_id || Math.random()} className={`border-4 rounded-xl p-5 transition-all ${
                        isReady ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-500' : 'bg-orange-50 border-orange-300'
                      }`}>
                        <div className="flex items-start gap-4">
                          <div className={`px-4 py-2 rounded-full font-bold text-xl min-w-[70px] text-center shadow-lg ${
                            isReady ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white' : 'bg-gradient-to-r from-orange-500 to-red-500 text-white'
                          }`}>
                            {item.quantity}×
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <p className="font-bold text-gray-900 text-xl">{item.item_name}</p>
                              {isReady && (
                                <Badge className="bg-green-600 text-white flex items-center gap-1 px-3 py-1 text-sm">
                                  <CheckCircle className="w-4 h-4" />
                                  Ready
                                </Badge>
                              )}
                            </div>
                            {item.special_instructions && (
                              <div className="mt-3 bg-yellow-200 border-2 border-yellow-400 rounded-lg p-3">
                                <p className="text-orange-900 text-sm font-semibold flex items-start gap-2">
                                  <span className="text-lg">📝</span>
                                  <span>{item.special_instructions}</span>
                                </p>
                              </div>
                            )}
                            {!isReady && (
                              <Button 
                                onClick={(e) => {
                                  e.stopPropagation()
                                  markItemReady(item.id)
                                }}
                                className="mt-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold shadow-lg"
                              >
                                <CheckCircle className="w-5 h-5 mr-2" />
                                Mark This Item Ready
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="border-t-2 border-gray-200 pt-4">
                <p className="text-gray-800 text-sm">
                  <strong>Ordered at:</strong> {new Date(selectedOrder.created_at).toLocaleTimeString()}
                </p>
                <p className="text-gray-600 text-sm mt-1">
                  <strong>Waiter:</strong> {selectedOrder.waiter_name || 'Unknown'}
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <Button 
                  onClick={() => setModalOpen(false)}
                  variant="outline"
                  className="flex-1 py-6 text-lg"
                >
                  Close
                </Button>
                {selectedOrder.status === 'pending' && (
                  <Button 
                    onClick={() => markOrderPrepared(selectedOrder.order_id)}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white py-6 text-lg font-bold"
                  >
                    <CheckCircle className="w-6 h-6 mr-2" />
                    Mark as Prepared
                  </Button>
                )}
                {selectedOrder.status === 'prepared' && (
                  <div className="flex-1 bg-green-100 border-2 border-green-500 rounded-lg py-6 px-4 text-center">
                    <p className="text-green-700 font-bold text-lg flex items-center justify-center gap-2">
                      <CheckCircle className="w-6 h-6" />
                      Ready for Pickup
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function OrderCard({ order, getElapsedTime, onClick }) {
  const elapsed = Math.floor((new Date() - new Date(order.created_at)) / 60000)
  const isUrgent = elapsed > 20
  const isPrepared = order.status === 'prepared'
  
  return (
    <Card 
      onClick={onClick}
      className={`border-2 hover:shadow-lg transition-all cursor-pointer ${
        isPrepared ? 'border-green-500 bg-green-50' :
        isUrgent ? 'border-red-500 bg-red-50' : 
        'border-gray-200 bg-white'
      }`}
    >
      <CardHeader className={`pb-2 sm:pb-3 ${
        isPrepared ? 'bg-green-600' :
        isUrgent ? 'bg-red-600' :
        'bg-blue-600'
      } text-white`}>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg sm:text-xl font-bold mb-1">
              {order.order_number}
            </CardTitle>
            <p className="text-xs sm:text-sm text-white/90 font-medium flex items-center gap-2">
              {order.table_number ? (
                <>
                  <span className="bg-white/20 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded text-xs sm:text-sm">🍽 Table {order.table_number}</span>
                </>
              ) : (
                <span className="bg-white/20 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded text-xs sm:text-sm">📦 Takeaway</span>
              )}
            </p>
          </div>
          <div className="bg-white/20 px-2 py-0.5 sm:px-3 sm:py-1 rounded">
            <p className={`text-sm sm:text-lg font-bold flex items-center gap-1 ${
              isUrgent && !isPrepared ? 'animate-pulse' : ''
            }`}>
              <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
              {getElapsedTime(order.created_at)}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-3 pb-3 px-3 sm:pt-4 sm:pb-4 sm:px-4">
        <div className="space-y-2">
          {(order.items || []).map((item) => (
            <div key={item.id || item.item_id || Math.random()} className="bg-gray-50 border border-gray-200 rounded-lg p-2 sm:p-3">
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="bg-blue-600 text-white px-2 py-0.5 sm:px-3 sm:py-1 rounded-full font-bold text-xs sm:text-sm min-w-[40px] sm:min-w-[50px] text-center">
                  {item.quantity}×
                </span>
                <span className="font-semibold text-gray-900 flex-1 text-sm sm:text-base">{item.item_name}</span>
              </div>
              {item.special_instructions && (
                <div className="mt-2 sm:mt-3 bg-yellow-100 border-2 border-yellow-400 rounded-lg p-2 sm:p-3">
                  <p className="text-orange-900 text-xs sm:text-sm font-semibold flex items-start gap-2">
                    <span className="text-base sm:text-lg">📝</span>
                    <span>{item.special_instructions}</span>
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
        
        <div className="mt-2 pt-2 sm:mt-3 sm:pt-3 border-t border-gray-200 flex items-center justify-between text-xs sm:text-sm text-gray-600">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
            {new Date(order.created_at).toLocaleTimeString()}
          </span>
          <span className="bg-gray-100 px-2 py-0.5 sm:px-3 sm:py-1 rounded-full font-medium text-gray-700">
            {order.items?.length || 0} items
          </span>
        </div>
        
        {isPrepared && (
          <div className="mt-2 sm:mt-3 bg-green-600 text-white rounded-lg px-3 py-1.5 sm:px-4 sm:py-2 text-center">
            <p className="font-bold flex items-center justify-center gap-2 text-sm sm:text-base">
              <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />
              All Items Ready!
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function KOTCard({ kot, onStatusChange, getElapsedTime, getTimerColor }) {
  return (
    <Card className="bg-gray-800 border-2 border-yellow-500 hover:shadow-xl transition-all">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-xl font-bold text-white">
              {kot.kot_number || `KOT-${kot.kot_id}`}
            </CardTitle>
            <p className="text-sm text-gray-700 mt-1">
              {kot.table_number ? `Table: ${kot.table_number}` : 'Takeaway'}
            </p>
          </div>
          <div className="text-right">
            <p className={`text-lg font-bold ${getTimerColor(kot.printed_at || kot.created_at, kot.status)}`}>
              <Clock className="w-4 h-4 inline mr-1" />
              {getElapsedTime(kot.printed_at || kot.created_at)}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="bg-gray-900 rounded-lg p-3 space-y-2">
          {(kot.items || []).map((item, index) => (
            <div key={index} className="flex justify-between items-start text-sm">
              <div className="flex-1">
                <p className="font-medium text-white">
                  {item.quantity}x {item.item_name}
                </p>
                {item.special_instructions && (
                  <p className="text-yellow-400 text-xs italic mt-1">
                    Note: {item.special_instructions}
                  </p>
                )}
              </div>
            </div>
          ))}
          {(!kot.items || kot.items.length === 0) && (
            <p className="text-gray-800 text-sm">Loading items...</p>
          )}
        </div>

        <div className="flex gap-2 mt-4">
          {kot.status === 'pending' && (
            <Button 
              className="flex-1 bg-blue-600 hover:bg-blue-700"
              onClick={() => onStatusChange(kot.kot_id, 'preparing')}
            >
              <PlayCircle className="w-4 h-4 mr-2" />
              Start Cooking
            </Button>
          )}
          
          {kot.status === 'preparing' && (
            <Button 
              className="flex-1 bg-green-600 hover:bg-green-700"
              onClick={() => onStatusChange(kot.kot_id, 'ready')}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Mark Ready
            </Button>
          )}

          {kot.status === 'ready' && (
            <Button 
              className="flex-1 bg-gray-600"
              disabled
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Awaiting Pickup
            </Button>
          )}
        </div>

        {/* Additional Info */}
        <div className="text-xs text-gray-700 pt-2 border-t border-gray-700">
          Order: {kot.order_number} • {new Date(kot.printed_at || kot.created_at).toLocaleTimeString()}
        </div>
      </CardContent>
    </Card>
  )
}
