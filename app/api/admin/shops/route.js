import { NextResponse } from 'next/server'
import adminDb from '@/lib/admin-db'
import { getRestaurantDatabase } from '@/lib/shop-db'

// GET - List all shops
export async function GET() {
  try {
    const shops = adminDb.prepare(`
      SELECT 
        s.*,
        ss.total_sales as last_month_sales,
        ss.total_transactions as last_month_transactions
      FROM shops s
      LEFT JOIN shop_stats ss ON s.id = ss.shop_id 
        AND ss.date >= date('now', '-30 days')
      ORDER BY s.created_at DESC
    `).all()

    return NextResponse.json({ success: true, shops })
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// POST - Create new shop
export async function POST(request) {
  try {
    const body = await request.json()
    const { 
      shopName, 
      ownerName, 
      ownerPhone, 
      ownerEmail, 
      address, 
      city, 
      district,
      province,
      subscriptionPlan = 'basic',
      username,
      password
    } = body

    // Validate required fields
    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username and password are required' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 6 characters' },
        { status: 400 }
      )
    }

    // Check if username already exists
    const existingShop = adminDb.prepare('SELECT id FROM shops WHERE username = ?').get(username)
    if (existingShop) {
      return NextResponse.json(
        { success: false, error: 'Username already exists' },
        { status: 400 }
      )
    }

    // Hash password
    const bcrypt = require('bcryptjs')
    const passwordHash = bcrypt.hashSync(password, 10)

    // Generate shop ID
    const shopCount = adminDb.prepare('SELECT COUNT(*) as count FROM shops').get()
    const shopId = `shop_${String(shopCount.count + 1).padStart(4, '0')}`

    // Calculate subscription dates
    const startDate = new Date()
    const endDate = new Date()
    endDate.setMonth(endDate.getMonth() + 1)

    // Insert shop into admin database
    adminDb.prepare(`
      INSERT INTO shops (
        id, shop_name, owner_name, owner_phone, owner_email,
        address, city, district, province,
        subscription_plan, subscription_status,
        subscription_start, subscription_end,
        monthly_fee, database_file, username, password_hash
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      shopId,
      shopName,
      ownerName,
      ownerPhone,
      ownerEmail,
      address,
      city,
      district,
      province,
      subscriptionPlan,
      'trial',
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0],
      subscriptionPlan === 'basic' ? 1500 : subscriptionPlan === 'premium' ? 3000 : 5000,
      `${shopId}.db`,
      username,
      passwordHash
    )

    // Create shop's local database
    const shopDb = getRestaurantDatabase(shopId)
    shopDb.prepare(`
      INSERT INTO shop_info (shop_id, shop_name, owner_name, phone, address, city)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(shopId, shopName, ownerName, ownerPhone, address, city)

    return NextResponse.json({ 
      success: true, 
      shop: { 
        id: shopId, 
        name: shopName,
        message: `Shop created successfully! Shop ID: ${shopId}` 
      }
    }, { status: 201 })

  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// PUT - Update shop
export async function PUT(request) {
  try {
    const body = await request.json()
    const { shopId, password, ...updates } = body

    const fields = []
    const values = []

    // Handle password change separately if provided
    if (password) {
      const bcrypt = require('bcryptjs')
      const passwordHash = bcrypt.hashSync(password, 10)
      updates.password_hash = passwordHash
    }

    Object.entries(updates).forEach(([key, value]) => {
      fields.push(`${key} = ?`)
      values.push(value)
    })

    if (fields.length === 0) {
      return NextResponse.json({ success: false, error: 'No fields to update' }, { status: 400 })
    }

    values.push(shopId)

    adminDb.prepare(`
      UPDATE shops 
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(...values)

    return NextResponse.json({ success: true, message: 'Shop updated successfully' })

  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// DELETE - Delete shop (careful!)
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url)
    const shopId = searchParams.get('id')

    if (!shopId) {
      return NextResponse.json({ success: false, error: 'Shop ID required' }, { status: 400 })
    }

    // Delete from admin database
    adminDb.prepare('DELETE FROM shops WHERE id = ?').run(shopId)
    adminDb.prepare('DELETE FROM shop_stats WHERE shop_id = ?').run(shopId)
    adminDb.prepare('DELETE FROM all_transactions WHERE shop_id = ?').run(shopId)

    return NextResponse.json({ success: true, message: 'Shop deleted successfully' })

  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
