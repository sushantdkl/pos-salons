import { NextResponse } from 'next/server'
import { getShopDbFromRequest } from '@/lib/get-shop-db'

// GET - List all menu items or search
export async function GET(request) {
  try {
    const db = getShopDbFromRequest(request)
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const category = searchParams.get('category')
    const available = searchParams.get('available')

    let query = 'SELECT *, base_price as price FROM menu_items WHERE 1=1'
    const params = []

    if (search) {
      query += ' AND (name LIKE ? OR item_code LIKE ?)'
      params.push(`%${search}%`, `%${search}%`)
    }

    if (category && category !== 'all') {
      query += ' AND category = ?'
      params.push(category)
    }

    if (available === 'true') {
      query += ' AND is_available = 1'
    }

    query += ' ORDER BY category, name ASC'

    const stmt = db.prepare(query)
    const menuItems = stmt.all(...params)

    return NextResponse.json({ success: true, menuItems })
  } catch (error) {
    console.error('Error fetching menu items:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// POST - Create new menu item
export async function POST(request) {
  try {
    const db = getShopDbFromRequest(request)
    const body = await request.json()
    const { 
      name, 
      item_code, 
      category, 
      price, 
      description,
      preparation_time,
      is_vegetarian,
      is_spicy,
      image_url
    } = body

    // Validate required fields
    if (!name || !item_code || !category || price === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields (name, item_code, category, price)' },
        { status: 400 }
      )
    }

    // Check if item_code already exists
    const existing = db.prepare('SELECT id FROM menu_items WHERE item_code = ?').get(item_code)
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Menu item with this code already exists' },
        { status: 400 }
      )
    }

    const stmt = db.prepare(`
      INSERT INTO menu_items (
        name, item_code, category, price, description, 
        preparation_time, is_vegetarian, is_spicy, image_url
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const result = stmt.run(
      name,
      item_code,
      category,
      parseFloat(price),
      description || null,
      preparation_time || 15,
      is_vegetarian ? 1 : 0,
      is_spicy ? 1 : 0,
      image_url || null
    )

    const menuItem = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(result.lastInsertRowid)

    return NextResponse.json({ success: true, menuItem }, { status: 201 })
  } catch (error) {
    console.error('Error creating menu item:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// PUT - Update menu item
export async function PUT(request) {
  try {
    const db = getShopDbFromRequest(request)
    const body = await request.json()
    const { 
      id, 
      name, 
      item_code, 
      category, 
      price, 
      description,
      preparation_time,
      is_available,
      is_vegetarian,
      is_spicy,
      image_url
    } = body

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Menu item ID is required' },
        { status: 400 }
      )
    }

    // Check if item_code is being changed and if it conflicts
    if (item_code) {
      const existing = db.prepare('SELECT id FROM menu_items WHERE item_code = ? AND id != ?').get(item_code, id)
      if (existing) {
        return NextResponse.json(
          { success: false, error: 'Another menu item with this code already exists' },
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
    if (item_code !== undefined) {
      updates.push('item_code = ?')
      params.push(item_code)
    }
    if (category !== undefined) {
      updates.push('category = ?')
      params.push(category)
    }
    if (price !== undefined) {
      updates.push('price = ?')
      params.push(parseFloat(price))
    }
    if (description !== undefined) {
      updates.push('description = ?')
      params.push(description)
    }
    if (preparation_time !== undefined) {
      updates.push('preparation_time = ?')
      params.push(parseInt(preparation_time))
    }
    if (is_available !== undefined) {
      updates.push('is_available = ?')
      params.push(is_available ? 1 : 0)
    }
    if (is_vegetarian !== undefined) {
      updates.push('is_vegetarian = ?')
      params.push(is_vegetarian ? 1 : 0)
    }
    if (is_spicy !== undefined) {
      updates.push('is_spicy = ?')
      params.push(is_spicy ? 1 : 0)
    }
    if (image_url !== undefined) {
      updates.push('image_url = ?')
      params.push(image_url)
    }

    updates.push('updated_at = CURRENT_TIMESTAMP')
    params.push(id)

    const stmt = db.prepare(`
      UPDATE menu_items 
      SET ${updates.join(', ')}
      WHERE id = ?
    `)

    stmt.run(...params)

    const menuItem = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id)

    return NextResponse.json({ success: true, menuItem })
  } catch (error) {
    console.error('Error updating menu item:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// DELETE - Delete menu item
export async function DELETE(request) {
  try {
    const db = getShopDbFromRequest(request)
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Menu item ID is required' },
        { status: 400 }
      )
    }

    const stmt = db.prepare('DELETE FROM menu_items WHERE id = ?')
    const result = stmt.run(id)

    if (result.changes === 0) {
      return NextResponse.json(
        { success: false, error: 'Menu item not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, message: 'Menu item deleted' })
  } catch (error) {
    console.error('Error deleting menu item:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
