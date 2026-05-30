'use client'

import { useState, useEffect } from 'react'
import { Search, Plus, Minus, Trash2, Printer } from 'lucide-react'

export default function BillingScreen() {
  const [billItems, setBillItems] = useState([])
  const [products, setProducts] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filteredProducts, setFilteredProducts] = useState([])
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [discount, setDiscount] = useState(0)
  const [discountType, setDiscountType] = useState('amount')
  const [vat] = useState(15)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [processing, setProcessing] = useState(false)

  // Fetch products from API
  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    try {
      const response = await fetch('/api/products')
      const data = await response.json()
      if (data.success) {
        setProducts(data.products)
        setFilteredProducts(data.products.slice(0, 6))
      }
    } catch (error) {
      console.error('Error fetching products:', error)
    }
  }

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
      setFilteredProducts(products.slice(0, 6))
      setShowSearchResults(false)
    }
  }

  // Select product from search results
  const selectProductFromSearch = (product) => {
    addItem(product)
    setSearchTerm('')
    setShowSearchResults(false)
  }

  const addItem = (product) => {
    const existing = billItems.find(item => item.id === product.id)
    if (existing) {
      setBillItems(billItems.map(item =>
        item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
      ))
    } else {
      setBillItems([...billItems, { ...product, quantity: 1 }])
    }
  }

  const updateQuantity = (id, quantity) => {
    if (quantity <= 0) {
      setBillItems(billItems.filter(item => item.id !== id))
    } else {
      setBillItems(billItems.map(item =>
        item.id === id ? { ...item, quantity } : item
      ))
    }
  }

  const removeItem = (id) => {
    setBillItems(billItems.filter(item => item.id !== id))
  }

  const subtotal = billItems.reduce((sum, item) => sum + (item.price * item.quantity), 0)
  const discountAmount = discountType === 'amount' ? discount : (subtotal * discount) / 100
  const taxableAmount = subtotal - discountAmount
  const vatAmount = (taxableAmount * vat) / 100
  const total = taxableAmount + vatAmount

  const handleCompleteSale = async () => {
    if (billItems.length === 0) return

    try {
      setProcessing(true)
      
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: billItems.map(item => ({
            id: item.id,
            name: item.name,
            barcode: item.barcode,
            price: item.price,
            quantity: item.quantity
          })),
          payment_method: paymentMethod,
          amount_paid: total,
          discount: discountAmount,
          tax: vatAmount
        })
      })

      const data = await response.json()
      
      if (data.success) {
        alert(`Sale completed! Transaction #${data.transaction.transaction_number}`)
        setBillItems([])
        setDiscount(0)
        setSearchTerm('')
        // Refresh products to update stock
        fetchProducts()
      } else {
        alert(data.error || 'Failed to complete sale')
      }
    } catch (error) {
      console.error('Error completing sale:', error)
      alert('Failed to complete sale')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="p-8">
      <h2 className="text-3xl font-bold mb-6">Billing / Cashier Screen</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left side - Product Search */}
        <div className="space-y-4">
          <div className="relative">
            <Search size={20} className="absolute left-3 top-3 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search products or scan barcode..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filteredProducts.length === 1) {
                  selectProductFromSearch(filteredProducts[0])
                }
                if (e.key === 'Escape') {
                  setSearchTerm('')
                  setShowSearchResults(false)
                  setFilteredProducts(products.slice(0, 6))
                }
              }}
              className="w-full pl-10 pr-4 py-3 border border-border rounded-lg bg-input text-foreground text-lg"
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
                    <div className="font-bold text-foreground">{product.name}</div>
                    <div className="text-sm text-primary font-bold">Rs {product.price}</div>
                    <div className="text-xs text-muted-foreground">
                      Stock: {product.stock || 'N/A'} | Barcode: {product.barcode}
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

          <div className="pos-stat-card max-h-96 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(!showSearchResults ? filteredProducts : []).map(product => (
                <button
                  key={product.id}
                  onClick={() => addItem(product)}
                  disabled={product.stock === 0}
                  className="p-4 border border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="font-bold text-foreground">{product.name}</div>
                  <div className="text-sm text-primary font-bold">Rs {product.price}</div>
                  <div className="text-xs text-muted-foreground">Stock: {product.stock || 'N/A'}</div>
                </button>
              ))}
              {!showSearchResults && filteredProducts.length === 0 && (
                <div className="col-span-2 text-center text-muted-foreground py-8">
                  No products available
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right side - Bill Summary */}
        <div className="relative" style={{ height: '700px' }}>
          <div className="pos-stat-card border-2 border-primary absolute inset-0 flex flex-col">
            <h3 className="text-xl font-bold mb-4">Current Bill</h3>

            {/* Cart Items - FIXED HEIGHT with scroll */}
            <div 
              className="bg-muted/30 rounded border border-border p-4 overflow-y-scroll space-y-2"
              style={{ height: '240px' }}
            >
              {billItems.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No items added</p>
              ) : (
                billItems.map(item => (
                  <div key={item.id} className="bg-card p-3 rounded border border-border flex-shrink-0">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-semibold text-sm flex-1 mr-2">{item.name}</div>
                      <button onClick={() => removeItem(item.id)} className="text-destructive flex-shrink-0">
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="text-xs text-muted-foreground">Rs {item.price}</div>
                      <div className="flex gap-1 items-center">
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          className="w-7 h-7 flex items-center justify-center text-xs bg-border rounded hover:bg-primary/20 flex-shrink-0"
                        >
                          <Minus size={12} />
                        </button>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateQuantity(item.id, parseInt(e.target.value))}
                          className="w-10 text-center text-xs bg-input border border-border rounded flex-shrink-0"
                        />
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="w-7 h-7 flex items-center justify-center text-xs bg-border rounded hover:bg-primary/20 flex-shrink-0"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>
                    <div className="mt-1 text-right text-sm font-bold">Rs {(item.price * item.quantity).toFixed(2)}</div>
                  </div>
                ))
              )}
            </div>

            {/* Totals and Payment */}
            {billItems.length > 0 && (
              <div className="mt-4">
                <div className="space-y-2 text-sm border-t border-border pt-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal:</span>
                    <span className="font-bold">Rs {subtotal.toFixed(2)}</span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={discount}
                        onChange={(e) => setDiscount(parseFloat(e.target.value))}
                        className="flex-1 px-2 py-1 border border-border rounded bg-input text-sm"
                        placeholder="0"
                      />
                      <select
                        value={discountType}
                        onChange={(e) => setDiscountType(e.target.value)}
                        className="px-2 py-1 border border-border rounded bg-input text-sm"
                      >
                        <option value="amount">Rs</option>
                        <option value="percent">%</option>
                      </select>
                    </div>
                    <div className="flex justify-between text-muted-foreground text-xs">
                      <span>Discount:</span>
                      <span>Rs {discountAmount.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-muted-foreground">VAT ({vat}%):</span>
                    <span>Rs {vatAmount.toFixed(2)}</span>
                  </div>

                  <div className="border-t border-border pt-2 flex justify-between text-lg font-bold text-primary">
                    <span>Total:</span>
                    <span>Rs {total.toFixed(2)}</span>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded bg-input text-sm font-semibold"
                  >
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="mobile">Mobile Payment</option>
                    <option value="check">Check</option>
                  </select>

                  <button 
                    onClick={handleCompleteSale}
                    disabled={processing}
                    className="w-full bg-green-600 dark:bg-green-700 text-white py-3 rounded-lg font-bold hover:bg-green-700 dark:hover:bg-green-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {processing ? 'Processing...' : 'Complete Sale'}
                  </button>

                  <button className="w-full flex items-center justify-center gap-2 border border-border py-2 rounded-lg hover:bg-muted transition-colors font-semibold">
                    <Printer size={18} />
                    Print Bill
                  </button>

                  <button
                    onClick={() => setBillItems([])}
                    className="w-full text-destructive border border-destructive py-2 rounded-lg hover:bg-destructive/10 transition-colors font-semibold"
                  >
                    Clear Bill
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
