import { NextResponse } from 'next/server'
import adminDb from '@/lib/admin-db'
const bcrypt = require('bcryptjs')

export async function POST(request) {
  try {
    const { username, password } = await request.json()

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username and password are required' },
        { status: 400 }
      )
    }

    // Get shop from database
    const shop = adminDb.prepare('SELECT * FROM shops WHERE username = ?').get(username)

    console.log('Shop from DB:', shop)

    if (!shop) {
      return NextResponse.json(
        { success: false, error: 'Invalid username or password' },
        { status: 401 }
      )
    }

    // Check if shop is active or in trial
    if (shop.status === 'suspended' || shop.status === 'expired') {
      return NextResponse.json(
        { success: false, error: 'Your subscription has expired. Please contact admin.' },
        { status: 403 }
      )
    }

    // Verify password
    const isValidPassword = bcrypt.compareSync(password, shop.password_hash)

    if (!isValidPassword) {
      return NextResponse.json(
        { success: false, error: 'Invalid username or password' },
        { status: 401 }
      )
    }

    // Check trial/subscription status
    const now = new Date().toISOString()
    let statusMessage = ''
    
    if (shop.status === 'trial') {
      const daysLeft = Math.ceil((new Date(shop.trial_end) - new Date()) / (1000 * 60 * 60 * 24))
      statusMessage = `Trial: ${daysLeft} days remaining`
    }

    // Successful login
    return NextResponse.json({
      success: true,
      shop: {
        shop_id: shop.id,
        name: shop.shop_name,
        owner_name: shop.owner_name,
        status: shop.subscription_status,
        subscription_plan: shop.subscription_plan,
        trial_end: shop.subscription_end,
        subscription_end: shop.subscription_end
      },
      message: statusMessage
    })

  } catch (error) {
    console.error('Shop login error:', error)
    return NextResponse.json(
      { success: false, error: 'Login failed. Please try again.' },
      { status: 500 }
    )
  }
}
