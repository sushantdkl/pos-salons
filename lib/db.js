import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

// Get database name from license file or environment
function getDatabasePath() {
  const dbDir = path.join(process.cwd(), 'databases')
  
  // Check for license file
  const licensePath = path.join(dbDir, '.license')
  if (fs.existsSync(licensePath)) {
    try {
      const licenseData = JSON.parse(fs.readFileSync(licensePath, 'utf8'))
      if (licenseData.db_name) {
        return path.join(dbDir, licenseData.db_name)
      }
    } catch (error) {
      console.error('Error reading license file:', error)
    }
  }
  
  // Check environment variable
  if (process.env.DB_NAME) {
    return path.join(dbDir, process.env.DB_NAME)
  }
  
  // Fallback to default (for backward compatibility)
  return path.join(dbDir, 'pos_restaurant.db')
}

const dbPath = getDatabasePath()

// Check if license file exists
const licensePath = path.join(process.cwd(), 'databases', '.license')
const hasLicense = fs.existsSync(licensePath)

if (!hasLicense) {
  console.log('⚠️  No license found. System requires activation at /activate');
}

// Only create database connection if license exists OR if database file already exists
let db = null
const dbExists = fs.existsSync(dbPath)

if (hasLicense || dbExists) {
  db = new Database(dbPath)
  
  // Enable foreign keys
  db.pragma('foreign_keys = ON')
  
  // Only create tables if license exists (not for orphaned databases)
  if (hasLicense) {
    db.exec(`
  CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    item_code TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL,
    price REAL NOT NULL,
    description TEXT,
    preparation_time INTEGER DEFAULT 15,
    is_available INTEGER DEFAULT 1,
    is_vegetarian INTEGER DEFAULT 0,
    is_spicy INTEGER DEFAULT 0,
    image_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ingredients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'kg',
    stock REAL NOT NULL DEFAULT 0,
    min_stock REAL DEFAULT 5,
    cost_per_unit REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS menu_item_ingredients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    menu_item_id INTEGER NOT NULL,
    ingredient_id INTEGER NOT NULL,
    quantity_required REAL NOT NULL,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE NOT NULL,
    table_number TEXT,
    order_type TEXT DEFAULT 'dine-in',
    customer_name TEXT,
    customer_phone TEXT,
    total REAL NOT NULL,
    discount REAL DEFAULT 0,
    tax REAL DEFAULT 0,
    final_total REAL NOT NULL,
    payment_method TEXT,
    amount_paid REAL NOT NULL,
    change_amount REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    menu_item_id INTEGER NOT NULL,
    menu_item_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    subtotal REAL NOT NULL,
    special_instructions TEXT,
    status TEXT DEFAULT 'pending',
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
  );

  CREATE TABLE IF NOT EXISTS ingredient_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingredient_id INTEGER NOT NULL,
    change_type TEXT NOT NULL,
    quantity_change REAL NOT NULL,
    previous_stock REAL NOT NULL,
    new_stock REAL NOT NULL,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
  );

  CREATE TABLE IF NOT EXISTS held_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_number TEXT,
    held_by TEXT NOT NULL,
    total REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS held_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    held_order_id INTEGER NOT NULL,
    menu_item_id INTEGER NOT NULL,
    menu_item_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    subtotal REAL NOT NULL,
    special_instructions TEXT,
    FOREIGN KEY (held_order_id) REFERENCES held_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
  );

  CREATE TABLE IF NOT EXISTS tables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_number TEXT UNIQUE NOT NULL,
    capacity INTEGER DEFAULT 4,
    status TEXT DEFAULT 'available',
    current_order_id INTEGER,
    FOREIGN KEY (current_order_id) REFERENCES orders(id)
  );

  CREATE INDEX IF NOT EXISTS idx_menu_items_code ON menu_items(item_code);
  CREATE INDEX IF NOT EXISTS idx_menu_items_name ON menu_items(name);
  CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category);
  CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);
  CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(table_number);
  CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
  CREATE INDEX IF NOT EXISTS idx_held_orders_created ON held_orders(created_at);
  CREATE INDEX IF NOT EXISTS idx_ingredients_name ON ingredients(name);
`)
    console.log('Database initialized at:', dbPath)
  }
}

export default db
