'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, Plus, Minus, Trash2, Printer, Camera, Bold as Hold, Play, X, AlertTriangle, Volume2, User, Phone } from 'lucide-react'
import BarcodeScanner from './barcode-scanner'
import BillingCart from './billing-cart'
import PaymentPanel from './payment-panel'
import ReceiptPrinter from './receipt-printer'
import HeldBillsModal from './held-bills-modal'

export default function AdvancedBillingScreen() {
  const [cart, setCart] = useState([])
  const [products, setProducts] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [showCamera, setShowCamera] = useState(false)
  const [showHeldBills, setShowHeldBills] = useState(false)
  const [paymentData, setPaymentData] = useState(null)
  const [heldBills, setHeldBills] = useState([])
  const [error, setError] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)
  const [filteredProducts, setFilteredProducts] = useState([])
  const [showSearchResults, setShowSearchResults] = useState(false)
  const searchInputRef = useRef(null)
  const audioRef = useRef(null)
  
  // Customer selection
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [showCustomerForm, setShowCustomerForm] = useState(false)
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerAge, setCustomerAge] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')

  // Fetch products from API
  useEffect(() => {
    fetchProducts()
    fetchHeldBills()
  }, [])

  const fetchProducts = async () => {
    try {
      const response = await fetch('/api/products')
      const data = await response.json()
      if (data.success) {
        setProducts(data.products)
      }
    } catch (error) {
      console.error('Error fetching products:', error)
    }
  }

  const fetchHeldBills = async () => {
    try {
      const response = await fetch('/api/held-bills')
      const data = await response.json()
      if (data.success) {
        setHeldBills(data.bills)
      }
    } catch (error) {
      console.error('Error fetching held bills:', error)
    }
  }

  // Play success beep
  const playBeep = () => {
    if (audioRef.current) {
      audioRef.current.play().catch(() => {})
    }
  }

  // Format number to currency
  const formatCurrency = (num) => `Rs ${num.toFixed(2)}`

  // Handle search input changes
  const handleSearchChange = (value) => {
    setSearchTerm(value)
    
    if (value.trim()) {
      const filtered = products.filter(p => 
        p.name.toLowerCase().includes(value.toLowerCase()) || 
        p.barcode.includes(value)
      )
      setFilteredProducts(filtered)
      setShowSearchResults(true)
    } else {
      setFilteredProducts([])
      setShowSearchResults(false)
    }
  }

  // Select product from search results
  const selectProductFromSearch = (product) => {
    if (product.stock <= 0) {
      setError(`${product.name} is out of stock`)
      setTimeout(() => setError(null), 3000)
      return
    }

    addToCart(product, 'manual')
    setSearchTerm('')
    setFilteredProducts([])
    setShowSearchResults(false)
    setError(null)
    playBeep()
    searchInputRef.current?.focus()
  }

  // Search and add product
  const handleSearchProduct = (term) => {
    if (!term.trim()) return

    const product = products.find(
      p => p.name.toLowerCase().includes(term.toLowerCase()) || p.barcode === term
    )

    if (product) {
      if (product.stock <= 0) {
        setError(`${product.name} is out of stock`)
        setTimeout(() => setError(null), 3000)
        return
      }

      addToCart(product, 'manual')
      setSearchTerm('')
      setError(null)
      playBeep()
      searchInputRef.current?.focus()
    } else {
      setError(`Product "${term}" not found`)
      setTimeout(() => setError(null), 3000)
    }
  }

  // Handle barcode scan (camera or scanner)
  const handleBarcodeScan = (barcode, source = 'scanner') => {
    const product = products.find(p => p.barcode === barcode)

    if (product) {
      if (product.stock <= 0) {
        setError(`${product.name} is out of stock`)
        setTimeout(() => setError(null), 3000)
        return
      }

      addToCart(product, source)
      setShowCamera(false)
      playBeep()
      setError(null)
    } else {
      setShowCamera(false)
      setError(`Barcode ${barcode} not found in database`)
      setTimeout(() => setError(null), 3000)
    }
  }

  // Add product to cart
  const addToCart = (product, source = 'manual') => {
    setCart(prevCart => {
      const existing = prevCart.find(item => item.id === product.id)
      if (existing) {
        if (existing.quantity < product.stock) {
          return prevCart.map(item =>
            item.id === product.id ? { ...item, quantity: item.quantity + 1, scanned_source: source } : item
          )
        } else {
          setError(`Insufficient stock: only ${product.stock} available`)
          return prevCart
        }
      } else {
        return [...prevCart, { ...product, quantity: 1, scanned_source: source }]
      }
    })
  }

  // Update cart item quantity
  const updateCartQuantity = (productId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(productId)
    } else {
      const product = products.find(p => p.id === productId)
      if (quantity > product.stock) {
        setError(`Only ${product.stock} items available`)
        return
      }
      setCart(prevCart =>
        prevCart.map(item => item.id === productId ? { ...item, quantity } : item)
      )
    }
  }

  // Update cart item rate
  const updateCartRate = (productId, newRate) => {
    setCart(prevCart =>
      prevCart.map(item => item.id === productId ? { ...item, price: parseFloat(newRate) } : item)
    )
  }

  // Remove from cart
  const removeFromCart = (productId) => {
    setCart(prevCart => prevCart.filter(item => item.id !== productId))
  }

  // Clear entire cart
  const clearCart = () => {
    if (window.confirm('Clear entire bill? This cannot be undone.')) {
      setCart([])
    }
  }

  // Hold current bill
  const holdBill = async () => {
    if (cart.length === 0) {
      setError('Cart is empty')
      return
    }

    try {
      const response = await fetch('/api/held-bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map(item => ({
            id: item.id,
            name: item.name,
            barcode: item.barcode,
            price: item.price,
            quantity: item.quantity
          })),
          held_by: 'Cashier'
        })
      })

      const data = await response.json()
      
      if (data.success) {
        setSuccessMessage('Bill held successfully')
        setTimeout(() => setSuccessMessage(null), 2000)
        setCart([])
        fetchHeldBills()
      } else {
        setError(data.error || 'Failed to hold bill')
        setTimeout(() => setError(null), 3000)
      }
    } catch (error) {
      console.error('Error holding bill:', error)
      setError('Failed to hold bill')
      setTimeout(() => setError(null), 3000)
    }
  }

  // Resume held bill
  const resumeBill = async (billId) => {
    try {
      const response = await fetch(`/api/held-bills?id=${billId}`)
      const data = await response.json()
      
      if (data.success && data.bill) {
        const bill = data.bill
        const cartItems = bill.items.map(item => ({
          id: item.global_product_id,
          name: item.product_name,
          barcode: item.product_barcode,
          price: item.price,
          quantity: item.quantity,
          stock: products.find(p => p.id === item.global_product_id)?.stock || 0
        }))
        
        setCart(cartItems)
        
        // Delete the held bill
        await fetch(`/api/held-bills?id=${billId}`, { method: 'DELETE' })
        
        setSuccessMessage('Bill resumed')
        setTimeout(() => setSuccessMessage(null), 2000)
        setShowHeldBills(false)
        fetchHeldBills()
      }
    } catch (error) {
      console.error('Error resuming bill:', error)
      setError('Failed to resume bill')
      setTimeout(() => setError(null), 3000)
    }
  }

  // Customer management functions
  const searchCustomerByPhone = async (phone) => {
    try {
      const response = await fetch(`/api/customers?phone=${phone}`)
      const data = await response.json()
      if (data.success && data.customers.length > 0) {
        setSelectedCustomer(data.customers[0])
        setShowCustomerForm(false)
        return true
      }
      return false
    } catch (error) {
      console.error('Error searching customer:', error)
      return false
    }
  }

  const createCustomer = async () => {
    if (!customerPhone || !customerName) {
      setError('Phone and name are required')
      return
    }

    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: customerPhone,
          name: customerName,
          age: customerAge || null,
          address: customerAddress || null
        })
      })

      const data = await response.json()
      if (data.success) {
        setSelectedCustomer(data.customer)
        setShowCustomerForm(false)
        setCustomerPhone('')
        setCustomerName('')
        setCustomerAge('')
        setCustomerAddress('')
        setSuccessMessage('Customer added successfully')
        setTimeout(() => setSuccessMessage(null), 2000)
      } else {
        setError(data.error)
      }
    } catch (error) {
      setError('Error creating customer')
    }
  }

  // Complete sale and update stock
  const completeSale = async (paymentInfo) => {
    if (cart.length === 0) {
      setError('Cart is empty')
      return
    }

    try {
      // Calculate amount paid based on payment method
      let amountPaid = 0
      const creditAmount = paymentInfo.creditAmount || 0
      
      if (paymentInfo.method === 'cash') {
        amountPaid = paymentInfo.cashReceived
      } else if (paymentInfo.method === 'mixed') {
        amountPaid = (paymentInfo.mixedCash || 0) + (paymentInfo.mixedOnline || 0)
      } else if (paymentInfo.method === 'credit') {
        // For credit transactions, use the calculated amountPaid from payment panel
        amountPaid = paymentInfo.amountPaid
      } else {
        // For card, online, or other methods, amount paid equals total
        amountPaid = cartTotal
      }

      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: selectedCustomer?.id || null,
          items: cart.map(item => ({
            id: item.id,
            name: item.name,
            barcode: item.barcode,
            price: item.price,
            quantity: item.quantity
          })),
          payment_method: paymentInfo.method === 'credit' ? paymentInfo.creditPaymentMethod : paymentInfo.method,
          amount_paid: amountPaid,
          discount: paymentInfo.discount,
          tax: cartVAT,
          credit_amount: creditAmount
        })
      })

      const data = await response.json()
      
      if (data.success) {
        setPaymentData({
          items: cart,
          paymentMethod: paymentInfo.method,
          cashReceived: paymentInfo.cashReceived,
          subtotal: cartSubtotal,
          discount: paymentInfo.discount,
          vat: cartVAT,
          total: cartTotal,
          transactionNumber: data.transaction.transaction_number,
          scannedSources: cart.map(item => item.scanned_source)
        })

        const customerInfo = selectedCustomer ? ` for ${selectedCustomer.name}` : ' (Guest)'
        const creditInfo = creditAmount > 0 ? ` | Credit: Rs ${creditAmount.toFixed(2)}` : ''
        setSuccessMessage(`Sale completed! Transaction #${data.transaction.transaction_number}${customerInfo}${creditInfo}`)
        setTimeout(() => setSuccessMessage(null), 3000)
        setCart([])
        
        // Clear customer selection after sale
        setSelectedCustomer(null)
        setCustomerPhone('')
        
        // Refresh products to update stock
        fetchProducts()
      } else {
        setError(data.error || 'Failed to complete sale')
        setTimeout(() => setError(null), 3000)
      }
    } catch (error) {
      console.error('Error completing sale:', error)
      setError('Failed to complete sale')
      setTimeout(() => setError(null), 3000)
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '1') {
          e.preventDefault()
          searchInputRef.current?.focus()
        } else if (e.key === 'h') {
          e.preventDefault()
          holdBill()
        } else if (e.key === 'p') {
          e.preventDefault()
          // Would trigger print
        } else if (e.key === 'r') {
          e.preventDefault()
          setShowHeldBills(true)
        }
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [cart])

  // Cart calculations
  const cartSubtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)
  const cartVAT = cartSubtotal * 0.13
  const cartTotal = cartSubtotal + cartVAT

  return (
    <div className="p-3 sm:p-4 lg:p-6 bg-background min-h-screen space-y-3 sm:space-y-4">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-4 mb-4 sm:mb-6">
        <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold">Billing</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHeldBills(true)}
            className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-semibold text-sm"
          >
            <Play size={16} />
            <span>Held Bills {heldBills.length > 0 && `(${heldBills.length})`}</span>
          </button>
          <div className="text-xs sm:text-sm text-muted-foreground hidden lg:block">
            <div>Ctrl+1: Search | Ctrl+H: Hold | Ctrl+R: Resume</div>
          </div>
        </div>
      </div>

      {error && (
        <div className="fixed top-4 right-4 z-[100] animate-in slide-in-from-top-2 duration-300">
          <div className="bg-destructive text-destructive-foreground p-4 rounded-lg shadow-2xl border-2 border-destructive flex items-center gap-3 min-w-[300px] max-w-md">
            <div className="flex-shrink-0 bg-destructive-foreground text-destructive rounded-full p-2">
              <AlertTriangle size={20} />
            </div>
            <div className="flex-1">
              <div className="font-bold text-sm">Product Not Found</div>
              <div className="text-xs opacity-90 mt-0.5">{error}</div>
            </div>
            <button 
              onClick={() => setError(null)}
              className="flex-shrink-0 hover:opacity-70 transition-opacity"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="bg-green-500/10 border border-green-500 text-green-700 dark:text-green-400 p-3 sm:p-4 rounded-lg text-sm sm:text-base">
          ✓ {successMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
        {/* Left side - Product Input */}
        <div className="space-y-3 sm:space-y-4">
          {/* Search Input */}
          <div className="relative">
            <Search size={20} className="absolute left-3 top-3 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search or scan..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (filteredProducts.length === 1) {
                    selectProductFromSearch(filteredProducts[0])
                  } else {
                    handleSearchProduct(searchTerm)
                  }
                }
                if (e.key === 'Escape') {
                  setSearchTerm('')
                  setShowSearchResults(false)
                  setFilteredProducts([])
                }
              }}
              className="w-full pl-10 pr-4 py-2 sm:py-3 border-2 border-primary rounded-lg bg-input text-foreground text-sm sm:text-lg font-semibold focus:outline-none"
              autoFocus
            />
            
            {/* Search Results Dropdown */}
            {showSearchResults && filteredProducts.length > 0 && (
              <div className="absolute top-full left-0 right-0 bg-card border border-border rounded-lg shadow-lg z-50 mt-1 max-h-60 overflow-y-auto">
                {filteredProducts.map(product => (
                  <button
                    key={product.id}
                    onClick={() => selectProductFromSearch(product)}
                    disabled={product.stock === 0}
                    className="w-full text-left px-4 py-3 hover:bg-muted border-b border-border last:border-b-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="font-semibold text-foreground">{product.name}</div>
                    <div className="text-sm text-primary font-bold">{formatCurrency(product.price)}</div>
                    <div className="text-xs text-muted-foreground">
                      Stock: {product.stock} | Barcode: {product.barcode}
                    </div>
                  </button>
                ))}
              </div>
            )}
            
            {/* No Results Message */}
            {showSearchResults && filteredProducts.length === 0 && searchTerm.trim() && (
              <div className="absolute top-full left-0 right-0 bg-card border border-border rounded-lg shadow-lg z-50 mt-1">
                <div className="px-4 py-3 text-muted-foreground text-center">
                  No products found for "{searchTerm}"
                </div>
              </div>
            )}
          </div>

          {/* Camera Scan Button */}
          <button
            onClick={() => setShowCamera(!showCamera)}
            className="w-full bg-secondary text-secondary-foreground py-2 sm:py-3 rounded-lg font-semibold flex items-center justify-center gap-2 hover:bg-secondary/90 transition-colors text-sm sm:text-base"
          >
            <Camera size={18} className="sm:w-5 sm:h-5" />
            {showCamera ? 'Close Camera' : 'Scan with Camera'}
          </button>

          {/* Camera Scanner */}
          {showCamera && (
            <BarcodeScanner
              onDetect={(barcode) => handleBarcodeScan(barcode, 'camera')}
              onClose={() => setShowCamera(false)}
            />
          )}

          {/* Quick Product Buttons - responsive grid */}
          <div className="pos-stat-card">
            <h3 className="text-xs sm:text-sm font-semibold mb-2 sm:mb-3 text-muted-foreground">Quick Add</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-2">
              {products.map(product => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product, 'manual')}
                  disabled={product.stock === 0}
                  className="p-2 sm:p-3 border border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm"
                >
                  <div className="font-semibold line-clamp-1">{product.name}</div>
                  <div className="text-xs sm:text-sm text-primary font-bold">{formatCurrency(product.price)}</div>
                  <div className="text-xs text-muted-foreground">Stock: {product.stock}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right side - Cart & Payment */}
        <div className="space-y-3 sm:space-y-4">
          <BillingCart
            items={cart}
            onQuantityChange={updateCartQuantity}
            onRateChange={updateCartRate}
            onRemove={removeFromCart}
            onClear={clearCart}
            onHold={holdBill}
            subtotal={cartSubtotal}
            vat={cartVAT}
            total={cartTotal}
            heldCount={heldBills.length}
            onShowHeldBills={() => setShowHeldBills(true)}
          />

          {cart.length > 0 && (
            <>
              {/* Customer Selection - Below Cart */}
              <div className="pos-stat-card p-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <User size={16} />
                    Customer {!selectedCustomer && <span className="text-xs text-muted-foreground font-normal">(Optional - Guest if empty)</span>}
                  </h3>
                  {selectedCustomer && (
                    <button
                      onClick={() => setSelectedCustomer(null)}
                      className="text-xs text-destructive hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>

                {selectedCustomer ? (
                  <div className="bg-primary/10 p-2 rounded">
                    <p className="font-bold text-sm">{selectedCustomer.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Phone size={12} />
                      {selectedCustomer.phone}
                    </p>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      placeholder="Phone number"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      onKeyPress={async (e) => {
                        if (e.key === 'Enter' && customerPhone) {
                          const found = await searchCustomerByPhone(customerPhone)
                          if (!found) setShowCustomerForm(true)
                        }
                      }}
                      className="flex-1 px-3 py-2 border border-border rounded text-sm bg-input"
                    />
                    <button
                      onClick={async () => {
                        if (!customerPhone) return
                        const found = await searchCustomerByPhone(customerPhone)
                        if (!found) setShowCustomerForm(true)
                      }}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-semibold hover:bg-primary/90 whitespace-nowrap"
                    >
                      Find / Add
                    </button>
                  </div>
                )}
              </div>

              <PaymentPanel
                total={cartTotal}
                onComplete={completeSale}
                onPrint={() => {}}
                selectedCustomer={selectedCustomer}
              />
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      {showHeldBills && (
        <HeldBillsModal
          bills={heldBills}
          onResume={resumeBill}
          onClose={() => setShowHeldBills(false)}
        />
      )}

      {paymentData && (
        <ReceiptPrinter
          data={paymentData}
          onClose={() => setPaymentData(null)}
        />
      )}

      {/* Customer Form Modal */}
      {showCustomerForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-lg shadow-2xl w-full max-w-md">
            <div className="bg-primary text-primary-foreground p-4 flex justify-between items-center rounded-t-lg">
              <h3 className="text-lg font-semibold">New Customer</h3>
              <button 
                onClick={() => {
                  setShowCustomerForm(false)
                  setCustomerPhone('')
                  setCustomerName('')
                  setCustomerAge('')
                  setCustomerAddress('')
                }}
                className="hover:bg-primary-foreground/20 p-1 rounded text-2xl"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Phone Number *</label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full px-4 py-2 border border-border rounded-lg bg-input"
                  placeholder="98XXXXXXXX"
                  readOnly
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Full Name *</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-4 py-2 border border-border rounded-lg bg-input"
                  placeholder="Customer name"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Age</label>
                  <input
                    type="number"
                    value={customerAge}
                    onChange={(e) => setCustomerAge(e.target.value)}
                    className="w-full px-4 py-2 border border-border rounded-lg bg-input"
                    placeholder="Optional"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Address</label>
                  <input
                    type="text"
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    className="w-full px-4 py-2 border border-border rounded-lg bg-input"
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={createCustomer}
                  className="flex-1 bg-primary text-primary-foreground py-3 rounded-lg font-semibold hover:bg-primary/90"
                >
                  Save Customer
                </button>
                <button
                  onClick={() => {
                    setShowCustomerForm(false)
                    setCustomerPhone('')
                    setCustomerName('')
                    setCustomerAge('')
                    setCustomerAddress('')
                  }}
                  className="px-6 border border-border py-3 rounded-lg font-semibold hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden audio element for beep */}
      <audio
        ref={audioRef}
        src="data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA=="
      />
    </div>
  )
}
