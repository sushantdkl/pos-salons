import { NextResponse } from 'next/server'
import adminDb from '@/lib/admin-db'
import { getRestaurantDatabase } from '@/lib/shop-db'

export async function POST(request) {
  try {
    const { shop_id } = await request.json()

    if (!shop_id) {
      return NextResponse.json(
        { success: false, error: 'Shop ID is required' },
        { status: 400 }
      )
    }

    // Verify shop exists
    const shop = adminDb.prepare('SELECT * FROM shops WHERE shop_id = ?').get(shop_id)
    if (!shop) {
      return NextResponse.json(
        { success: false, error: 'Shop not found' },
        { status: 404 }
      )
    }

    // Get shop database
    const shopDb = getRestaurantDatabase(shop_id)

    // Sync transactions from sync_queue
    const pendingTransactions = shopDb.prepare('SELECT * FROM sync_queue WHERE synced = 0').all()
    
    let syncedTransactions = 0
    let syncedProducts = 0

    // Upload transactions to admin central
    for (const item of pendingTransactions) {
      try {
        if (item.table_name === 'transactions') {
          const transaction = shopDb.prepare('SELECT * FROM transactions WHERE id = ?').get(item.record_id)
          if (transaction) {
            // Insert into admin central all_transactions
            adminDb.prepare(`
              INSERT OR REPLACE INTO all_transactions 
              (shop_id, transaction_id, date, total, discount, tax, amount_paid, change_amount, payment_method, customer_name)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              shop_id,
              transaction.id,
              transaction.date,
              transaction.total,
              transaction.discount,
              transaction.tax,
              transaction.amount_paid,
              transaction.change_amount,
              transaction.payment_method,
              transaction.customer_name
            )

            // Get transaction items
            const items = shopDb.prepare('SELECT * FROM transaction_items WHERE transaction_id = ?').all(transaction.id)
            for (const item of items) {
              adminDb.prepare(`
                INSERT OR REPLACE INTO all_transaction_items
                (shop_id, transaction_id, product_name, quantity, unit_price, total_price)
                VALUES (?, ?, ?, ?, ?, ?)
              `).run(
                shop_id,
                transaction.id,
                item.product_name,
                item.quantity,
                item.unit_price,
                item.total_price
              )
            }

            syncedTransactions++
          }
        } else if (item.table_name === 'local_stock') {
          syncedProducts++
        }

        // Mark as synced
        shopDb.prepare('UPDATE sync_queue SET synced = 1, synced_at = CURRENT_TIMESTAMP WHERE id = ?').run(item.id)
      } catch (err) {
        console.error('Error syncing item:', err)
      }
    }

    // Update shop stats
    const totalSales = adminDb.prepare('SELECT SUM(total) as total FROM all_transactions WHERE shop_id = ?').get(shop_id)
    const totalTransactions = adminDb.prepare('SELECT COUNT(*) as count FROM all_transactions WHERE shop_id = ?').get(shop_id)

    adminDb.prepare(`
      INSERT OR REPLACE INTO shop_stats 
      (shop_id, total_sales, total_transactions, last_sync, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      shop_id,
      totalSales?.total || 0,
      totalTransactions?.count || 0
    )

    // Log sync
    adminDb.prepare(`
      INSERT INTO sync_logs (shop_id, records_synced, status, synced_at)
      VALUES (?, ?, 'success', CURRENT_TIMESTAMP)
    `).run(shop_id, syncedTransactions + syncedProducts)

    return NextResponse.json({
      success: true,
      synced: {
        transactions: syncedTransactions,
        products: syncedProducts
      },
      message: 'Database synced successfully'
    })

  } catch (error) {
    console.error('Sync error:', error)
    return NextResponse.json(
      { success: false, error: 'Sync failed. Please try again.' },
      { status: 500 }
    )
  }
}
