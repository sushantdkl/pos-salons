'use client'

import { Minus, Plus, Trash2, Bold as Hold, RotateCcw } from 'lucide-react'

export default function BillingCart({
  items,
  onQuantityChange,
  onRateChange,
  onRemove,
  onClear,
  onHold,
  subtotal,
  vat,
  total,
  heldCount,
  onShowHeldBills
}) {
  return (
    <div className="pos-stat-card border-2 border-primary" style={{ height: '600px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <h3 className="text-xl font-bold mb-4 text-foreground" style={{ flexShrink: 0 }}>Current Bill</h3>

      {/* Cart Items - FIXED HEIGHT */}
      <div 
        className="overflow-y-scroll space-y-2 mb-4 p-3 bg-muted/30 rounded border border-border"
        style={{ height: '300px', flexShrink: 0 }}
      >
        {items.length === 0 ? (
          <p className="text-muted-foreground text-center py-8 text-sm">
            No items added yet
          </p>
        ) : (
          items.map((item, idx) => (
            <div
              key={`${item.id}-${idx}`}
              className="bg-card p-3 rounded border border-border space-y-2 hover:border-primary/50 transition-colors"
            >
              {/* Item Header */}
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="font-semibold text-sm">{item.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Source: {item.scanned_source || 'manual'}
                  </div>
                </div>
                <button
                  onClick={() => onRemove(item.id)}
                  className="text-destructive hover:bg-destructive/10 p-1 rounded transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {/* Rate & Qty Row */}
              <div className="flex flex-col sm:grid sm:grid-cols-2 gap-2 text-xs">
                <div className="w-full">
                  <label className="text-muted-foreground block mb-1">Rate</label>
                  <input
                    type="number"
                    value={item.price}
                    onChange={(e) => onRateChange(item.id, e.target.value)}
                    step="0.01"
                    className="w-full px-2 py-1 border border-border rounded bg-input text-foreground"
                  />
                </div>
                <div className="w-full">
                  <label className="text-muted-foreground block mb-1">Qty</label>
                  <div className="flex gap-1 w-full">
                    <button
                      onClick={() => onQuantityChange(item.id, item.quantity - 1)}
                      className="w-8 h-8 flex items-center justify-center bg-border rounded hover:bg-primary/20 transition-colors flex-shrink-0"
                    >
                      <Minus size={12} />
                    </button>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => onQuantityChange(item.id, parseInt(e.target.value) || 0)}
                      className="w-12 text-center px-1 py-1 bg-input border border-border rounded flex-shrink-0"
                    />
                    <button
                      onClick={() => onQuantityChange(item.id, item.quantity + 1)}
                      className="w-8 h-8 flex items-center justify-center bg-border rounded hover:bg-primary/20 transition-colors flex-shrink-0"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Total */}
              <div className="text-right text-sm font-bold border-t border-border pt-1">
                Rs {(item.price * item.quantity).toFixed(2)}
              </div>
            </div>
          ))
        )}
      </div>

      {items.length > 0 && (
        <div style={{ flexShrink: 0 }}>
          {/* Totals */}
          <div className="space-y-2 text-sm border-t border-border pt-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal:</span>
              <span className="font-bold">Rs {subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">VAT (13%):</span>
              <span className="font-bold">Rs {vat.toFixed(2)}</span>
            </div>
            <div className="border-t border-border pt-2 flex justify-between text-lg font-bold text-primary">
              <span>Total:</span>
              <span>Rs {total.toFixed(2)}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-4 space-y-2">
            <button
              onClick={onHold}
              className="w-full flex items-center justify-center gap-2 bg-secondary text-secondary-foreground py-2 rounded-lg hover:bg-secondary/90 transition-colors font-semibold text-sm"
            >
              <Hold size={16} />
              Hold Bill (Ctrl+H)
            </button>

            <div className="grid grid-cols-2 gap-2">
              {heldCount > 0 && (
                <button
                  onClick={onShowHeldBills}
                  className="flex items-center justify-center gap-1 border border-border py-2 rounded-lg hover:bg-muted transition-colors font-semibold text-sm"
                >
                  <RotateCcw size={14} />
                  Resume ({heldCount})
                </button>
              )}

              <button
                onClick={onClear}
                className={`flex items-center justify-center gap-1 text-destructive border border-destructive py-2 rounded-lg hover:bg-destructive/10 transition-colors font-semibold text-sm ${heldCount === 0 ? 'col-span-2' : ''}`}
              >
                <Trash2 size={14} />
                Clear Bill
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
