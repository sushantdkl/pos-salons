'use client'

import { X, Printer } from 'lucide-react'
import { useRef, useEffect, useState } from 'react'

export default function ReceiptPrinter({ data, onClose }) {
  const receiptRef = useRef(null)
  const [settings, setSettings] = useState({
    restaurant_name: 'Restaurant',
    restaurant_address: '',
    restaurant_phone: '',
    vat_percentage: 13,
    owner_name: ''
  })

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const token = localStorage.getItem('pos_token')
      const res = await fetch('/api/admin/settings', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        if (data.settings) {
          setSettings({
            restaurant_name: data.settings.restaurant_name || 'Restaurant',
            restaurant_address: data.settings.restaurant_address || '',
            restaurant_phone: data.settings.restaurant_phone || '',
            vat_percentage: data.settings.vat_percentage || 13,
            owner_name: data.settings.owner_name || ''
          })
        }
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }

  const handlePrint = () => {
    const printWindow = window.open('', '', 'width=400,height=600')
    if (printWindow && receiptRef.current) {
      printWindow.document.write(receiptRef.current.innerHTML)
      printWindow.document.close()
      printWindow.print()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg shadow-2xl w-full max-w-sm">
        {/* Header */}
        <div className="bg-primary text-primary-foreground p-4 flex justify-between items-center">
          <h3 className="font-semibold">Receipt Preview</h3>
          <button onClick={onClose} className="hover:bg-primary-foreground/20 p-1 rounded">
            <X size={20} />
          </button>
        </div>

        {/* Receipt Content */}
        <div className="p-4 bg-white dark:bg-slate-900 overflow-y-auto max-h-96">
          <div
            ref={receiptRef}
            className="text-center font-mono text-xs text-black dark:text-white"
            style={{ width: '80mm', margin: '0 auto' }}
          >
            {/* Header */}
            <div className="border-b border-gray-400 pb-2 mb-2">
              <div className="font-bold text-sm">{settings.restaurant_name.toUpperCase()}</div>
              {settings.restaurant_address && <div className="text-xs">{settings.restaurant_address}</div>}
              {settings.restaurant_phone && <div className="text-xs">Tel: {settings.restaurant_phone}</div>}
              {settings.owner_name && <div className="text-xs">Owner: {settings.owner_name}</div>}
              <div className="text-xs">Bill No: {data.billNumber || 'B-' + Date.now().toString().slice(-7)}</div>
              <div className="text-xs">Date: {new Date().toLocaleString()}</div>
              <div className="text-xs">Cashier: {data.cashierName || 'Staff'}</div>
            </div>

            {/* Items */}
            <div className="text-left text-xs mb-2">
              <div className="flex justify-between font-bold border-b border-gray-400 pb-1 mb-1">
                <span>Item</span>
                <span className="text-right">Total</span>
              </div>
              {data.items.map((item, idx) => (
                <div key={idx} className="flex justify-between mb-1">
                  <div className="flex-1">
                    <div>{item.name}</div>
                    <div className="text-gray-600 dark:text-gray-400">
                      {item.quantity} × Rs {item.price.toFixed(2)}
                    </div>
                  </div>
                  <div className="text-right font-bold">
                    Rs {(item.quantity * item.price).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="border-t-2 border-b-2 border-gray-400 py-2 text-xs mb-2">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="font-bold">Rs {data.subtotal.toFixed(2)}</span>
              </div>
              {data.discount > 0 && (
                <div className="flex justify-between">
                  <span>Discount:</span>
                  <span className="font-bold">-Rs {data.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>VAT ({settings.vat_percentage}%):</span>
                <span className="font-bold">Rs {data.vat.toFixed(2)}</span>
              </div>
            </div>

            {/* Grand Total */}
            <div className="text-sm font-bold mb-2">
              TOTAL: Rs {data.total.toFixed(2)}
            </div>

            {/* Payment Info */}
            {data.paymentMethod === 'cash' && (
              <div className="border-t border-gray-400 pt-2 text-xs mb-2">
                <div className="flex justify-between">
                  <span>Cash Received:</span>
                  <span className="font-bold">Rs {data.cashReceived.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Change:</span>
                  <span className="font-bold">Rs {(data.cashReceived - data.total).toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="border-t border-gray-400 pt-2 text-xs text-gray-600 dark:text-gray-400">
              <div>Thank you!</div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="border-t border-border p-4 space-y-2">
          <button
            onClick={handlePrint}
            className="w-full bg-primary text-primary-foreground py-2 rounded-lg font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
          >
            <Printer size={16} />
            Print Receipt
          </button>
          <button
            onClick={onClose}
            className="w-full border border-border py-2 rounded-lg font-semibold hover:bg-muted transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
