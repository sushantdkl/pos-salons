import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';

export async function GET(request) {
  try {
    const db = Database.getInstance().db;
    
    // Check if system_settings table exists
    const tableExists = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='system_settings'
    `).get();

    if (!tableExists) {
      // Create table if it doesn't exist
      db.prepare(`
        CREATE TABLE IF NOT EXISTS system_settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          setting_key TEXT UNIQUE NOT NULL,
          setting_value TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      // Try to get restaurant info from license_info table (populated from Firebase)
      let restaurantInfo = { name: '', address: '', phone: '', email: '' };
      try {
        const licenseInfo = db.prepare(`
          SELECT restaurant_name, restaurant_address, restaurant_phone, restaurant_email 
          FROM license_info ORDER BY id DESC LIMIT 1
        `).get();
        if (licenseInfo) {
          restaurantInfo = {
            name: licenseInfo.restaurant_name || '',
            address: licenseInfo.restaurant_address || '',
            phone: licenseInfo.restaurant_phone || '',
            email: licenseInfo.restaurant_email || ''
          };
        }
      } catch (e) {
        console.log('No license info found, using defaults');
      }

      // Get owner name from license if available
      let ownerName = '';
      try {
        const ownerInfo = db.prepare(`SELECT owner_name FROM license_info ORDER BY id DESC LIMIT 1`).get();
        if (ownerInfo) ownerName = ownerInfo.owner_name || '';
      } catch (e) {
        console.log('No owner info found');
      }

      // Insert default settings with restaurant info from Firebase/license
      const defaults = [
        { key: 'vat_percentage', value: '13' },
        { key: 'service_charge_percentage', value: '10' },
        { key: 'restaurant_name', value: restaurantInfo.name },
        { key: 'restaurant_address', value: restaurantInfo.address },
        { key: 'restaurant_phone', value: restaurantInfo.phone },
        { key: 'restaurant_email', value: restaurantInfo.email },
        { key: 'owner_name', value: ownerName },
        { key: 'vat_number', value: '' },
        { key: 'pan_number', value: '' },
        { key: 'currency_symbol', value: 'Rs' },
        { key: 'bank_qr_image', value: '' },
        { key: 'esewa_qr_image', value: '' }
      ];

      const insertStmt = db.prepare(`
        INSERT INTO system_settings (setting_key, setting_value) 
        VALUES (?, ?)
      `);

      for (const setting of defaults) {
        insertStmt.run(setting.key, setting.value);
      }
    }

    // Fetch all settings
    const settingsArray = db.prepare('SELECT setting_key, setting_value FROM system_settings').all();
    
    // Convert to object
    const settings = {};
    settingsArray.forEach(row => {
      const key = row.setting_key;
      let value = row.setting_value;
      
      // Convert numeric values
      if (key === 'vat_percentage' || key === 'service_charge_percentage') {
        value = parseFloat(value) || 0;
      }
      
      settings[key] = value;
    });

    return NextResponse.json({ settings });
  } catch (error) {
    console.error('Get settings error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const data = await request.json();
    const db = Database.getInstance().db;

    // Upsert each setting (insert or update)
    const upsertStmt = db.prepare(`
      INSERT INTO system_settings (setting_key, setting_value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(setting_key) DO UPDATE SET 
        setting_value = excluded.setting_value,
        updated_at = CURRENT_TIMESTAMP
    `);

    for (const [key, value] of Object.entries(data)) {
      upsertStmt.run(key, String(value));
    }

    return NextResponse.json({ 
      message: 'Settings updated successfully' 
    });
  } catch (error) {
    console.error('Update settings error:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
