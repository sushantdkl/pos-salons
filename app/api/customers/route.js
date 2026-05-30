import { getShopDbFromRequest } from '@/lib/get-shop-db'

// GET - List all customers or search
export async function GET(request) {
  try {
    const db = getShopDbFromRequest(request)
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const phone = searchParams.get('phone')

    let customers

    if (phone) {
      // Search by exact phone number
      customers = db.prepare(`
        SELECT * FROM customers 
        WHERE phone = ?
      `).all(phone)
    } else if (search) {
      // Search by name or phone
      customers = db.prepare(`
        SELECT * FROM customers 
        WHERE name LIKE ? OR phone LIKE ?
        ORDER BY last_purchase_at DESC
      `).all(`%${search}%`, `%${search}%`)
    } else {
      // Get all customers
      customers = db.prepare(`
        SELECT * FROM customers 
        ORDER BY last_purchase_at DESC
      `).all()
    }

    return Response.json({ success: true, customers })
  } catch (error) {
    console.error('Error fetching customers:', error)
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 })
  }
}

// POST - Create new customer
export async function POST(request) {
  try {
    const db = getShopDbFromRequest(request)
    const body = await request.json()
    const { phone, name, age, address } = body

    if (!phone || !name) {
      return Response.json({ 
        success: false, 
        error: 'Phone and name are required' 
      }, { status: 400 })
    }

    // Check if customer already exists
    const existing = db.prepare('SELECT id FROM customers WHERE phone = ?').get(phone)
    if (existing) {
      return Response.json({ 
        success: false, 
        error: 'Customer with this phone number already exists' 
      }, { status: 400 })
    }

    const result = db.prepare(`
      INSERT INTO customers (phone, name, age, address)
      VALUES (?, ?, ?, ?)
    `).run(phone, name, age || null, address || null)

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid)

    return Response.json({ 
      success: true, 
      customer,
      message: 'Customer created successfully' 
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating customer:', error)
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 })
  }
}

// PUT - Update customer
export async function PUT(request) {
  try {
    const db = getShopDbFromRequest(request)
    const body = await request.json()
    const { id, phone, name, age, address, credit_balance } = body

    if (!id) {
      return Response.json({ 
        success: false, 
        error: 'Customer ID is required' 
      }, { status: 400 })
    }

    const updates = []
    const values = []

    if (phone !== undefined) {
      updates.push('phone = ?')
      values.push(phone)
    }
    if (name !== undefined) {
      updates.push('name = ?')
      values.push(name)
    }
    if (age !== undefined) {
      updates.push('age = ?')
      values.push(age)
    }
    if (address !== undefined) {
      updates.push('address = ?')
      values.push(address)
    }
    if (credit_balance !== undefined) {
      updates.push('credit_balance = ?')
      values.push(credit_balance)
    }

    if (updates.length === 0) {
      return Response.json({ 
        success: false, 
        error: 'No fields to update' 
      }, { status: 400 })
    }

    updates.push('updated_at = CURRENT_TIMESTAMP')
    values.push(id)

    db.prepare(`
      UPDATE customers 
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...values)

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id)

    return Response.json({ 
      success: true, 
      customer,
      message: 'Customer updated successfully' 
    })
  } catch (error) {
    console.error('Error updating customer:', error)
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 })
  }
}

// DELETE - Delete customer
export async function DELETE(request) {
  try {
    const db = getShopDbFromRequest(request)
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return Response.json({ 
        success: false, 
        error: 'Customer ID is required' 
      }, { status: 400 })
    }

    db.prepare('DELETE FROM customers WHERE id = ?').run(id)

    return Response.json({ 
      success: true, 
      message: 'Customer deleted successfully' 
    })
  } catch (error) {
    console.error('Error deleting customer:', error)
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 })
  }
}
