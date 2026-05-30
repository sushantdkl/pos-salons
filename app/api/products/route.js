import { NextResponse } from 'next/server'
import { getShopDbFromRequest } from '@/lib/get-shop-db'

// GET - List all products or search
export async function GET(request) {
  try {
    const db = getShopDbFromRequest(request)
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const category = searchParams.get('category')

    let query = 'SELECT * FROM products WHERE 1=1'
    const params = []

    if (search) {
      query += ' AND (name LIKE ? OR barcode LIKE ?)'
      params.push(`%${search}%`, `%${search}%`)
    }

    if (category && category !== 'all') {
      query += ' AND category = ?'
      params.push(category)
    }

    query += ' ORDER BY name ASC'

    const stmt = db.prepare(query)
    const products = stmt.all(...params)

    return NextResponse.json({ success: true, products })
  } catch (error) {
    console.error('Error fetching products:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// POST - Create new product
export async function POST(request) {
  try {
    const db = getShopDbFromRequest(request)
    const body = await request.json()
    const { name, barcode, category, price, stock, unit, min_stock } = body

    // Validate required fields
    if (!name || !barcode || !category || price === undefined || stock === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Check if barcode already exists
    const existing = db.prepare('SELECT id FROM products WHERE barcode = ?').get(barcode)
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Product with this barcode already exists' },
        { status: 400 }
      )
    }

    const stmt = db.prepare(`
      INSERT INTO products (name, barcode, category, price, stock, unit, min_stock)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    const result = stmt.run(
      name,
      barcode,
      category,
      parseFloat(price),
      parseInt(stock),
      unit || 'pcs',
      min_stock || 10
    )

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid)

    return NextResponse.json({ success: true, product }, { status: 201 })
  } catch (error) {
    console.error('Error creating product:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// PUT - Update product
export async function PUT(request) {
  try {
    const db = getShopDbFromRequest(request)
    const body = await request.json()
    const { id, name, barcode, category, price, stock, unit, min_stock } = body

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Product ID is required' },
        { status: 400 }
      )
    }

    // Check if barcode is being changed and if it conflicts
    if (barcode) {
      const existing = db.prepare('SELECT id FROM products WHERE barcode = ? AND id != ?').get(barcode, id)
      if (existing) {
        return NextResponse.json(
          { success: false, error: 'Another product with this barcode already exists' },
          { status: 400 }
        )
      }
    }

    const updates = []
    const params = []

    if (name !== undefined) {
      updates.push('name = ?')
      params.push(name)
    }
    if (barcode !== undefined) {
      updates.push('barcode = ?')
      params.push(barcode)
    }
    if (category !== undefined) {
      updates.push('category = ?')
      params.push(category)
    }
    if (price !== undefined) {
      updates.push('price = ?')
      params.push(parseFloat(price))
    }
    if (stock !== undefined) {
      updates.push('stock = ?')
      params.push(parseInt(stock))
    }
    if (unit !== undefined) {
      updates.push('unit = ?')
      params.push(unit)
    }
    if (min_stock !== undefined) {
      updates.push('min_stock = ?')
      params.push(parseInt(min_stock))
    }

    updates.push('updated_at = CURRENT_TIMESTAMP')
    params.push(id)

    const stmt = db.prepare(`
      UPDATE products 
      SET ${updates.join(', ')}
      WHERE id = ?
    `)

    stmt.run(...params)

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id)

    return NextResponse.json({ success: true, product })
  } catch (error) {
    console.error('Error updating product:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// DELETE - Delete product
export async function DELETE(request) {
  try {
    const db = getShopDbFromRequest(request)
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Product ID is required' },
        { status: 400 }
      )
    }

    db.prepare('DELETE FROM products WHERE id = ?').run(id)
    const result = stmt.run(id)

    if (result.changes === 0) {
      return NextResponse.json(
        { success: false, error: 'Product not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, message: 'Product deleted' })
  } catch (error) {
    console.error('Error deleting product:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
