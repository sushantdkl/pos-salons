'use client'

import { useState, useEffect } from 'react'
import { Printer, Check } from 'lucide-react'

export default function PaymentPanel({ total, onComplete, onPrint, selectedCustomer }) {
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [cashReceived, setCashReceived] = useState('')
  const [discount, setDiscount] = useState(0)
  const [onlineMethod, setOnlineMethod] = useState('bank')
  const [mixedCash, setMixedCash] = useState('')
  const [mixedOnline, setMixedOnline] = useState('')
  const [mixedOnlineMethod, setMixedOnlineMethod] = useState('bank')
  const [creditAmount, setCreditAmount] = useState('')
  const [creditPaymentMethod, setCreditPaymentMethod] = useState('cash')
  const [creditOnlineMethod, setCreditOnlineMethod] = useState('bank')
  const [settings, setSettings] = useState(null)

  useEffect(() => {
    const saved = localStorage.getItem('posSettings')
    if (saved) {
      setSettings(JSON.parse(saved))
    }
  }, [])

  const finalTotal = total - discount
  const change = paymentMethod === 'cash' ? (parseFloat(cashReceived) || 0) - finalTotal : 0

  // For credit: calculate amount paid now vs credit balance
  const creditAmountValue = parseFloat(creditAmount) || 0
  const amountPaidNow = paymentMethod === 'credit' ? finalTotal - creditAmountValue : finalTotal

  const handleComplete = () => {
    if (paymentMethod === 'cash' && !cashReceived) {
      alert('Enter cash received amount')
      return
    }

    if (paymentMethod === 'mixed') {
      const cashAmt = parseFloat(mixedCash) || 0
      const onlineAmt = parseFloat(mixedOnline) || 0
      if (cashAmt + onlineAmt < finalTotal) {
        alert('Total payment must equal or exceed final total')
        return
      }
    }

    if (paymentMethod === 'credit') {
      if (!selectedCustomer) {
        alert('Please select a customer to use credit payment')
        return
      }
      if (creditAmountValue <= 0) {
        alert('Credit amount must be greater than 0')
        return
      }
      if (creditAmountValue > finalTotal) {
        alert('Credit amount cannot exceed total')
        return
      }
    }

    onComplete({
      method: paymentMethod,
      cashReceived: parseFloat(cashReceived) || 0,
      discount,
      change,
      onlineMethod: paymentMethod === 'online' ? onlineMethod : (paymentMethod === 'credit' && creditPaymentMethod === 'online' ? creditOnlineMethod : undefined),
      mixedCash: paymentMethod === 'mixed' ? parseFloat(mixedCash) || 0 : undefined,
      mixedOnline: paymentMethod === 'mixed' ? parseFloat(mixedOnline) || 0 : undefined,
      mixedOnlineMethod: paymentMethod === 'mixed' ? mixedOnlineMethod : undefined,
      creditAmount: paymentMethod === 'credit' ? creditAmountValue : 0,
      creditPaymentMethod: paymentMethod === 'credit' ? creditPaymentMethod : undefined,
      amountPaid: paymentMethod === 'credit' ? amountPaidNow : finalTotal
    })
  }

  return (
    <div className="pos-stat-card border-2 border-secondary space-y-3">
      <h3 className="font-semibold text-foreground">Payment</h3>

      {/* Discount */}
      <div>
        <label className="text-sm text-muted-foreground block mb-1">Discount (Rs)</label>
        <input
          type="number"
          value={discount}
          onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
          step="0.01"
          className="w-full px-3 py-2 border border-border rounded bg-input text-foreground text-sm"
        />
      </div>

      {/* Payment Method */}
      <div>
        <label className="text-sm text-muted-foreground block mb-1">Payment Method</label>
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded bg-input text-foreground text-sm font-semibold"
        >
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="online">Online</option>
          <option value="mixed">Mixed</option>
          <option value="credit" disabled={!selectedCustomer}>
            Credit/Udharo {!selectedCustomer && '(Select customer first)'}
          </option>
        </select>
      </div>

      {/* Cash Input */}
      {paymentMethod === 'cash' && (
        <div>
          <label className="text-sm text-muted-foreground block mb-1">Cash Received (Rs)</label>
          <input
            type="number"
            value={cashReceived}
            onChange={(e) => setCashReceived(e.target.value)}
            step="0.01"
            className="w-full px-3 py-2 border border-border rounded bg-input text-foreground text-sm font-semibold"
            placeholder="0.00"
            autoFocus
          />
          {change > 0 && (
            <div className="mt-2 p-2 bg-green-500/10 border border-green-500 rounded text-sm font-bold text-green-700 dark:text-green-400">
              Change: Rs {change.toFixed(2)}
            </div>
          )}
        </div>
      )}

      {/* Online Payment */}
      {paymentMethod === 'online' && settings && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              onClick={() => setOnlineMethod('bank')}
              className={`flex-1 py-2 px-3 rounded border text-sm font-semibold transition-colors ${
                onlineMethod === 'bank' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
              }`}
            >
              Bank
            </button>
            <button
              onClick={() => setOnlineMethod('esewa')}
              className={`flex-1 py-2 px-3 rounded border text-sm font-semibold transition-colors ${
                onlineMethod === 'esewa' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
              }`}
            >
              eSewa
            </button>
          </div>
          {onlineMethod === 'bank' && settings.bankQR && (
            <div className="border border-border rounded-lg p-3 bg-white dark:bg-slate-900">
              <p className="text-xs text-muted-foreground mb-2 text-center">Scan to pay Rs {finalTotal.toFixed(2)}</p>
              <img src={settings.bankQR} alt="Bank QR" className="w-48 h-48 mx-auto" />
            </div>
          )}
          {onlineMethod === 'esewa' && settings.esewaQR && (
            <div className="border border-border rounded-lg p-3 bg-white dark:bg-slate-900">
              <p className="text-xs text-muted-foreground mb-2 text-center">Scan to pay Rs {finalTotal.toFixed(2)}</p>
              <img src={settings.esewaQR} alt="eSewa QR" className="w-48 h-48 mx-auto" />
            </div>
          )}
          {onlineMethod === 'bank' && !settings.bankQR && (
            <p className="text-xs text-destructive">Bank QR not configured in settings</p>
          )}
          {onlineMethod === 'esewa' && !settings.esewaQR && (
            <p className="text-xs text-destructive">eSewa QR not configured in settings</p>
          )}
        </div>
      )}

      {/* Mixed Payment */}
      {paymentMethod === 'mixed' && settings && (
        <div className="space-y-3">
          <div>
            <label className="text-sm text-muted-foreground block mb-1">Cash Amount (Rs)</label>
            <input
              type="number"
              value={mixedCash}
              onChange={(e) => {
                const cash = parseFloat(e.target.value) || 0
                setMixedCash(e.target.value)
                setMixedOnline((finalTotal - cash).toFixed(2))
              }}
              step="0.01"
              className="w-full px-3 py-2 border border-border rounded bg-input text-foreground text-sm"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground block mb-1">Online Amount (Rs)</label>
            <input
              type="number"
              value={mixedOnline}
              onChange={(e) => setMixedOnline(e.target.value)}
              step="0.01"
              className="w-full px-3 py-2 border border-border rounded bg-input text-foreground text-sm"
              placeholder="0.00"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setMixedOnlineMethod('bank')}
              className={`flex-1 py-2 px-3 rounded border text-sm font-semibold transition-colors ${
                mixedOnlineMethod === 'bank' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
              }`}
            >
              Bank
            </button>
            <button
              onClick={() => setMixedOnlineMethod('esewa')}
              className={`flex-1 py-2 px-3 rounded border text-sm font-semibold transition-colors ${
                mixedOnlineMethod === 'esewa' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
              }`}
            >
              eSewa
            </button>
          </div>
          {mixedOnlineMethod === 'bank' && settings.bankQR && (
            <div className="border border-border rounded-lg p-3 bg-white dark:bg-slate-900">
              <p className="text-xs text-muted-foreground mb-2 text-center">Scan to pay Rs {mixedOnline}</p>
              <img src={settings.bankQR} alt="Bank QR" className="w-40 h-40 mx-auto" />
            </div>
          )}
          {mixedOnlineMethod === 'esewa' && settings.esewaQR && (
            <div className="border border-border rounded-lg p-3 bg-white dark:bg-slate-900">
              <p className="text-xs text-muted-foreground mb-2 text-center">Scan to pay Rs {mixedOnline}</p>
              <img src={settings.esewaQR} alt="eSewa QR" className="w-40 h-40 mx-auto" />
            </div>
          )}
        </div>
      )}

      {/* Credit/Udharo Payment */}
      {paymentMethod === 'credit' && (
        <div className="space-y-3 p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-lg">
          <div className="flex items-center gap-2 text-sm font-semibold text-orange-700 dark:text-orange-400">
            <span>🧾</span>
            <span>Credit Sale to: {selectedCustomer?.name || selectedCustomer?.phone}</span>
          </div>
          
          <div>
            <label className="text-sm text-muted-foreground block mb-1">Amount on Credit (Udharo) (Rs)</label>
            <input
              type="number"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
              step="0.01"
              max={finalTotal}
              className="w-full px-3 py-2 border border-orange-300 dark:border-orange-700 rounded bg-input text-foreground text-sm font-semibold"
              placeholder="0.00"
              autoFocus
            />
            <p className="text-xs text-muted-foreground mt-1">Maximum: Rs {finalTotal.toFixed(2)}</p>
          </div>

          <div>
            <label className="text-sm text-muted-foreground block mb-1">Payment Method for Amount Paid Now</label>
            <select
              value={creditPaymentMethod}
              onChange={(e) => setCreditPaymentMethod(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded bg-input text-foreground text-sm"
            >
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="online">Online</option>
            </select>
          </div>

          {/* Online QR for Credit Payment */}
          {creditPaymentMethod === 'online' && settings && amountPaidNow > 0 && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={() => setCreditOnlineMethod('bank')}
                  type="button"
                  className={`flex-1 py-2 px-3 rounded border text-sm font-semibold transition-colors ${
                    creditOnlineMethod === 'bank' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
                  }`}
                >
                  Bank
                </button>
                <button
                  onClick={() => setCreditOnlineMethod('esewa')}
                  type="button"
                  className={`flex-1 py-2 px-3 rounded border text-sm font-semibold transition-colors ${
                    creditOnlineMethod === 'esewa' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
                  }`}
                >
                  eSewa
                </button>
              </div>
              {creditOnlineMethod === 'bank' && settings.bankQR && (
                <div className="border border-border rounded-lg p-3 bg-white dark:bg-slate-900">
                  <p className="text-xs text-muted-foreground mb-2 text-center">Scan to pay Rs {amountPaidNow.toFixed(2)}</p>
                  <img src={settings.bankQR} alt="Bank QR" className="w-48 h-48 mx-auto" />
                </div>
              )}
              {creditOnlineMethod === 'esewa' && settings.esewaQR && (
                <div className="border border-border rounded-lg p-3 bg-white dark:bg-slate-900">
                  <p className="text-xs text-muted-foreground mb-2 text-center">Scan to pay Rs {amountPaidNow.toFixed(2)}</p>
                  <img src={settings.esewaQR} alt="eSewa QR" className="w-48 h-48 mx-auto" />
                </div>
              )}
              {creditOnlineMethod === 'bank' && !settings.bankQR && (
                <p className="text-xs text-destructive">Bank QR not configured in settings</p>
              )}
              {creditOnlineMethod === 'esewa' && !settings.esewaQR && (
                <p className="text-xs text-destructive">eSewa QR not configured in settings</p>
              )}
            </div>
          )}

          <div className="border-t border-orange-200 dark:border-orange-800 pt-2 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Amount Paid Now:</span>
              <span className="font-bold text-green-600 dark:text-green-400">Rs {amountPaidNow.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Credit Amount:</span>
              <span className="font-bold text-orange-600 dark:text-orange-400">Rs {creditAmountValue.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Total Display */}
      <div className="border-t border-border pt-2 space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Final Total:</span>
          <span className="font-bold text-lg text-primary">Rs {finalTotal.toFixed(2)}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-2 pt-2">
        <button
          onClick={handleComplete}
          className="w-full bg-green-600 dark:bg-green-700 text-white py-3 rounded-lg font-bold hover:bg-green-700 dark:hover:bg-green-800 transition-colors flex items-center justify-center gap-2"
        >
          <Check size={18} />
          Complete Sale (Ctrl+P)
        </button>
        <button
          onClick={onPrint}
          className="w-full flex items-center justify-center gap-2 border border-border py-2 rounded-lg hover:bg-muted transition-colors font-semibold"
        >
          <Printer size={16} />
          Print Receipt
        </button>
      </div>
    </div>
  )
}
