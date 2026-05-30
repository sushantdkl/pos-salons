'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LogOut, Plus, List, LayoutGrid, Clock, DollarSign, Bell, CheckCircle } from 'lucide-react'
import { useToast } from '@/components/ui/toast'

export default function WaiterDashboard() {
  const { user, logout, apiCall, loading } = useAuth()
  const router = useRouter()
  const { addToast } = useToast()
  const [tables, setTables] = useState([])
  const [orders, setOrders] = useState([])
  const [stats, setStats] = useState({ active: 0, completed: 0, prepared: 0, total: 0 })
  const [loadingData, setLoadingData] = useState(false)
  const [lastPreparedCount, setLastPreparedCount] = useState(-1)
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    console.log('🎯 useEffect triggered. Loading:', loading, 'User:', user)
    
    if (loading) {
      console.log('⏳ Still loading auth...')
      return
    }
    
    if (!user) {
      console.log('❌ No user, redirecting to login')
      router.push('/login')
      return
    }

    if (user.role !== 'waiter') {
      console.log('❌ User is not a waiter:', user.role)
      router.push('/login')
      return
    }

    if (!user.id) {
      console.log('❌ No user id found')
      return
    }

    console.log('✅ All checks passed, starting data fetch for user:', user.id)

    let interval
    
    const fetchData = async () => {
      console.log('🔄 FETCH STARTED - Fetching tables and orders...')
      setIsRefreshing(true)
      try {
        const tablesRes = await apiCall('/api/restaurant/tables')
        const ordersRes = await apiCall('/api/restaurant/orders')

        console.log('📊 Tables response status:', tablesRes.status, 'OK:', tablesRes.ok)
        console.log('📋 Orders response status:', ordersRes.status, 'OK:', ordersRes.ok)

        if (tablesRes.ok) {
          const tablesData = await tablesRes.json()
          console.log('✅ TABLES DATA RECEIVED:', tablesData)
          console.log('📍 Number of tables:', tablesData.tables?.length || 0)
          console.log('📋 First table:', tablesData.tables?.[0])
          setTables(tablesData.tables || [])
          console.log('💾 Tables state updated')
        } else {
          console.error('❌ Tables fetch failed with status:', tablesRes.status)
          try {
            const errorData = await tablesRes.json()
            console.error('Error details:', errorData)
          } catch (e) {
            console.error('Could not parse error response')
          }
        }

        if (ordersRes.ok) {
          const ordersData = await ordersRes.json()
          const userOrders = ordersData.orders || []
          
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          const todayOrders = userOrders.filter(o => {
            const orderDate = new Date(o.created_at)
            orderDate.setHours(0, 0, 0, 0)
            return orderDate.getTime() === today.getTime()
          })
          
          setOrders(todayOrders)
          
          const active = todayOrders.filter(o => o.status === 'pending').length
          const completed = todayOrders.filter(o => o.status === 'completed').length
          const prepared = todayOrders.filter(o => o.status === 'ready').length
          
          if (prepared > lastPreparedCount && lastPreparedCount >= 0) {
            addToast({
              title: '🔔 Order Ready!',
              description: 'New order is ready for pickup',
              variant: 'success'
            })
          }
          setLastPreparedCount(prepared)
          
          setStats({ active, completed, prepared, total: todayOrders.length })
        } else {
          console.error('❌ Orders fetch failed:', ordersRes.status)
        }
      } catch (error) {
        console.error('💥 FETCH ERROR:', error)
        console.error('Error details:', error.message, error.stack)
      } finally {
        setIsRefreshing(false)
        console.log('✔ FETCH COMPLETE')
      }
    }
    
    console.log('🚀 Initiating first data fetch')
    fetchData()
    
    console.log('⏰ Setting up 5-second interval')
    interval = setInterval(fetchData, 5000)

    return () => {
      console.log('🧹 Cleanup: clearing interval')
      clearInterval(interval)
    }
  }, [user?.id, loading])

  const getTableStatusColor = (status) => {
    switch (status) {
      case 'available': return 'bg-green-500'
      case 'occupied': return 'bg-red-500'
      case 'reserved': return 'bg-yellow-500'
      case 'cleaning': return 'bg-gray-500'
      default: return 'bg-gray-300'
    }
  }

  const getOrderStatusBadge = (status) => {
    switch(status) {
      case 'completed': return 'success'
      case 'prepared': return 'success'
      case 'cancelled': return 'danger'
      case 'pending': return 'warning'
      default: return 'warning'
    }
  }

  const handleManualRefresh = async () => {
    if (!user || !user.id) return
    
    setIsRefreshing(true)
    try {
      const [tablesRes, ordersRes] = await Promise.all([
        apiCall('/api/restaurant/tables'),
        apiCall('/api/restaurant/orders')
      ])

      if (tablesRes.ok) {
        const tablesData = await tablesRes.json()
        setTables(tablesData.tables || [])
      }

      if (ordersRes.ok) {
        const ordersData = await ordersRes.json()
        const userOrders = ordersData.orders || []
        
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const todayOrders = userOrders.filter(o => {
          const orderDate = new Date(o.created_at)
          orderDate.setHours(0, 0, 0, 0)
          return orderDate.getTime() === today.getTime()
        })
        
        setOrders(todayOrders)
        
        const active = todayOrders.filter(o => o.status === 'pending').length
        const completed = todayOrders.filter(o => o.status === 'completed').length
        const prepared = todayOrders.filter(o => o.status === 'ready').length
        
        setStats({ active, completed, prepared, total: todayOrders.length })
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  // Calculate dynamic counts for display
  const preparingOrders = orders.filter(o => o.status === 'pending')
  const readyOrders = orders.filter(o => o.status === 'ready')
  const servedOrders = orders.filter(o => o.status === 'served')
  const completedOrders = orders.filter(o => o.status === 'completed')

  if (loading || loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-800">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                🍽️ Waiter Dashboard
                {isRefreshing && (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                )}
              </h1>
              <p className="text-sm text-gray-600">
                Welcome, {user?.full_name} • Auto-refreshing every 5 seconds
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={handleManualRefresh} className="bg-blue-600 hover:bg-blue-700 text-white" size="sm" disabled={isRefreshing}>
                <Clock className="w-4 h-4 mr-2" />
                Refresh
              </Button>
              <Button onClick={logout} className="bg-red-600 hover:bg-red-700 text-white" size="sm">
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Prepared Orders Notification */}
        {stats.prepared > 0 && (
          <div className="mb-6">
            <Card className="border-2 border-green-500 bg-green-50 shadow">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="bg-green-500 p-3 rounded-full animate-pulse">
                    <Bell className="w-8 h-8 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-green-900 flex items-center gap-2">
                      <CheckCircle className="w-6 h-6" />
                      Orders Ready for Pickup!
                    </h3>
                    <p className="text-green-700 font-medium mt-1">
                      {stats.prepared} {stats.prepared === 1 ? 'order is' : 'orders are'} prepared and waiting
                    </p>
                  </div>
                  <Button 
                    onClick={() => {
                      const preparedOrders = orders.filter(o => o.status === 'ready')
                      if (preparedOrders.length > 0) {
                        router.push(`/waiter/order/${preparedOrders[0].order_id}`)
                      }
                    }}
                    className="bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-6"
                  >
                    View Orders →
                  </Button>
                </div>
                <div className="mt-4 space-y-2">
                  {orders.filter(o => o.status === 'ready').map(order => (
                    <div 
                      key={order.order_id}
                      onClick={() => router.push(`/waiter/order/${order.order_id}`)}
                      className="bg-white border-2 border-green-300 rounded-lg p-3 cursor-pointer hover:bg-green-50 transition-colors flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <div>
                          <p className="font-bold text-gray-900">{order.order_number}</p>
                          <p className="text-sm text-gray-600">
                            {order.table_number ? `Table ${order.table_number}` : 'Takeaway'} • {order.item_count} items
                          </p>
                        </div>
                      </div>
                      <Badge className="bg-green-600">Ready</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">Active Orders</p>
                  <p className="text-3xl font-bold text-blue-600">{stats.active}</p>
                </div>
                <Clock className="h-12 w-12 text-blue-600 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-green-400">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">Ready to Serve</p>
                  <p className="text-3xl font-bold text-green-600">{stats.prepared}</p>
                </div>
                <CheckCircle className="h-12 w-12 text-green-600 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">Paid & Completed</p>
                  <p className="text-3xl font-bold text-purple-600">{stats.completed}</p>
                </div>
                <List className="h-12 w-12 text-purple-600 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">Total Orders</p>
                  <p className="text-3xl font-bold text-indigo-600">{stats.total}</p>
                </div>
                <DollarSign className="h-12 w-12 text-indigo-600 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="tables" className="space-y-4">
          <TabsList>
            <TabsTrigger value="tables">
              <LayoutGrid className="w-4 h-4 mr-2" />
              Tables
            </TabsTrigger>
            <TabsTrigger value="orders">
              <List className="w-4 h-4 mr-2" />
              My Orders
            </TabsTrigger>
          </TabsList>

          {/* Tables View */}
          <TabsContent value="tables" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Restaurant Tables ({tables.length})</h2>
              <Button onClick={() => router.push('/waiter/new-order')}>
                <Plus className="w-4 h-4 mr-2" />
                New Order
              </Button>
            </div>

            {isRefreshing && tables.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-800 text-lg font-medium">Loading tables...</p>
                </CardContent>
              </Card>
            ) : tables.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <LayoutGrid className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-800 text-lg font-medium">No tables found</p>
                  <p className="text-gray-700 text-sm mt-2">Please contact admin to set up tables</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {tables.map((table) => (
                  <Card
                    key={table.table_id}
                    className={`cursor-pointer transition-all hover:shadow-lg ${
                      table.status === 'available' ? 'hover:border-green-500' : ''
                    }`}
                    onClick={() => {
                      if (table.status === 'available') {
                        router.push(`/waiter/new-order?table=${table.table_id}`)
                      } else if (table.current_order_id) {
                        router.push(`/waiter/order/${table.current_order_id}`)
                      }
                    }}
                  >
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <div className={`w-16 h-16 rounded-full ${getTableStatusColor(table.status)} mx-auto mb-3 flex items-center justify-center text-white font-bold text-xl shadow-lg`}>
                          {table.table_number}
                        </div>
                        <p className="font-bold text-gray-900">{table.table_number}</p>
                        <p className="text-sm font-medium text-gray-800">{table.floor} - {table.section || 'General'}</p>
                        <Badge variant={table.status === 'available' ? 'success' : 'warning'} className="mt-2">
                          {table.status.toUpperCase()}
                        </Badge>
                        {table.capacity && (
                          <p className="text-xs text-gray-700 mt-1 font-medium">Capacity: {table.capacity}</p>
                        )}
                        {table.current_order_amount && (
                          <p className="text-sm font-bold text-green-600 mt-1">
                            ₹{table.current_order_amount}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Orders View */}
          <TabsContent value="orders" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900">My Orders</h2>
              <Button onClick={() => router.push('/waiter/new-order')} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                New Order
              </Button>
            </div>

            {orders.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-800 text-lg font-medium">No orders yet. Start taking orders!</p>
                  <Button className="mt-4" onClick={() => router.push('/waiter/new-order')}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create First Order
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* Ready to Serve Section */}
                {readyOrders.length > 0 && (
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <CheckCircle className="w-6 h-6 text-green-600" />
                      <h3 className="text-xl font-bold text-green-900">Ready to Serve ({readyOrders.length})</h3>
                    </div>
                    <div className="grid gap-4">
                      {readyOrders.map((order) => (
                        <Card
                          key={order.order_id}
                          className="cursor-pointer hover:shadow-xl transition-all border-4 border-green-500 bg-gradient-to-r from-green-50 to-emerald-50"
                          onClick={() => router.push(`/waiter/order/${order.order_id}`)}
                        >
                          <CardHeader className="pb-3">
                            <div className="flex justify-between items-start">
                              <div>
                                <CardTitle className="text-xl font-bold text-gray-900">{order.order_number}</CardTitle>
                                <p className="text-sm text-gray-600 font-medium mt-1">
                                  {order.table_number ? `🍽 Table ${order.table_number}` : '📦 Takeaway'} • {new Date(order.created_at).toLocaleTimeString()}
                                </p>
                              </div>
                              <Badge className="bg-green-600 text-white px-4 py-2 text-sm font-bold flex items-center gap-2">
                                <CheckCircle className="w-4 h-4" />
                                READY
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="text-sm text-gray-700 font-medium">{order.item_count} items</p>
                                <p className="text-xl font-bold text-green-700">Rs {order.total_amount}</p>
                              </div>
                              <Button size="lg" className="bg-green-600 hover:bg-green-700 text-white font-bold">
                                Serve Order →
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Active Orders Section */}
                {preparingOrders.length > 0 && (
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <Clock className="w-6 h-6 text-yellow-600" />
                      <h3 className="text-xl font-bold text-yellow-900">Preparing ({preparingOrders.length})</h3>
                    </div>
                    <div className="grid gap-4">
                      {preparingOrders.map((order) => (
                        <Card
                          key={order.order_id}
                          className="cursor-pointer hover:shadow-lg transition-shadow border-2 border-yellow-400 bg-yellow-50"
                          onClick={() => router.push(`/waiter/order/${order.order_id}`)}
                        >
                          <CardHeader className="pb-3">
                            <div className="flex justify-between items-start">
                              <div>
                                <CardTitle className="text-lg font-bold text-gray-900">{order.order_number}</CardTitle>
                                <p className="text-sm text-gray-600 font-medium mt-1">
                                  {order.table_number ? `🍽 Table ${order.table_number}` : '📦 Takeaway'} • {new Date(order.created_at).toLocaleTimeString()}
                                </p>
                              </div>
                              <Badge className="bg-yellow-500 text-white px-3 py-1">
                                Preparing
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="text-sm text-gray-600">{order.item_count} items</p>
                                <p className="text-lg font-bold text-gray-900">Rs {order.total_amount}</p>
                              </div>
                              <Button size="sm" variant="outline">
                                View Details
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Served Orders Section - Ready for payment at cashier */}
                {servedOrders.length > 0 && (
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <Clock className="w-6 h-6 text-blue-600" />
                      <h3 className="text-xl font-bold text-blue-900">Ready for Payment at Cashier ({servedOrders.length})</h3>
                    </div>
                    <div className="grid gap-4">
                      {servedOrders.map((order) => (
                        <Card
                          key={order.order_id}
                          className="cursor-pointer hover:shadow-lg transition-shadow border-2 border-blue-400 bg-blue-50"
                          onClick={() => router.push(`/waiter/order/${order.order_id}`)}
                        >
                          <CardHeader className="pb-3">
                            <div className="flex justify-between items-start">
                              <div>
                                <CardTitle className="text-lg font-bold text-gray-900">{order.order_number}</CardTitle>
                                <p className="text-sm text-gray-600 font-medium mt-1">
                                  {order.table_number ? `🍽 Table ${order.table_number}` : '📦 Takeaway'} • {new Date(order.created_at).toLocaleTimeString()}
                                </p>
                              </div>
                              <Badge className="bg-blue-500 text-white px-3 py-1">
                                Served
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="text-sm text-gray-600">{order.item_count} items</p>
                                <p className="text-lg font-bold text-gray-900">Rs {order.total_amount}</p>
                              </div>
                              <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white">
                                View Order
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Completed Orders Section */}
                {completedOrders.length > 0 && (
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <CheckCircle className="w-6 h-6 text-purple-600" />
                      <h3 className="text-xl font-bold text-purple-700">Paid & Completed Today ({completedOrders.length})</h3>
                    </div>
                    <div className="grid gap-3">
                      {completedOrders.slice(0, 5).map((order) => (
                        <Card
                          key={order.order_id}
                          className="cursor-pointer hover:shadow-md transition-shadow border border-gray-300 bg-gray-50"
                          onClick={() => router.push(`/waiter/order/${order.order_id}`)}
                        >
                          <CardHeader className="pb-2">
                            <div className="flex justify-between items-start">
                              <div>
                                <CardTitle className="text-base font-bold text-gray-800">{order.order_number}</CardTitle>
                                <p className="text-xs text-gray-700 font-medium mt-1">
                                  {order.table_number ? `Table ${order.table_number}` : 'Takeaway'} • {new Date(order.created_at).toLocaleTimeString()}
                                </p>
                              </div>
                              <Badge className="bg-gray-600 text-white px-2 py-1 text-xs">
                                Completed
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="pb-3">
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="text-xs text-gray-800">{order.item_count} items</p>
                                <p className="text-sm font-bold text-gray-800">Rs {order.total_amount}</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                      {completedOrders.length > 5 && (
                        <p className="text-center text-sm text-gray-800 font-medium">
                          +{completedOrders.length - 5} more completed orders
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
