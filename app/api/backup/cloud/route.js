import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import JSZip from 'jszip';

const ADMIN_SERVER_URL = process.env.NEXT_PUBLIC_ADMIN_SERVER_URL || 'http://localhost:3001';

export async function POST() {
  try {
    const database = Database.getInstance();
    const db = database.db;
    
    // Get license info from license_info table
    const licenseInfo = db.prepare('SELECT * FROM license_info LIMIT 1').get();
    
    if (!licenseInfo?.license_key) {
      return NextResponse.json(
        { error: 'License key not found. Please activate your system first.' },
        { status: 400 }
      );
    }

    // Check if cloud backup is enabled for this license
    console.log('🔍 Checking cloud backup permission...');
    const permissionCheck = await fetch(`${ADMIN_SERVER_URL}/api/license/check-feature`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        license_key: licenseInfo.license_key,
        feature: 'cloud_backup'
      })
    });

    if (!permissionCheck.ok) {
      return NextResponse.json(
        { error: 'Failed to verify cloud backup permission. Please contact support.' },
        { status: 500 }
      );
    }

    const permission = await permissionCheck.json();
    
    if (!permission.enabled) {
      return NextResponse.json(
        { 
          error: 'Cloud Backup is not enabled for your license.',
          message: 'This is a premium feature. Please contact your administrator to enable Cloud Backup.'
        },
        { status: 403 }
      );
    }

    console.log('✅ Cloud backup permission verified');
    
    // Prepare backup data for restaurant
    const backup = {
      backup_date: new Date().toISOString(),
      license_key: licenseInfo.license_key,
      restaurant_name: licenseInfo.restaurant_name,
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
        kots: db.prepare("SELECT * FROM kots WHERE printed_at >= date('now', '-90 days')").all(),
        kot_items: db.prepare(`
          SELECT ki.* FROM kot_items ki
          INNER JOIN kots k ON ki.kot_id = k.id
          WHERE k.printed_at >= date('now', '-90 days')
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
        
        // Users (exclude passwords)
        users: db.prepare('SELECT id, username, password_hash, role, created_at FROM users').all(),
        
        // Devices
        devices: db.prepare('SELECT * FROM devices').all(),
        
        // Sessions
        sessions: db.prepare("SELECT * FROM sessions WHERE expires_at > datetime('now')").all()
      },
      stats: {
        total_orders: db.prepare("SELECT COUNT(*) as count FROM orders WHERE created_at >= date('now', '-90 days')").get().count,
        total_bills: db.prepare("SELECT COUNT(*) as count FROM bills WHERE created_at >= date('now', '-90 days')").get().count,
        total_customers: db.prepare('SELECT COUNT(*) as count FROM customers').get().count,
        total_tables: db.prepare('SELECT COUNT(*) as count FROM tables').get().count,
        total_menu_items: db.prepare('SELECT COUNT(*) as count FROM menu_items').get().count
      }
    };
    
    const backupJson = JSON.stringify(backup, null, 2);
    console.log('📦 Backup size:', Math.round(backupJson.length / 1024), 'KB');
    
    // Create ZIP file
    const zip = new JSZip();
    zip.file('backup.json', backupJson);
    
    // Generate ZIP as base64
    const zipBase64 = await zip.generateAsync({ 
      type: 'base64',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 }
    });
    
    const zipSizeKB = Math.round((zipBase64.length * 3) / 4 / 1024);
    console.log('🗜️  ZIP size:', zipSizeKB, 'KB');
    
    // Upload ZIP to admin server (Firebase Storage)
    console.log('📤 Uploading ZIP backup to admin server:', ADMIN_SERVER_URL);
    const response = await fetch(`${ADMIN_SERVER_URL}/api/backup/upload`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-License-Key': licenseInfo.license_key
      },
      body: JSON.stringify({
        zip_data: zipBase64,
        backup_date: backup.backup_date,
        restaurant_name: backup.restaurant_name,
        license_key: backup.license_key,
        stats: backup.stats,
        size_kb: zipSizeKB
      }),
      signal: AbortSignal.timeout(60000)
    });
    
    console.log('📥 Admin server response status:', response.status);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ Admin server error:', errorData);
      throw new Error(errorData.error || `Failed to upload backup to admin server (status ${response.status})`);
    }
    
    const result = await response.json();
    
    return NextResponse.json({
      success: true,
      message: 'Backup uploaded to cloud successfully!',
      backup_id: result.backup_id,
      backup_date: backup.backup_date,
      stats: backup.stats
    });
    
  } catch (error) {
    console.error('Cloud backup error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to backup to cloud. Please check your connection.' },
      { status: 500 }
    );
  }
}
