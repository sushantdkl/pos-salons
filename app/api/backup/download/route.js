import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';

export async function GET() {
  try {
    const database = Database.getInstance();
    const db = database.db;
    
    // Get license info
    const licenseInfo = db.prepare('SELECT * FROM license_info LIMIT 1').get();
    
    // Get all data from tables for restaurant
    const backup = {
      backup_date: new Date().toISOString(),
      license_key: licenseInfo?.license_key,
      restaurant_name: licenseInfo?.restaurant_name,
      data: {
        // Restaurant Info
        license_info: db.prepare('SELECT * FROM license_info').all(),
        
        // Menu
        menu_categories: db.prepare('SELECT * FROM menu_categories').all(),
        menu_items: db.prepare('SELECT * FROM menu_items').all(),
        menu_item_variants: db.prepare('SELECT * FROM menu_item_variants').all(),
        
        // Tables
        tables: db.prepare('SELECT * FROM tables').all(),
        
        // Orders
        orders: db.prepare("SELECT * FROM orders WHERE created_at >= date('now', '-90 days') ORDER BY created_at DESC").all(),
        order_items: db.prepare(`
          SELECT oi.* FROM order_items oi
          INNER JOIN orders o ON oi.order_id = o.id
          WHERE o.created_at >= date('now', '-90 days')
        `).all(),
        
        // KOTs
        kots: db.prepare("SELECT * FROM kots WHERE created_at >= date('now', '-90 days')").all(),
        kot_items: db.prepare(`
          SELECT ki.* FROM kot_items ki
          INNER JOIN kots k ON ki.kot_id = k.id
          WHERE k.created_at >= date('now', '-90 days')
        `).all(),
        
        // Bills
        bills: db.prepare("SELECT * FROM bills WHERE created_at >= date('now', '-90 days') ORDER BY created_at DESC").all(),
        bill_payments: db.prepare(`
          SELECT bp.* FROM bill_payments bp
          INNER JOIN bills b ON bp.bill_id = b.id
          WHERE b.created_at >= date('now', '-90 days')
        `).all(),
        
        // Customers
        customers: db.prepare('SELECT * FROM customers').all(),
        
        // Ingredients & Recipes
        ingredients: db.prepare('SELECT * FROM ingredients').all(),
        recipe_ingredients: db.prepare('SELECT * FROM recipe_ingredients').all(),
        
        // Users
        users: db.prepare('SELECT id, username, password_hash, role, created_at FROM users').all(),
        
        // Devices
        devices: db.prepare('SELECT * FROM devices').all(),
        
        // Sessions
        sessions: db.prepare("SELECT * FROM sessions WHERE expires_at > datetime('now')").all()
      }
    };
    
    // Create backup file name
    const fileName = `pos-backup-${licenseInfo?.license_key || 'system'}-${new Date().toISOString().split('T')[0]}.json`;
    
    // Return as downloadable JSON
    return new NextResponse(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
    
  } catch (error) {
    console.error('Backup download error:', error);
    return NextResponse.json(
      { error: 'Failed to create backup' },
      { status: 500 }
    );
  }
}
