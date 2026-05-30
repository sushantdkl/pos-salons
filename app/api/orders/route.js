import { NextResponse } from 'next/server'
import { getShopDbFromRequest } from '@/lib/get-shop-db'

// GET - List all orders or get specific order
export async function GET(request) {
  try {
    const db = getShopDbFromRequest(request)
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const customer_id = searchParams.get('customer_id')
    const status = searchParams.get('status')
    const table_number = searchParams.get('table_number')
    const limit = searchParams.get('limit') || 50

    if (id) {
      // Get specific order with items
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id)
      
      if (!order) {
        return NextResponse.json(
          { success: false, error: 'Order not found' },
          { status: 404 }
        )
      }

      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id)
      order.items = items

      return NextResponse.json({ success: true, order })
    }

    // Build query based on filters
    let query = 'SELECT * FROM orders WHERE 1=1'
    const params = []

    if (customer_id) {
      query += ' AND customer_id = ?'
      params.push(parseInt(customer_id))
    }

    if (status) {
      query += ' AND status = ?'
      params.push(status)
    }

    if (table_number) {
      query += ' AND table_number = ?'
      params.push(table_number)
    }

    query += ' ORDER BY created_at DESC LIMIT ?'
    params.push(parseInt(limit))

    const orders = db.prepare(query).all(...params)

    // Fetch items for each order
    const itemsStmt = db.prepare('SELECT * FROM order_items WHERE order_id = ?')
    orders.forEach(order => {
      order.items = itemsStmt.all(order.id)
    })

    return NextResponse.json({ success: true, orders })
  } catch (error) {
    console.error('Error fetching orders:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// POST - Create new order
export async function POST(request) {
  try {
    const db = getShopDbFromRequest(request)
    const body = await request.json()
    const { 
      customer_id, 
      customer_name,
      customer_phone,
      table_number,
      order_type = 'dine-in',
      items, 
      payment_method, 
      amount_paid, 
      discount = 0, 
      tax = 0, 
      credit_amount = 0,
      notes,
      status = 'pending'
    } = body

    if (!items || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No items in order' },
        { status: 400 }
      )
    }

    const creditAmount = parseFloat(credit_amount) || 0

    // Validate credit transaction requires customer
    if (creditAmount > 0 && !customer_id) {
      return NextResponse.json(
        { success: false, error: 'Customer ID required for credit orders' },
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
    const paid = parseFloat(amount_paid) || 0
    const change = paid - total

    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`

    // Start transaction
    const insertOrder = db.transaction((items, customerId, creditAmt) => {
      // Insert order
      const orderStmt = db.prepare(`
        INSERT INTO orders (
          order_number, table_number, order_type, customer_id, customer_name, customer_phone,
          total, discount, tax, final_total, payment_method, amount_paid, 
          change_amount, credit_amount, status, notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      const result = orderStmt.run(
        orderNumber,
        table_number || null,
        order_type,
        customerId || null,
        customer_name || null,
        customer_phone || null,
        subtotal,
        discountAmount,
        taxAmount,
        total,
        payment_method || null,
        paid,
        change,
        creditAmt,
        status,
        notes || null
      )

      const orderId = result.lastInsertRowid

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

      // Insert order items
      const itemStmt = db.prepare(`
        INSERT INTO order_items (
          order_id, menu_item_id, menu_item_name, 
          quantity, price, subtotal, special_instructions, status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)

      for (const item of items) {
        itemStmt.run(
          orderId,
          item.id,
          item.name,
          item.quantity,
          item.price,
          item.price * item.quantity,
          item.special_instructions || null,
          'pending'
        )
      }

      return orderId
    })

    const orderId = insertOrder(items, customer_id, creditAmount)

    // Fetch complete order
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId)
    const orderItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId)
    order.items = orderItems

    return NextResponse.json({ success: true, order }, { status: 201 })
  } catch (error) {
    console.error('Error creating order:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// PUT - Update order status
export async function PUT(request) {
  try {
    const db = getShopDbFromRequest(request)
    const body = await request.json()
    const { id, status, payment_method, amount_paid } = body

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Order ID is required' },
        { status: 400 }
      )
    }

    const updates = []
    const params = []

    if (status !== undefined) {
      updates.push('status = ?')
      params.push(status)

      if (status === 'completed') {
        updates.push('completed_at = CURRENT_TIMESTAMP')
      }
    }

    if (payment_method !== undefined) {
      updates.push('payment_method = ?')
      params.push(payment_method)
    }

    if (amount_paid !== undefined) {
      updates.push('amount_paid = ?')
      params.push(parseFloat(amount_paid))

      // Recalculate change
      const order = db.prepare('SELECT final_total FROM orders WHERE id = ?').get(id)
      if (order) {
        const change = parseFloat(amount_paid) - order.final_total
        updates.push('change_amount = ?')
        params.push(change)
      }
    }

    updates.push('updated_at = CURRENT_TIMESTAMP')
    params.push(id)

    const stmt = db.prepare(`
      UPDATE orders 
      SET ${updates.join(', ')}
      WHERE id = ?
    `)

    stmt.run(...params)

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id)

    return NextResponse.json({ success: true, order })
  } catch (error) {
    console.error('Error updating order:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// DELETE - Delete order
export async function DELETE(request) {
  try {
    const db = getShopDbFromRequest(request)
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Order ID is required' },
        { status: 400 }
      )
    }

    const stmt = db.prepare('DELETE FROM orders WHERE id = ?')
    const result = stmt.run(id)

    if (result.changes === 0) {
      return NextResponse.json(
        { success: false, error: 'Order not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, message: 'Order deleted' })
  } catch (error) {
    console.error('Error deleting order:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
