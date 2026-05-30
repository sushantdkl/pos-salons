import { NextResponse } from 'next/server'
import { getShopDbFromRequest } from '@/lib/get-shop-db'

// GET - List all held bills
export async function GET(request) {
  try {
    const db = getShopDbFromRequest(request)
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (id) {
      // Get specific held bill
      const bill = db.prepare('SELECT * FROM held_bills WHERE id = ?').get(id)
      
      if (!bill) {
        return NextResponse.json(
          { success: false, error: 'Held bill not found' },
          { status: 404 }
        )
      }

      const items = db.prepare('SELECT * FROM held_bill_items WHERE held_bill_id = ?').all(id)
      bill.items = items

      return NextResponse.json({ success: true, bill })
    }

    // Get all held bills
    const bills = db.prepare(`
      SELECT hb.*, 
        (SELECT COUNT(*) FROM held_bill_items WHERE held_bill_id = hb.id) as item_count,
        (SELECT SUM(price * quantity) FROM held_bill_items WHERE held_bill_id = hb.id) as total
      FROM held_bills hb
      ORDER BY hb.created_at DESC
    `).all()

    return NextResponse.json({ success: true, bills })
  } catch (error) {
    console.error('Error fetching held bills:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// POST - Create new held bill
export async function POST(request) {
  try {
    const db = getShopDbFromRequest(request)
    const body = await request.json()
    const { items, held_by } = body

    if (!items || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No items in bill' },
        { status: 400 }
      )
    }

    // Calculate total
    let total = 0
    for (const item of items) {
      total += item.price * item.quantity
    }

    // Start transaction
    const insertHeldBill = db.transaction((items) => {
      // Insert held bill
      const billStmt = db.prepare(`
        INSERT INTO held_bills (held_by, total)
        VALUES (?, ?)
      `)

      const result = billStmt.run(held_by || 'Cashier', total)
      const heldBillId = result.lastInsertRowid

      // Insert held bill items
      const itemStmt = db.prepare(`
        INSERT INTO held_bill_items (
          held_bill_id, global_product_id, product_name, product_barcode, 
          quantity, price
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `)

      for (const item of items) {
        itemStmt.run(
          heldBillId,
          item.id,
          item.name,
          item.barcode,
          item.quantity,
          item.price
        )
      }

      return heldBillId
    })

    const heldBillId = insertHeldBill(items)

    // Fetch complete held bill
    const heldBill = db.prepare('SELECT * FROM held_bills WHERE id = ?').get(heldBillId)
    const heldBillItems = db.prepare('SELECT * FROM held_bill_items WHERE held_bill_id = ?').all(heldBillId)
    heldBill.items = heldBillItems

    return NextResponse.json({ success: true, heldBill }, { status: 201 })
  } catch (error) {
    console.error('Error creating held bill:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// DELETE - Delete held bill
export async function DELETE(request) {
  try {
    const db = getShopDbFromRequest(request)
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Held bill ID is required' },
        { status: 400 }
      )
    }

    const stmt = db.prepare('DELETE FROM held_bills WHERE id = ?')
    const result = stmt.run(id)

    if (result.changes === 0) {
      return NextResponse.json(
        { success: false, error: 'Held bill not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, message: 'Held bill deleted' })
  } catch (error) {
    console.error('Error deleting held bill:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
