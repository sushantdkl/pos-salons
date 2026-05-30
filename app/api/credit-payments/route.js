import { NextResponse } from 'next/server'
import { getShopDbFromRequest } from '@/lib/get-shop-db'

// GET - List credit payments for a customer
export async function GET(request) {
  try {
    const db = getShopDbFromRequest(request)
    const { searchParams } = new URL(request.url)
    const customer_id = searchParams.get('customer_id')

    if (!customer_id) {
      return NextResponse.json(
        { success: false, error: 'Customer ID is required' },
        { status: 400 }
      )
    }

    const payments = db.prepare(`
      SELECT cp.*, t.transaction_number 
      FROM credit_payments cp
      LEFT JOIN transactions t ON cp.transaction_id = t.id
      WHERE cp.customer_id = ?
      ORDER BY cp.created_at DESC
    `).all(parseInt(customer_id))

    return NextResponse.json({ success: true, payments })
  } catch (error) {
    console.error('Error fetching credit payments:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// POST - Record a credit payment
export async function POST(request) {
  try {
    const db = getShopDbFromRequest(request)
    const body = await request.json()
    const { customer_id, amount, payment_method = 'Cash', notes = '', transaction_id = null } = body

    if (!customer_id || !amount) {
      return NextResponse.json(
        { success: false, error: 'Customer ID and amount are required' },
        { status: 400 }
      )
    }

    const paymentAmount = parseFloat(amount)

    if (paymentAmount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Payment amount must be greater than 0' },
        { status: 400 }
      )
    }

    // Get customer current credit balance
    const customer = db.prepare('SELECT credit_balance FROM customers WHERE id = ?').get(customer_id)
    
    if (!customer) {
      return NextResponse.json(
        { success: false, error: 'Customer not found' },
        { status: 404 }
      )
    }

    if (paymentAmount > customer.credit_balance) {
      return NextResponse.json(
        { success: false, error: `Payment amount (Rs ${paymentAmount}) exceeds credit balance (Rs ${customer.credit_balance})` },
        { status: 400 }
      )
    }

    // Start transaction
    const recordPayment = db.transaction(() => {
      // Insert credit payment record
      const result = db.prepare(`
        INSERT INTO credit_payments (customer_id, transaction_id, amount, payment_method, notes)
        VALUES (?, ?, ?, ?, ?)
      `).run(customer_id, transaction_id || null, paymentAmount, payment_method, notes)

      // Update customer credit balance
      db.prepare(`
        UPDATE customers 
        SET credit_balance = credit_balance - ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(paymentAmount, customer_id)

      return result.lastInsertRowid
    })

    const paymentId = recordPayment()

    // Fetch updated customer and payment record
    const updatedCustomer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id)
    const payment = db.prepare('SELECT * FROM credit_payments WHERE id = ?').get(paymentId)

    return NextResponse.json({ 
      success: true, 
      payment,
      customer: updatedCustomer,
      message: `Payment of Rs ${paymentAmount.toFixed(2)} recorded. Remaining credit: Rs ${updatedCustomer.credit_balance.toFixed(2)}`
    }, { status: 201 })
  } catch (error) {
    console.error('Error recording credit payment:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
