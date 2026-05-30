import { NextResponse } from 'next/server'
import { getShopDbFromRequest } from '@/lib/get-shop-db'

// GET - List all transactions or get specific transaction
export async function GET(request) {
  try {
    const db = getShopDbFromRequest(request)
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const customer_id = searchParams.get('customer_id')
    const limit = searchParams.get('limit') || 50

    if (id) {
      // Get specific transaction with items
      const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id)
      
      if (!transaction) {
        return NextResponse.json(
          { success: false, error: 'Transaction not found' },
          { status: 404 }
        )
      }

      const items = db.prepare('SELECT * FROM transaction_items WHERE transaction_id = ?').all(id)
      transaction.items = items

      return NextResponse.json({ success: true, transaction })
    }

    // Get transactions filtered by customer or all
    let transactions
    if (customer_id) {
      transactions = db.prepare(`
        SELECT * FROM transactions 
        WHERE customer_id = ?
        ORDER BY created_at DESC 
        LIMIT ?
      `).all(parseInt(customer_id), parseInt(limit))
    } else {
      transactions = db.prepare(`
        SELECT * FROM transactions 
        ORDER BY created_at DESC 
        LIMIT ?
      `).all(parseInt(limit))
    }

    // Fetch items for each transaction
    const itemsStmt = db.prepare('SELECT * FROM transaction_items WHERE transaction_id = ?')
    transactions.forEach(transaction => {
      transaction.items = itemsStmt.all(transaction.id)
    })

    return NextResponse.json({ success: true, transactions })
  } catch (error) {
    console.error('Error fetching transactions:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// POST - Create new transaction
export async function POST(request) {
  try {
    const db = getShopDbFromRequest(request)
    const body = await request.json()
    const { customer_id, items, payment_method, amount_paid, discount = 0, tax = 0, credit_amount = 0 } = body

    if (!items || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No items in transaction' },
        { status: 400 }
      )
    }

    if (!payment_method || amount_paid === undefined) {
      return NextResponse.json(
        { success: false, error: 'Payment method and amount are required' },
        { status: 400 }
      )
    }

    const creditAmount = parseFloat(credit_amount) || 0

    // Validate credit transaction requires customer
    if (creditAmount > 0 && !customer_id) {
      return NextResponse.json(
        { success: false, error: 'Customer ID required for credit transactions' },
        { status: 400 }
      )
    }

    // Calculate totals
    let subtotal = 0
    for (const item of items) {
      subtotal += item.price * item.quantity
    }

    const discountAmount = parseFloat(discount) || 0
    const taxAmount = parseFloat(tax) || 0
    const total = subtotal - discountAmount + taxAmount
    const paid = parseFloat(amount_paid)
    const change = paid - total

    // Generate transaction number
    const transactionNumber = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`

    // Start transaction
    const insertTransaction = db.transaction((items, customerId, creditAmt) => {
      // Insert transaction
      const txnStmt = db.prepare(`
        INSERT INTO transactions (
          transaction_number, customer_id, total, discount, tax, final_total, 
          payment_method, amount_paid, change_amount, credit_amount
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      const result = txnStmt.run(
        transactionNumber,
        customerId || null,
        subtotal,
        discountAmount,
        taxAmount,
        total,
        payment_method,
        paid,
        change,
        creditAmt
      )

      const transactionId = result.lastInsertRowid

      // Update customer stats if customer_id provided
      if (customerId) {
        db.prepare(`
          UPDATE customers 
          SET total_purchases = total_purchases + 1,
              total_spent = total_spent + ?,
              credit_balance = credit_balance + ?,
              last_purchase_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(total, creditAmt, customerId)
      }

      // Insert transaction items and update stock
      const itemStmt = db.prepare(`
        INSERT INTO transaction_items (
          transaction_id, product_id, product_name, product_barcode, 
          quantity, price, subtotal
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)

      const updateStockStmt = db.prepare(`
        UPDATE products 
        SET stock = stock - ? 
        WHERE id = ?
      `)

      const stockHistoryStmt = db.prepare(`
        INSERT INTO stock_history (
          product_id, change_type, quantity_change, previous_stock, new_stock, reason
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `)

      for (const item of items) {
        // Insert item
        itemStmt.run(
          transactionId,
          item.id,
          item.name,
          item.barcode,
          item.quantity,
          item.price,
          item.price * item.quantity
        )

        // Get current stock
        const product = db.prepare('SELECT stock FROM products WHERE id = ?').get(item.id)
        const previousStock = product.stock
        const newStock = previousStock - item.quantity

        // Update stock
        updateStockStmt.run(item.quantity, item.id)

        // Record stock history
        stockHistoryStmt.run(
          item.id,
          'sale',
          -item.quantity,
          previousStock,
          newStock,
          `Transaction ${transactionNumber}`
        )
      }

      return transactionId
    })

    const transactionId = insertTransaction(items, customer_id, creditAmount)

    // Fetch complete transaction
    const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(transactionId)
    const transactionItems = db.prepare('SELECT * FROM transaction_items WHERE transaction_id = ?').all(transactionId)
    transaction.items = transactionItems

    return NextResponse.json({ success: true, transaction }, { status: 201 })
  } catch (error) {
    console.error('Error creating transaction:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
