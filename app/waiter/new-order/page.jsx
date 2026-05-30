'use client'

import { useState, useEffect, Suspense } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { ArrowLeft, Plus, Minus, Search, ShoppingCart, Send, X } from 'lucide-react'

function NewOrderContent() {
  const { user, apiCall } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { addToast } = useToast()

  const [menuItems, setMenuItems] = useState([])
  const [categories, setCategories] = useState([])
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [cart, setCart] = useState([])
  const [selectedTable, setSelectedTable] = useState(null)
  const [tables, setTables] = useState([])
  const [showTableDialog, setShowTableDialog] = useState(false)
  const [showCartDialog, setShowCartDialog] = useState(false)
  const [orderType, setOrderType] = useState('dine-in')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [existingOrderId, setExistingOrderId] = useState(null)

  useEffect(() => {
    fetchMenuAndTables()
    const tableId = searchParams.get('table')
    const orderId = searchParams.get('order')
    
    if (tableId) {
      fetchTableDetails(tableId)
    }
    
    if (orderId) {
      setExistingOrderId(orderId)
      fetchExistingOrder(orderId)
    }
  }, [])

  const fetchMenuAndTables = async () => {
    try {
      const [menuRes, tablesRes] = await Promise.all([
        apiCall('/api/restaurant/menu'),
        apiCall('/api/restaurant/tables?status=available')
      ])

      if (menuRes.ok) {
        const data = await menuRes.json()
        setMenuItems(data.items || [])
        
        // Extract unique categories
        const cats = [...new Set((data.items || []).map(item => item.category))]
        setCategories(cats)
      }

      if (tablesRes.ok) {
        const data = await tablesRes.json()
        setTables(data.tables || [])
      }
    } catch (error) {
      console.error('Error fetching data:', error)
      addToast({ title: 'Error', description: 'Failed to load menu', variant: 'error' })
    }
  }

  const fetchTableDetails = async (tableId) => {
    try {
      const res = await apiCall(`/api/restaurant/tables/${tableId}`)
      if (res.ok) {
        const data = await res.json()
        setSelectedTable(data.table)
        setOrderType('dine-in')
      } else {
        console.error('Failed to fetch table:', res.status)
        addToast({ title: 'Error', description: 'Failed to load table details', variant: 'error' })
      }
    } catch (error) {
      console.error('Error fetching table:', error)
      addToast({ title: 'Error', description: 'Failed to load table details', variant: 'error' })
    }
  }

  const fetchExistingOrder = async (orderId) => {
    try {
      const res = await apiCall(`/api/restaurant/orders/${orderId}`)
      if (res.ok) {
        const data = await res.json()
        const order = data.order
        
        // Set order type and customer info
        setOrderType(order.order_type || 'dine-in')
        
        if (order.order_type === 'dine-in' && order.table_id) {
          await fetchTableDetails(order.table_id)
        } else if (order.order_type === 'takeaway') {
          setCustomerName(order.customer_name || '')
          setCustomerPhone(order.customer_phone || '')
        }
      }
    } catch (error) {
      console.error('Error fetching existing order:', error)
    }
  }

  const filteredItems = menuItems.filter(item => {
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory
    const matchesSearch = (item.item_name || item.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (item.description || '').toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch && item.is_available
  })

  const addToCart = (item) => {
    const existing = cart.find(i => i.item_id === item.item_id)
    if (existing) {
      setCart(cart.map(i => 
        i.item_id === item.item_id 
          ? { ...i, quantity: i.quantity + 1 }
          : i
      ))
    } else {
      setCart([...cart, { ...item, quantity: 1, special_instructions: '' }])
    }
    addToast({ 
      title: '✓ Added to cart', 
      description: `${item.item_name} added successfully`, 
      variant: 'success' 
    })
  }

  const updateQuantity = (itemId, delta) => {
    setCart(cart.map(item => {
      if (item.item_id === itemId) {
        const newQty = item.quantity + delta
        return newQty <= 0 ? null : { ...item, quantity: newQty }
      }
      return item
    }).filter(Boolean))
  }

  const removeFromCart = (itemId) => {
    setCart(cart.filter(item => item.item_id !== itemId))
  }

  const updateInstructions = (itemId, instructions) => {
    setCart(cart.map(item =>
      item.item_id === itemId ? { ...item, special_instructions: instructions } : item
    ))
  }

  const calculateTotal = () => {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)
  }

  const handleSubmitOrder = async () => {
    if (cart.length === 0) {
      addToast({ title: 'Error', description: 'Cart is empty', variant: 'error' })
      return
    }

    // Skip validation if adding to existing order
    if (!existingOrderId) {
      if (orderType === 'dine-in' && !selectedTable) {
        setShowTableDialog(true)
        return
      }

      if (orderType === 'takeaway' && !customerName) {
        addToast({ title: 'Error', description: 'Please enter customer name', variant: 'error' })
        return
      }
    }

    setSubmitting(true)

    try {
      // If adding to existing order
      if (existingOrderId) {
        const res = await apiCall(`/api/restaurant/orders/${existingOrderId}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: cart.map(item => ({
              menu_item_id: item.item_id,
              quantity: item.quantity,
              price: item.price,
              special_instructions: item.special_instructions || null
            }))
          })
        })

        if (res.ok) {
          addToast({ 
            title: 'Success', 
            description: 'Items added to order successfully', 
            variant: 'success' 
          })
          router.push(`/waiter/order/${existingOrderId}`)
        } else {
          const error = await res.json()
          throw new Error(error.error || 'Failed to add items')
        }
      } else {
        // Creating new order
        const orderData = {
          table_id: orderType === 'dine-in' ? selectedTable.table_id : null,
          order_type: orderType,
          customer_name: orderType === 'takeaway' ? customerName : null,
          customer_phone: orderType === 'takeaway' ? customerPhone : null,
          items: cart.map(item => ({
            menu_item_id: item.item_id,
            quantity: item.quantity,
            price: item.price,
            special_instructions: item.special_instructions || null
          }))
        }

        const res = await apiCall('/api/restaurant/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderData)
        })

        if (res.ok) {
          const data = await res.json()
          addToast({ 
            title: 'Success', 
            description: `Order ${data.order_number} created successfully`, 
            variant: 'success' 
          })
          router.push(`/waiter/order/${data.order_id}`)
        } else {
          const error = await res.json()
          throw new Error(error.error || 'Failed to create order')
        }
      }
    } catch (error) {
      console.error('Error with order:', error)
      addToast({ 
        title: 'Error', 
        description: error.message || 'Failed to process order', 
        variant: 'error' 
      })
    } finally {
      setSubmitting(false)
    }
  }

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-blue-600 text-white border-b-2 border-blue-700 sticky top-0 z-20 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="sm" onClick={() => router.back()}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-white">
                  {existingOrderId ? 'Add Items to Order' : 'New Order'}
                </h1>
                <p className="text-sm text-blue-100">
                  {selectedTable ? `Table ${selectedTable.table_number}` : existingOrderId ? 'Adding items to existing order' : 'Select items from menu'}
                </p>
              </div>
            </div>
            
            {!existingOrderId && (
              <div className="flex gap-2">
                <Button
                  variant={orderType === 'dine-in' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setOrderType('dine-in')}
                >
                  Dine In
                </Button>
                <Button
                  variant={orderType === 'takeaway' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setOrderType('takeaway')}
                >
                  Takeaway
                </Button>
              </div>
            )}
          </div>

          {orderType === 'dine-in' && !selectedTable && !existingOrderId && !searchParams.get('table') && (
            <Button className="mt-2 w-full" variant="outline" onClick={() => setShowTableDialog(true)}>
              Select Table
            </Button>
          )}

          {orderType === 'takeaway' && !existingOrderId && (
            <div className="mt-3 flex gap-2">
              <Input
                placeholder="Customer Name *"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
              <Input
                placeholder="Phone Number"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </div>
          )}
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Menu Section */}
          <div className="lg:col-span-2 space-y-4">
            {/* Search & Filter */}
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-700" />
                    <Input
                      placeholder="Search menu items..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant={selectedCategory === 'all' ? 'default' : 'outline'}
                      onClick={() => setSelectedCategory('all')}
                    >
                      All Items
                    </Button>
                    {categories.map(cat => (
                      <Button
                        key={cat}
                        size="sm"
                        variant={selectedCategory === cat ? 'default' : 'outline'}
                        onClick={() => setSelectedCategory(cat)}
                      >
                        {cat}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Menu Items Grid */}
            <div className="grid md:grid-cols-2 gap-4">
              {filteredItems.map(item => (
                <Card key={item.item_id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <CardTitle className="text-base">{item.item_name}</CardTitle>
                        <p className="text-sm text-gray-800 mt-1 line-clamp-2">
                          {item.description}
                        </p>
                      </div>
                      <Badge variant={item.is_veg ? 'success' : 'danger'} className="ml-2">
                        {item.is_veg ? '🟢' : '🔴'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-lg font-bold text-green-600">Rs {item.price}</p>
                        {item.category && (
                          <p className="text-xs text-gray-700">{item.category}</p>
                        )}
                      </div>
                      <Button size="sm" onClick={() => addToCart(item)}>
                        <Plus className="w-4 h-4 mr-1" />
                        Add
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {filteredItems.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-gray-800">No items found</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Cart Section - Desktop */}
          <div className="hidden lg:block">
            <Card className="sticky top-24">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5" />
                  Cart ({cartItemCount})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {cart.length === 0 ? (
                  <p className="text-center text-gray-800 py-8">Cart is empty</p>
                ) : (
                  <>
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {cart.map(item => (
                        <div key={item.item_id} className="border rounded-lg p-3 space-y-2">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <p className="font-medium text-sm">{item.item_name}</p>
                              <p className="text-sm text-green-600">Rs {item.price}</p>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removeFromCart(item.item_id)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateQuantity(item.item_id, -1)}
                            >
                              <Minus className="w-3 h-3" />
                            </Button>
                            <span className="w-8 text-center font-medium">{item.quantity}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateQuantity(item.item_id, 1)}
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>

                          <Input
                            placeholder="Special instructions..."
                            value={item.special_instructions}
                            onChange={(e) => updateInstructions(item.item_id, e.target.value)}
                            className="text-sm"
                          />
                        </div>
                      ))}
                    </div>

                    <div className="border-t pt-4 space-y-2">
                      <div className="flex justify-between text-lg font-bold">
                        <span>Total:</span>
                        <span className="text-green-600">Rs {calculateTotal()}</span>
                      </div>
                      
                      <Button
                        className="w-full"
                        size="lg"
                        onClick={handleSubmitOrder}
                        disabled={submitting}
                      >
                        {submitting ? (
                          'Submitting...'
                        ) : (
                          <>
                            <Send className="w-4 h-4 mr-2" />
                            Submit Order
                          </>
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Mobile Cart Button */}
      {cart.length > 0 && (
        <div className="lg:hidden fixed bottom-4 right-4 z-10">
          <Button
            size="lg"
            className="rounded-full shadow-lg"
            onClick={() => setShowCartDialog(true)}
          >
            <ShoppingCart className="w-5 h-5 mr-2" />
            View Cart ({cartItemCount})
          </Button>
        </div>
      )}

      {/* Table Selection Dialog */}
      <Dialog open={showTableDialog} onOpenChange={setShowTableDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Select Table</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-3 max-h-96 overflow-y-auto">
            {tables.map(table => (
              <Card
                key={table.table_id}
                className={`cursor-pointer hover:border-blue-500 ${
                  selectedTable?.table_id === table.table_id ? 'border-blue-500 bg-blue-50' : ''
                }`}
                onClick={() => {
                  setSelectedTable(table)
                  setShowTableDialog(false)
                }}
              >
                <CardContent className="pt-6 text-center">
                  <p className="text-2xl font-bold">{table.table_number}</p>
                  <p className="text-sm text-gray-800">{table.floor}</p>
                  <Badge variant="success" className="mt-2">Available</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Mobile Cart Dialog */}
      <Dialog open={showCartDialog} onOpenChange={setShowCartDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cart ({cartItemCount} items)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {cart.map(item => (
              <div key={item.item_id} className="border rounded-lg p-3 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">{item.item_name}</p>
                    <p className="text-sm text-green-600">Rs {item.price}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeFromCart(item.item_id)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateQuantity(item.item_id, -1)}
                  >
                    <Minus className="w-3 h-3" />
                  </Button>
                  <span className="w-8 text-center font-medium">{item.quantity}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateQuantity(item.item_id, 1)}
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>

                <Input
                  placeholder="Special instructions..."
                  value={item.special_instructions}
                  onChange={(e) => updateInstructions(item.item_id, e.target.value)}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <div className="w-full space-y-2">
              <div className="flex justify-between text-lg font-bold">
                <span>Total:</span>
                <span className="text-green-600">Rs {calculateTotal()}</span>
              </div>
              <Button
                className="w-full"
                onClick={handleSubmitOrder}
                disabled={submitting}
              >
                {submitting ? 'Submitting...' : 'Submit Order'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function NewOrderPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-800 text-lg">Loading...</p>
        </div>
      </div>
    }>
      <NewOrderContent />
    </Suspense>
  )
}
