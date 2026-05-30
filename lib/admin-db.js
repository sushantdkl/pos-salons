// Admin Central Database (Your master control panel)
import Database from 'better-sqlite3'
import path from 'path'

const dbPath = path.join(process.cwd(), 'admin_central.db')
const db = new Database(dbPath)

// Initialize Admin Central schema
db.exec(`
  -- All Shops Registry
  CREATE TABLE IF NOT EXISTS shops (
    id TEXT PRIMARY KEY,  -- shop_001, shop_002, etc.
    shop_name TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    owner_phone TEXT,
    owner_email TEXT,
    address TEXT,
    city TEXT,
    district TEXT,
    province TEXT,
    subscription_plan TEXT DEFAULT 'basic',  -- basic, premium, enterprise
    subscription_status TEXT DEFAULT 'active',  -- active, suspended, trial
    subscription_start DATE,
    subscription_end DATE,
    monthly_fee REAL DEFAULT 0,
    payment_status TEXT DEFAULT 'paid',  -- paid, pending, overdue
    database_file TEXT,  -- shop_001.db
    username TEXT UNIQUE,  -- Shop login username
    password_hash TEXT,  -- Bcrypt hashed password
    last_sync_time DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Shop Statistics (synced from each shop)
  CREATE TABLE IF NOT EXISTS shop_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id TEXT NOT NULL,
    date DATE NOT NULL,
    total_sales REAL DEFAULT 0,
    total_transactions INTEGER DEFAULT 0,
    total_items_sold INTEGER DEFAULT 0,
    total_customers INTEGER DEFAULT 0,
    avg_transaction_value REAL DEFAULT 0,
    synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shop_id) REFERENCES shops(id),
    UNIQUE(shop_id, date)
  );

  -- All Transactions (synced from all shops)
  CREATE TABLE IF NOT EXISTS all_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id TEXT NOT NULL,
    local_transaction_id INTEGER,  -- ID in shop's local DB
    transaction_number TEXT UNIQUE,
    total REAL DEFAULT 0,
    discount REAL DEFAULT 0,
    tax REAL DEFAULT 0,
    final_total REAL DEFAULT 0,
    payment_method TEXT,
    items_count INTEGER DEFAULT 0,
    created_at DATETIME,
    synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shop_id) REFERENCES shops(id)
  );

  -- Transaction Items (from all shops)
  CREATE TABLE IF NOT EXISTS all_transaction_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER,
    shop_id TEXT NOT NULL,
    global_product_id TEXT,
    product_name TEXT,
    quantity INTEGER DEFAULT 1,
    price REAL DEFAULT 0,
    subtotal REAL DEFAULT 0,
    FOREIGN KEY (transaction_id) REFERENCES all_transactions(id)
  );

  -- Product Performance (across all shops)
  CREATE TABLE IF NOT EXISTS product_performance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    global_product_id TEXT NOT NULL,
    total_shops_selling INTEGER DEFAULT 0,
    total_quantity_sold INTEGER DEFAULT 0,
    total_revenue REAL DEFAULT 0,
    avg_price REAL DEFAULT 0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(global_product_id)
  );

  -- Admin Users
  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT,
    role TEXT DEFAULT 'admin',  -- superadmin, admin, viewer
    email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Sync Logs
  CREATE TABLE IF NOT EXISTS sync_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id TEXT NOT NULL,
    sync_type TEXT,  -- 'full', 'incremental'
    records_synced INTEGER DEFAULT 0,
    status TEXT,  -- 'success', 'failed', 'partial'
    error_message TEXT,
    started_at DATETIME,
    completed_at DATETIME,
    FOREIGN KEY (shop_id) REFERENCES shops(id)
  );

  -- Payments/Billing
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id TEXT NOT NULL,
    amount REAL NOT NULL,
    payment_date DATE,
    payment_method TEXT,  -- 'esewa', 'bank', 'cash'
    period_start DATE,
    period_end DATE,
    status TEXT DEFAULT 'pending',  -- 'pending', 'paid', 'failed'
    receipt_number TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shop_id) REFERENCES shops(id)
  );

  -- System Settings
  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`)

// Insert default admin user (password: admin123 - CHANGE THIS!)
const bcrypt = require('bcryptjs')
const defaultPassword = bcrypt.hashSync('admin123', 10)

db.prepare(`
  INSERT OR IGNORE INTO admin_users (username, password_hash, full_name, role)
  VALUES (?, ?, ?, ?)
`).run('admin', defaultPassword, 'System Administrator', 'superadmin')

// Insert default settings
const defaultSettings = [
  { key: 'monthly_subscription_fee', value: '1500', description: 'Monthly fee in NPR' },
  { key: 'sync_interval_minutes', value: '5', description: 'Auto-sync interval' },
  { key: 'trial_period_days', value: '30', description: 'Trial period for new shops' },
]

const insertSetting = db.prepare(`
  INSERT OR IGNORE INTO system_settings (key, value, description)
  VALUES (?, ?, ?)
`)

defaultSettings.forEach(setting => {
  insertSetting.run(setting.key, setting.value, setting.description)
})

// Check if username column exists, if not add it (migration)
try {
  db.prepare('SELECT username FROM shops LIMIT 1').get()
} catch (error) {
  // Column doesn't exist, add it
  console.log('Migrating shops table to add username and password_hash columns...')
  db.exec(`
    ALTER TABLE shops ADD COLUMN username TEXT;
    ALTER TABLE shops ADD COLUMN password_hash TEXT;
  `)
  console.log('✅ Migration complete')
}

export default db
