import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import JSZip from 'jszip';

const ADMIN_SERVER_URL = process.env.NEXT_PUBLIC_ADMIN_SERVER_URL || 'http://localhost:3001';

export async function GET(request) {
  try {
    const database = Database.getInstance();
    const db = database.db;
    
    // Get license info
    const licenseInfo = db.prepare('SELECT * FROM license_info LIMIT 1').get();
    
    if (!licenseInfo?.license_key) {
      return NextResponse.json(
        { error: 'License key not found. Please activate your system first.' },
        { status: 400 }
      );
    }

    // Get list of backups from admin server
    console.log('📋 Fetching backup list from admin server...');
    const response = await fetch(
      `${ADMIN_SERVER_URL}/api/backup/list?license_key=${encodeURIComponent(licenseInfo.license_key)}`,
      { signal: AbortSignal.timeout(10000) }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch backups (status ${response.status})`);
    }
    
    const data = await response.json();
    
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('List backups error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch backup list' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const { backup_id } = await request.json();
    
    if (!backup_id) {
      return NextResponse.json(
        { error: 'Backup ID is required' },
        { status: 400 }
      );
    }
    
    const database = Database.getInstance();
    const db = database.db;
    const licenseInfo = db.prepare('SELECT * FROM license_info LIMIT 1').get();
    
    if (!licenseInfo?.license_key) {
      return NextResponse.json(
        { error: 'License key not found' },
        { status: 400 }
      );
    }

    console.log('📥 Downloading backup from admin server...');
    
    // Get download URL
    const urlResponse = await fetch(
      `${ADMIN_SERVER_URL}/api/backup/download?backup_id=${encodeURIComponent(backup_id)}&license_key=${encodeURIComponent(licenseInfo.license_key)}`,
      { signal: AbortSignal.timeout(10000) }
    );
    
    if (!urlResponse.ok) {
      const errorData = await urlResponse.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to get download URL (status ${urlResponse.status})`);
    }
    
    const urlData = await urlResponse.json();
    
    let zipBuffer;
    
    // Check if data is from Firestore or Storage
    if (urlData.storage_method === 'firestore') {
      console.log('⬇️  Extracting ZIP from Firestore data...');
      zipBuffer = Buffer.from(urlData.zip_data, 'base64');
    } else {
      console.log('⬇️  Downloading ZIP file from Storage...');
      const zipResponse = await fetch(urlData.download_url);
      
      if (!zipResponse.ok) {
        throw new Error('Failed to download backup file');
      }
      
      zipBuffer = Buffer.from(await zipResponse.arrayBuffer());
    }
    
    // Extract ZIP
    console.log('📂 Extracting ZIP...');
    const zip = new JSZip();
    const zipContent = await zip.loadAsync(zipBuffer);
    
    const backupFile = zipContent.file('backup.json');
    if (!backupFile) {
      throw new Error('Invalid backup file - backup.json not found');
    }
    
    const backupJson = await backupFile.async('string');
    const backup = JSON.parse(backupJson);
    
    console.log('🔄 Restoring database for restaurant...');
    
    // Restore data using transaction
    db.transaction(() => {
      // Clear existing data
      db.prepare('DELETE FROM order_items').run();
      db.prepare('DELETE FROM orders').run();
      db.prepare('DELETE FROM kot_items').run();
      db.prepare('DELETE FROM kots').run();
      db.prepare('DELETE FROM bill_payments').run();
      db.prepare('DELETE FROM bills').run();
      db.prepare('DELETE FROM menu_item_variants').run();
      db.prepare('DELETE FROM menu_items').run();
      db.prepare('DELETE FROM menu_categories').run();
      db.prepare('DELETE FROM customers').run();
      db.prepare('DELETE FROM recipe_ingredients').run();
      db.prepare('DELETE FROM ingredients').run();
      
      // Restore menu categories
      const insertCategory = db.prepare(`
        INSERT INTO menu_categories (id, name, description, created_at)
        VALUES (?, ?, ?, ?)
      `);
      (backup.data.menu_categories || []).forEach(c => {
        insertCategory.run(c.id, c.name, c.description, c.created_at);
      });
      
      // Restore menu items
      const insertItem = db.prepare(`
        INSERT INTO menu_items (id, name, category_id, price, cost, description, image_url, is_available, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      (backup.data.menu_items || []).forEach(i => {
        insertItem.run(i.id, i.name, i.category_id, i.price, i.cost, i.description, i.image_url, i.is_available, i.created_at);
      });
      
      // Restore menu item variants
      const insertVariant = db.prepare(`
        INSERT INTO menu_item_variants (id, menu_item_id, name, price_modifier, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      (backup.data.menu_item_variants || []).forEach(v => {
        insertVariant.run(v.id, v.menu_item_id, v.name, v.price_modifier, v.created_at);
      });
      
      // Restore customers
      const insertCustomer = db.prepare(`
        INSERT INTO customers (id, name, phone, email, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      (backup.data.customers || []).forEach(c => {
        insertCustomer.run(c.id, c.name, c.phone, c.email, c.created_at);
      });
      
      // Restore orders
      const insertOrder = db.prepare(`
        INSERT INTO orders (id, table_id, order_number, status, total, discount, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      (backup.data.orders || []).forEach(o => {
        insertOrder.run(o.id, o.table_id, o.order_number, o.status, o.total, o.discount, o.notes, o.created_at);
      });
      
      // Restore order items
      const insertOrderItem = db.prepare(`
        INSERT INTO order_items (id, order_id, menu_item_id, item_name, quantity, price, total, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      (backup.data.order_items || []).forEach(oi => {
        insertOrderItem.run(oi.id, oi.order_id, oi.menu_item_id, oi.item_name, oi.quantity, oi.price, oi.total, oi.created_at);
      });
      
      // Restore KOTs
      const insertKot = db.prepare(`
        INSERT INTO kots (id, order_id, kot_number, status, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      (backup.data.kots || []).forEach(k => {
        insertKot.run(k.id, k.order_id, k.kot_number, k.status, k.created_at);
      });
      
      // Restore KOT items
      const insertKotItem = db.prepare(`
        INSERT INTO kot_items (id, kot_id, menu_item_id, item_name, quantity, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      (backup.data.kot_items || []).forEach(ki => {
        insertKotItem.run(ki.id, ki.kot_id, ki.menu_item_id, ki.item_name, ki.quantity, ki.status, ki.created_at);
      });
      
      // Restore bills
      const insertBill = db.prepare(`
        INSERT INTO bills (id, order_id, bill_number, total, tax, service_charge, discount, final_total, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      (backup.data.bills || []).forEach(b => {
        insertBill.run(b.id, b.order_id, b.bill_number, b.total, b.tax, b.service_charge, b.discount, b.final_total, b.status, b.created_at);
      });
      
      // Restore bill payments
      const insertPayment = db.prepare(`
        INSERT INTO bill_payments (id, bill_id, amount, payment_method, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      (backup.data.bill_payments || []).forEach(p => {
        insertPayment.run(p.id, p.bill_id, p.amount, p.payment_method, p.created_at);
      });
      
      // Restore ingredients
      const insertIngredient = db.prepare(`
        INSERT INTO ingredients (id, name, unit, quantity, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      (backup.data.ingredients || []).forEach(ing => {
        insertIngredient.run(ing.id, ing.name, ing.unit, ing.quantity, ing.created_at);
      });
      
      // Restore recipe ingredients
      const insertRecipeIng = db.prepare(`
        INSERT INTO recipe_ingredients (id, menu_item_id, ingredient_id, quantity_required, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      (backup.data.recipe_ingredients || []).forEach(ri => {
        insertRecipeIng.run(ri.id, ri.menu_item_id, ri.ingredient_id, ri.quantity_required, ri.created_at);
      });
      
      console.log('✅ Database restored successfully');
    })();
    
    return NextResponse.json({
      success: true,
      message: 'Backup restored successfully!',
      backup_id: backup_id,
      backup_date: backup.backup_date
    });
    
  } catch (error) {
    console.error('Restore backup error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to restore backup' },
      { status: 500 }
    );
  }
}
