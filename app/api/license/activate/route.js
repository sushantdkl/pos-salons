import { NextResponse } from 'next/server';
import { verifyLicenseOnline } from '@/lib/license';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

export async function POST(request) {
  try {
    const { license_key } = await request.json();

    if (!license_key || license_key.trim() === '') {
      return NextResponse.json(
        { error: 'License key is required', valid: false },
        { status: 400 }
      );
    }

    // Verify with admin server
    const result = await verifyLicenseOnline(license_key.trim());

    if (!result.valid) {
      return NextResponse.json(
        { error: result.error || 'Invalid license key', valid: false },
        { status: 400 }
      );
    }

    // Validate business type - this is RESTAURANT POS, only accept restaurant licenses
    const businessType = result.business_type || 'restaurant';
    if (businessType !== 'restaurant') {
      return NextResponse.json(
        { error: 'This license is for a Retail POS system. Please use the correct license for Restaurant POS.', valid: false },
        { status: 400 }
      );
    }

    // Initialize database with unique name
    console.log('License valid, initializing database...');
    
    const dbDir = path.join(process.cwd(), 'databases');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Create unique database name based on license
    const dbName = `pos_${license_key.replace(/[^a-zA-Z0-9]/g, '_')}.db`;
    const dbPath = path.join(dbDir, dbName);

    // Check if database already exists
    const dbExists = fs.existsSync(dbPath);
    
    if (dbExists) {
      // Database exists - this is a license change to existing database
      console.log('✅ Switching to existing database:', dbName);
      
      // Verify database integrity and create missing tables
      const db = new Database(dbPath);
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      
      console.log('🔍 Checking database integrity...');
      createTables(db); // Ensure all tables exist
      ensureDefaultData(db); // Ensure default categories and data
      
      db.close();
      
      // Update license file
      const licensePath = path.join(dbDir, '.license');
      fs.writeFileSync(licensePath, JSON.stringify({
        license_key,
        business_name: result.restaurant_name || result.shop_name || 'Business',
        business_type: result.business_type || 'restaurant',
        restaurant_name: result.restaurant_name || result.shop_name || 'Business',
        expiry_date: result.expiry_date,
        plan_type: result.plan_type,
        grace_period_days: result.grace_period_days || 5,
        activated_at: new Date().toISOString(),
        db_name: dbName
      }));

      // Update environment
      const envPath = path.join(process.cwd(), '.env.local');
      fs.writeFileSync(envPath, `DB_NAME=${dbName}\n`);

      return NextResponse.json({
        valid: true,
        switched: true,
        business: {
          business_name: result.restaurant_name || result.shop_name || 'Business',
          business_type: result.business_type || 'restaurant',
          restaurant_name: result.restaurant_name || result.shop_name || 'Business',
          expiry_date: result.expiry_date,
          plan_type: result.plan_type,
          days_remaining: result.days_remaining
        }
      });
    }

    // Database doesn't exist - create new one
    console.log('🆕 Creating new database:', dbName);
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Create all tables
    createTables(db);

    // Seed default data (categories, tables)
    ensureDefaultData(db);

    // Create default admin user with numeric PIN
    const hashedPassword = bcrypt.hashSync('123456', 10);
    const businessName = result.restaurant_name || result.shop_name || 'Business';
    // businessType already validated above
    
    db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role, email, phone)
      VALUES (?, ?, ?, 'admin', ?, ?)
    `).run('admin', hashedPassword, businessName, '', '');

    // Save license info in license_info table
    db.prepare(`
      INSERT INTO license_info (
        license_key, restaurant_name, plan_type, expiry_date, grace_period_days, status, last_verified
      ) VALUES (?, ?, ?, ?, ?, 'active', datetime('now'))
    `).run(
      license_key,
      businessName,
      result.plan_type || 'annual',
      result.expiry_date,
      result.grace_period_days || 5
    );

    // Save license info in settings for backward compatibility
    db.prepare(`
      INSERT INTO settings (key, value) VALUES 
      ('license_key', ?),
      ('restaurant_name', ?),
      ('business_name', ?),
      ('business_type', ?),
      ('expiry_date', ?),
      ('plan_type', ?),
      ('grace_period_days', ?),
      ('activated_at', ?)
    `).run(
      license_key,
      businessName,
      businessName,
      businessType,
      result.expiry_date,
      result.plan_type || 'annual',
      result.grace_period_days || 5,
      new Date().toISOString()
    );

    // Initialize system_settings with license data
    const businessAddress = result.restaurant_address || result.shop_address || result.address || '';
    const businessPhone = result.restaurant_phone || result.shop_phone || result.phone || '';
    const businessEmail = result.restaurant_email || result.shop_email || result.email || '';
    
    const systemSettings = [
      { key: 'restaurant_name', value: businessName },
      { key: 'business_name', value: businessName },
      { key: 'business_type', value: businessType },
      { key: 'restaurant_address', value: businessAddress },
      { key: 'restaurant_phone', value: businessPhone },
      { key: 'restaurant_email', value: businessEmail },
      { key: 'vat_percentage', value: '13' },
      { key: 'service_charge_percentage', value: '10' },
      { key: 'currency_symbol', value: 'Rs' },
      { key: 'vat_number', value: '' },
      { key: 'pan_number', value: '' },
      { key: 'bank_qr_image', value: '' },
      { key: 'esewa_qr_image', value: '' }
    ];

    const insertSettingStmt = db.prepare(`
      INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)
    `);

    for (const setting of systemSettings) {
      insertSettingStmt.run(setting.key, setting.value);
    }

    db.close();

    // Save license file
    const licensePath = path.join(dbDir, '.license');
    fs.writeFileSync(licensePath, JSON.stringify({
      license_key,
      business_name: businessName,
      business_type: businessType,
      restaurant_name: businessName, // backward compatibility
      expiry_date: result.expiry_date,
      plan_type: result.plan_type,
      grace_period_days: result.grace_period_days || 5,
      activated_at: new Date().toISOString(),
      db_name: dbName
    }));

    // Save db name to environment
    const envPath = path.join(process.cwd(), '.env.local');
    fs.writeFileSync(envPath, `DB_NAME=${dbName}\n`);

    console.log('✅ Database initialized successfully');

    return NextResponse.json({
      valid: true,
      business: {
        business_name: businessName,
        business_type: businessType,
        restaurant_name: businessName, // backward compatibility
        expiry_date: result.expiry_date,
        plan_type: result.plan_type,
        days_remaining: result.days_remaining
      }
    });
  } catch (error) {
    console.error('License activation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to activate license', valid: false },
      { status: 500 }
    );
  }
}

function createTables(db) {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Devices table
  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT UNIQUE NOT NULL,
      device_name TEXT,
      last_active DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Menu categories table
  db.exec(`
    CREATE TABLE IF NOT EXISTS menu_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      icon TEXT,
      display_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category_id INTEGER NOT NULL,
      base_price REAL NOT NULL,
      description TEXT,
      image_url TEXT,
      is_vegetarian INTEGER DEFAULT 0,
      is_available INTEGER DEFAULT 1,
      preparation_time INTEGER DEFAULT 15,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES menu_categories(id)
    )
  `);

  // Tables table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_number TEXT UNIQUE NOT NULL,
      capacity INTEGER DEFAULT 4,
      status TEXT DEFAULT 'available',
      current_order_id INTEGER,
      is_active INTEGER DEFAULT 1,
      floor TEXT,
      section TEXT,
      waiter_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (waiter_id) REFERENCES users(id)
    )
  `);

  // Orders table
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE NOT NULL,
      table_id INTEGER,
      table_number TEXT,
      order_type TEXT DEFAULT 'dine-in',
      status TEXT DEFAULT 'pending',
      waiter_id INTEGER,
      customer_name TEXT,
      customer_phone TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (table_id) REFERENCES tables(id),
      FOREIGN KEY (waiter_id) REFERENCES users(id)
    )
  `);

  // Order items table
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      menu_item_id INTEGER,
      item_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      subtotal REAL NOT NULL,
      special_instructions TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES menu_items(id),
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
    )
  `);

  // Bills table
  db.exec(`
    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_number TEXT UNIQUE NOT NULL,
      order_id INTEGER NOT NULL,
      subtotal REAL NOT NULL,
      tax REAL DEFAULT 0,
      vat_amount REAL DEFAULT 0,
      service_charge REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      grand_total REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      paid_at DATETIME,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `);

  // Bill payments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS bill_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE
    )
  `);

  // Settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // License info table
  db.exec(`
    CREATE TABLE IF NOT EXISTS license_info (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_key TEXT UNIQUE NOT NULL,
      restaurant_name TEXT,
      plan_type TEXT,
      start_date DATE,
      expiry_date DATE NOT NULL,
      grace_period_days INTEGER DEFAULT 5,
      status TEXT DEFAULT 'active',
      last_verified DATETIME,
      activated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // System settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setting_key TEXT UNIQUE NOT NULL,
      setting_value TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Ingredients table
  db.exec(`
    CREATE TABLE IF NOT EXISTS ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      current_stock REAL DEFAULT 0,
      min_stock_level REAL DEFAULT 0,
      cost_per_unit REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Customers table
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT UNIQUE,
      email TEXT,
      address TEXT,
      total_visits INTEGER DEFAULT 0,
      total_spent REAL DEFAULT 0,
      credit_limit REAL DEFAULT 0,
      current_credit REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('✅ All tables created successfully');
}

function ensureDefaultData(db) {
  // Check if menu_categories has data
  const categoryCount = db.prepare('SELECT COUNT(*) as count FROM menu_categories').get();
  
  if (categoryCount.count === 0) {
    console.log('📂 Creating default menu categories...');
    const categories = [
      { name: 'Starters', display_order: 1 },
      { name: 'Main Course', display_order: 2 },
      { name: 'Beverages', display_order: 3 },
      { name: 'Desserts', display_order: 4 }
    ];
    
    const insertCategory = db.prepare(`
      INSERT INTO menu_categories (name, display_order) VALUES (?, ?)
    `);
    
    for (const cat of categories) {
      insertCategory.run(cat.name, cat.display_order);
    }
    console.log('✅ Default categories created');
  }
  
  // Check if tables exist
  const tableCount = db.prepare('SELECT COUNT(*) as count FROM tables').get();
  
  if (tableCount.count === 0) {
    console.log('🪑 Creating default tables...');
    const insertTable = db.prepare(`
      INSERT INTO tables (table_number, capacity) VALUES (?, ?)
    `);
    
    for (let i = 1; i <= 10; i++) {
      insertTable.run(`T${i}`, 4);
    }
    console.log('✅ Default tables created');
  }
}
