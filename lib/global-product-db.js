// Global Product Master Database (Shared across all Nepal shops)
import Database from 'better-sqlite3'
import path from 'path'

const dbPath = path.join(process.cwd(), 'global_products.db')
const db = new Database(dbPath)

// Initialize Global Product Master schema
db.exec(`
  -- Global Product Master (Shared across Nepal)
  CREATE TABLE IF NOT EXISTS global_products (
    id TEXT PRIMARY KEY,  -- UUID or global barcode
    barcode TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    name_nepali TEXT,
    brand TEXT,
    category TEXT,
    subcategory TEXT,
    unit TEXT DEFAULT 'piece',
    image_url TEXT,
    description TEXT,
    manufacturer TEXT,
    country_of_origin TEXT,
    standard_price REAL,  -- Suggested retail price
    created_by_shop TEXT,  -- Which shop first added this
    verified INTEGER DEFAULT 0,  -- Admin verified
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Product Aliases (different names for same product)
  CREATE TABLE IF NOT EXISTS product_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    global_product_id TEXT NOT NULL,
    alias_name TEXT NOT NULL,
    language TEXT DEFAULT 'nepali',
    FOREIGN KEY (global_product_id) REFERENCES global_products(id)
  );

  -- Product Images (multiple images per product)
  CREATE TABLE IF NOT EXISTS product_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    global_product_id TEXT NOT NULL,
    image_url TEXT NOT NULL,
    is_primary INTEGER DEFAULT 0,
    uploaded_by_shop TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (global_product_id) REFERENCES global_products(id)
  );

  -- Categories Master
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    name_nepali TEXT,
    parent_category TEXT,
    icon TEXT,
    sort_order INTEGER DEFAULT 0
  );

  -- Brands Master
  CREATE TABLE IF NOT EXISTS brands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    logo_url TEXT,
    country TEXT,
    website TEXT
  );

  -- Product Usage Statistics (crowd-sourced pricing)
  CREATE TABLE IF NOT EXISTS product_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    global_product_id TEXT NOT NULL,
    shop_count INTEGER DEFAULT 0,  -- How many shops sell this
    avg_price REAL,  -- Average price across Nepal
    min_price REAL,
    max_price REAL,
    total_sold INTEGER DEFAULT 0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (global_product_id) REFERENCES global_products(id)
  );
`)

// Insert default categories for Nepal market
const defaultCategories = [
  { name: 'Grocery', name_nepali: 'किराना', icon: '🛒' },
  { name: 'Beverages', name_nepali: 'पेय पदार्थ', icon: '🥤' },
  { name: 'Snacks', name_nepali: 'खाजा', icon: '🍿' },
  { name: 'Personal Care', name_nepali: 'व्यक्तिगत हेरचाह', icon: '🧴' },
  { name: 'Electronics', name_nepali: 'इलेक्ट्रोनिक्स', icon: '📱' },
  { name: 'Stationery', name_nepali: 'लेखन सामग्री', icon: '📝' },
  { name: 'Household', name_nepali: 'घरायसी', icon: '🏠' },
  { name: 'Medicine', name_nepali: 'औषधि', icon: '💊' },
]

const insertCategory = db.prepare(`
  INSERT OR IGNORE INTO categories (name, name_nepali, icon)
  VALUES (?, ?, ?)
`)

defaultCategories.forEach(cat => {
  insertCategory.run(cat.name, cat.name_nepali, cat.icon)
})

export default db
