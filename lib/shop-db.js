// Shop-specific database (Local SQLite)
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

export function getRestaurantDatabase(restaurantId) {
  // Create databases directory if it doesn't exist
  const dbDir = path.join(process.cwd(), 'databases')
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  const dbPath = path.join(dbDir, `restaurant_${restaurantId}.db`)
  const db = new Database(dbPath)

  // Initialize shop database schema
  db.exec(`
    -- Restaurant Information
    CREATE TABLE IF NOT EXISTS restaurant_info (
      id INTEGER PRIMARY KEY,
      restaurant_id TEXT UNIQUE NOT NULL,
      restaurant_name TEXT NOT NULL,
      owner_name TEXT,
      phone TEXT,
      address TEXT,
      city TEXT,
      cuisine_type TEXT,
      seating_capacity INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Customers (Shop-specific customer database)
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      age INTEGER,
      address TEXT,
      total_purchases INTEGER DEFAULT 0,
      total_spent REAL DEFAULT 0,
      credit_balance REAL DEFAULT 0,
      loyalty_points INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_purchase_at DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Credit Payments (Track partial payments on credit)
    CREATE TABLE IF NOT EXISTS credit_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      transaction_id INTEGER,
      amount REAL NOT NULL,
      payment_method TEXT DEFAULT 'Cash',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (transaction_id) REFERENCES transactions(id)
    );

    -- Local Orders (Restaurant-specific orders)
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE,
      table_number TEXT,
      order_type TEXT DEFAULT 'dine-in',
      customer_id INTEGER,
      customer_name TEXT,
      customer_phone TEXT,
      total REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      tax REAL DEFAULT 0,
      final_total REAL DEFAULT 0,
      payment_method TEXT,
      amount_paid REAL DEFAULT 0,
      change_amount REAL DEFAULT 0,
      credit_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      synced INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    -- Order Items
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      menu_item_id INTEGER,
      menu_item_name TEXT,
      quantity INTEGER DEFAULT 1,
      price REAL DEFAULT 0,
      subtotal REAL DEFAULT 0,
      special_instructions TEXT,
      status TEXT DEFAULT 'pending',
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
    );

    -- Menu Items (Restaurant-specific menu catalog)
    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      item_code TEXT UNIQUE NOT NULL,
      category TEXT,
      price REAL DEFAULT 0,
      description TEXT,
      preparation_time INTEGER DEFAULT 15,
      is_available INTEGER DEFAULT 1,
      is_vegetarian INTEGER DEFAULT 0,
      is_spicy INTEGER DEFAULT 0,
      image_url TEXT,
      global_menu_item_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Ingredients (Restaurant inventory)
    CREATE TABLE IF NOT EXISTS ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'kg',
      stock REAL DEFAULT 0,
      min_stock REAL DEFAULT 5,
      cost_per_unit REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Menu Item Ingredients (Recipe management)
    CREATE TABLE IF NOT EXISTS menu_item_ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      menu_item_id INTEGER NOT NULL,
      ingredient_id INTEGER NOT NULL,
      quantity_required REAL NOT NULL,
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
    );

    -- Local Stock Levels (Shop-specific inventory) - DEPRECATED, use products table
    CREATE TABLE IF NOT EXISTS local_stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      global_product_id TEXT UNIQUE NOT NULL,  -- Links to Global Product Master
      stock INTEGER DEFAULT 0,
      min_stock INTEGER DEFAULT 10,
      cost_price REAL DEFAULT 0,
      selling_price REAL DEFAULT 0,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Ingredient History (Local)
    CREATE TABLE IF NOT EXISTS ingredient_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ingredient_id INTEGER NOT NULL,
      change_type TEXT,
      quantity_change REAL,
      previous_stock REAL,
      new_stock REAL,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
    );

    -- Held Orders (Local)
    CREATE TABLE IF NOT EXISTS held_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_number TEXT,
      held_by TEXT,
      total REAL DEFAULT 0,
      item_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS held_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      held_order_id INTEGER,
      menu_item_id INTEGER NOT NULL,
      menu_item_name TEXT,
      quantity INTEGER DEFAULT 1,
      price REAL DEFAULT 0,
      special_instructions TEXT,
      FOREIGN KEY (held_order_id) REFERENCES held_orders(id),
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
    );

    -- Tables (Restaurant seating)
    CREATE TABLE IF NOT EXISTS tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_number TEXT UNIQUE NOT NULL,
      capacity INTEGER DEFAULT 4,
      status TEXT DEFAULT 'available',
      current_order_id INTEGER,
      FOREIGN KEY (current_order_id) REFERENCES orders(id)
    );

    -- Sync Queue (tracks what needs to be synced to cloud)
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      record_id INTEGER NOT NULL,
      action TEXT NOT NULL, -- 'insert', 'update', 'delete'
      data TEXT, -- JSON data
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      synced INTEGER DEFAULT 0
    );
  `)

  // Migration: Add restaurant-specific columns to orders table
  try {
    const ordersInfo = db.prepare("PRAGMA table_info(orders)").all()
    if (ordersInfo.length > 0) {
      const hasTableNumber = ordersInfo.some(col => col.name === 'table_number')
      const hasOrderType = ordersInfo.some(col => col.name === 'order_type')
      const hasStatus = ordersInfo.some(col => col.name === 'status')
      
      if (!hasTableNumber) {
        console.log(`Adding table_number column to orders table in ${restaurantId}`)
        db.exec('ALTER TABLE orders ADD COLUMN table_number TEXT')
      }
      
      if (!hasOrderType) {
        console.log(`Adding order_type column to orders table in ${restaurantId}`)
        db.exec("ALTER TABLE orders ADD COLUMN order_type TEXT DEFAULT 'dine-in'")
      }
      
      if (!hasStatus) {
        console.log(`Adding status column to orders table in ${restaurantId}`)
        db.exec("ALTER TABLE orders ADD COLUMN status TEXT DEFAULT 'pending'")
      }
    }
  } catch (error) {
    console.error('Migration error (orders):', error)
  }

  // Migration: Add special_instructions and status to order_items
  try {
    const itemsInfo = db.prepare("PRAGMA table_info(order_items)").all()
    if (itemsInfo.length > 0) {
      const hasSpecialInstructions = itemsInfo.some(col => col.name === 'special_instructions')
      const hasStatus = itemsInfo.some(col => col.name === 'status')
      
      if (!hasSpecialInstructions) {
        console.log(`Adding special_instructions column to order_items table in ${restaurantId}`)
        db.exec('ALTER TABLE order_items ADD COLUMN special_instructions TEXT')
      }
      
      if (!hasStatus) {
        console.log(`Adding status column to order_items table in ${restaurantId}`)
        db.exec("ALTER TABLE order_items ADD COLUMN status TEXT DEFAULT 'pending'")
      }
    }
  } catch (error) {
    console.error('Migration error (order_items):', error)
  }

  // Migration: Stock history is now ingredient_history
  try {
    const historyInfo = db.prepare("PRAGMA table_info(ingredient_history)").all()
    if (historyInfo.length === 0) {
      console.log(`Creating ingredient_history table in ${restaurantId}`)
    }
  } catch (error) {
    console.error('Migration error (ingredient_history):', error)
  }

  return db
}

export function getCurrentRestaurantId() {
  // Get from localStorage in production
  // For now, return default
  if (typeof window !== 'undefined') {
    return localStorage.getItem('currentRestaurantId') || 'restaurant_demo'
  }
  return 'restaurant_demo'
}

export default getRestaurantDatabase(getCurrentRestaurantId())
