import { NextResponse } from 'next/server'
import { getShopDbFromRequest } from '@/lib/get-shop-db'

// GET - List all ingredients
export async function GET(request) {
  try {
    const db = getShopDbFromRequest(request)
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')

    let query = 'SELECT * FROM ingredients WHERE 1=1'
    const params = []

    if (search) {
      query += ' AND name LIKE ?'
      params.push(`%${search}%`)
    }

    query += ' ORDER BY name ASC'

    const stmt = db.prepare(query)
    const ingredients = stmt.all(...params)

    return NextResponse.json({ success: true, ingredients })
  } catch (error) {
    console.error('Error fetching ingredients:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// POST - Create new ingredient
export async function POST(request) {
  try {
    const db = getShopDbFromRequest(request)
    const body = await request.json()
    const { name, unit, stock, min_stock, cost_per_unit } = body

    if (!name || !unit) {
      return NextResponse.json(
        { success: false, error: 'Name and unit are required' },
        { status: 400 }
      )
    }

    const stmt = db.prepare(`
      INSERT INTO ingredients (name, unit, stock, min_stock, cost_per_unit)
      VALUES (?, ?, ?, ?, ?)
    `)

    const result = stmt.run(
      name,
      unit,
      parseFloat(stock) || 0,
      parseFloat(min_stock) || 5,
      parseFloat(cost_per_unit) || 0
    )

    const ingredient = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(result.lastInsertRowid)

    return NextResponse.json({ success: true, ingredient }, { status: 201 })
  } catch (error) {
    console.error('Error creating ingredient:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// PUT - Update ingredient
export async function PUT(request) {
  try {
    const db = getShopDbFromRequest(request)
    const body = await request.json()
    const { id, name, unit, stock, min_stock, cost_per_unit } = body

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Ingredient ID is required' },
        { status: 400 }
      )
    }

    const updates = []
    const params = []

    if (name !== undefined) {
      updates.push('name = ?')
      params.push(name)
    }
    if (unit !== undefined) {
      updates.push('unit = ?')
      params.push(unit)
    }
    if (stock !== undefined) {
      updates.push('stock = ?')
      params.push(parseFloat(stock))
    }
    if (min_stock !== undefined) {
      updates.push('min_stock = ?')
      params.push(parseFloat(min_stock))
    }
    if (cost_per_unit !== undefined) {
      updates.push('cost_per_unit = ?')
      params.push(parseFloat(cost_per_unit))
    }

    updates.push('updated_at = CURRENT_TIMESTAMP')
    params.push(id)

    const stmt = db.prepare(`
      UPDATE ingredients 
      SET ${updates.join(', ')}
      WHERE id = ?
    `)

    stmt.run(...params)

    const ingredient = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(id)

    return NextResponse.json({ success: true, ingredient })
  } catch (error) {
    console.error('Error updating ingredient:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// DELETE - Delete ingredient
export async function DELETE(request) {
  try {
    const db = getShopDbFromRequest(request)
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Ingredient ID is required' },
        { status: 400 }
      )
    }

    const stmt = db.prepare('DELETE FROM ingredients WHERE id = ?')
    const result = stmt.run(id)

    if (result.changes === 0) {
      return NextResponse.json(
        { success: false, error: 'Ingredient not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, message: 'Ingredient deleted' })
  } catch (error) {
    console.error('Error deleting ingredient:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
