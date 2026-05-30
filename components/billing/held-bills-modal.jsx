'use client'

import { X, RotateCcw, Trash2 } from 'lucide-react'

export default function HeldBillsModal({ bills, onResume, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg shadow-2xl w-full max-w-2xl">
        {/* Header */}
        <div className="bg-primary text-primary-foreground p-4 flex justify-between items-center">
          <h3 className="text-lg font-semibold">Held Bills ({bills.length})</h3>
          <button onClick={onClose} className="hover:bg-primary-foreground/20 p-1 rounded">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {bills.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No held bills</p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {bills.map(bill => {
                const total = bill.total || 0
                const itemCount = bill.item_count || 0
                const heldAt = new Date(bill.created_at).toLocaleString()
                return (
                  <div key={bill.id} className="pos-stat-card p-4 flex justify-between items-center">
                    <div>
                      <div className="font-semibold">{itemCount} items</div>
                      <div className="text-sm text-muted-foreground">{heldAt} • {bill.held_by}</div>
                      <div className="text-lg font-bold text-primary mt-1">Rs {total.toFixed(2)}</div>
                    </div>
                    <button
                      onClick={() => {
                        onResume(bill.id)
                      }}
                      className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold hover:bg-primary/90 transition-colors flex items-center gap-2"
                    >
                      <RotateCcw size={16} />
                      Resume
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border p-4">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 border border-border rounded-lg font-semibold hover:bg-muted transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
