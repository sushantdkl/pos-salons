-- Restaurant POS Database Schema
-- SQLite Database for Local and Offline Operations

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- License Information
CREATE TABLE IF NOT EXISTS license_info (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  license_key TEXT UNIQUE NOT NULL,
  restaurant_name TEXT,
  restaurant_address TEXT,
  restaurant_phone TEXT,
  restaurant_email TEXT,
  owner_name TEXT,
  vat_number TEXT,
  plan_type TEXT,
  start_date DATE,
  expiry_date DATE NOT NULL,
  grace_period_days INTEGER DEFAULT 5,
  status TEXT DEFAULT 'active',
  last_verified DATETIME,
  activated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Users & Authentication
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'cashier', 'waiter', 'kitchen')),
  email TEXT UNIQUE,
  phone TEXT,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Roles & Permissions
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  permissions TEXT NOT NULL,
  description TEXT
);

-- Devices
CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT UNIQUE NOT NULL,
  device_name TEXT,
  device_type TEXT CHECK(device_type IN ('waiter', 'kitchen', 'cashier', 'admin')),
  ip_address TEXT,
  last_seen DATETIME,
  user_id INTEGER,
  is_active BOOLEAN DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Restaurant Tables
CREATE TABLE IF NOT EXISTS tables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_number TEXT UNIQUE NOT NULL,
  table_type TEXT DEFAULT 'regular' CHECK(table_type IN ('regular', 'vip', 'outdoor', 'event', 'counter', 'booth')),
  floor TEXT DEFAULT 'Ground' CHECK(floor IN ('Ground', 'First', 'Second', 'Rooftop', 'Basement', 'Outdoor')),
  section TEXT,
  capacity INTEGER DEFAULT 4 CHECK(capacity > 0 AND capacity <= 50),
  min_capacity INTEGER DEFAULT 1,
  position_x INTEGER DEFAULT 0,
  position_y INTEGER DEFAULT 0,
  status TEXT DEFAULT 'available' CHECK(status IN ('available', 'occupied', 'reserved', 'cleaning', 'maintenance')),
  current_order_id INTEGER,
  waiter_id INTEGER,
  occupied_at DATETIME,
  shape TEXT DEFAULT 'square' CHECK(shape IN ('square', 'round', 'rectangular', 'custom')),
  color TEXT DEFAULT '#3b82f6',
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (current_order_id) REFERENCES orders(id) ON DELETE SET NULL,
  FOREIGN KEY (waiter_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Menu Categories
CREATE TABLE IF NOT EXISTS menu_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  display_order INTEGER DEFAULT 0,
  icon TEXT,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Menu Items
CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category_id INTEGER NOT NULL,
  base_price REAL NOT NULL CHECK(base_price > 0),
  image_url TEXT,
  preparation_time INTEGER DEFAULT 15 CHECK(preparation_time > 0),
  is_vegetarian BOOLEAN DEFAULT 0,
  is_vegan BOOLEAN DEFAULT 0,
  is_spicy BOOLEAN DEFAULT 0,
  spice_level INTEGER DEFAULT 0 CHECK(spice_level BETWEEN 0 AND 5),
  is_available BOOLEAN DEFAULT 1,
  tags TEXT,
  allergens TEXT,
  calories INTEGER,
  display_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES menu_categories(id) ON DELETE RESTRICT
);

-- Item Variants
CREATE TABLE IF NOT EXISTS menu_item_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_item_id INTEGER NOT NULL,
  variant_name TEXT NOT NULL,
  price_modifier REAL DEFAULT 0,
  is_default BOOLEAN DEFAULT 0,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT UNIQUE NOT NULL,
  table_id INTEGER,
  waiter_id INTEGER,
  order_type TEXT DEFAULT 'dine-in' CHECK(order_type IN ('dine-in', 'takeaway', 'delivery')),
  customer_name TEXT,
  customer_phone TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'preparing', 'ready', 'served', 'cancelled')),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  ready_at DATETIME,
  served_at DATETIME,
  cancelled_at DATETIME,
  cancel_reason TEXT,
  synced BOOLEAN DEFAULT 0,
  sync_version INTEGER DEFAULT 1,
  FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE SET NULL,
  FOREIGN KEY (waiter_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Order Items
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  menu_item_id INTEGER NOT NULL,
  variant_id INTEGER,
  quantity INTEGER DEFAULT 1 CHECK(quantity > 0),
  unit_price REAL NOT NULL CHECK(unit_price > 0),
  subtotal REAL NOT NULL CHECK(subtotal > 0),
  special_instructions TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'preparing', 'ready', 'served')),
  kot_printed BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE RESTRICT,
  FOREIGN KEY (variant_id) REFERENCES menu_item_variants(id) ON DELETE SET NULL
);

-- KOTs (Kitchen Order Tickets)
CREATE TABLE IF NOT EXISTS kots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kot_number TEXT UNIQUE NOT NULL,
  order_id INTEGER NOT NULL,
  station TEXT CHECK(station IN ('grill', 'chinese', 'bar', 'dessert', 'main', 'all')),
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'preparing', 'ready', 'served')),
  printed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  completed_at DATETIME,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- KOT Items
CREATE TABLE IF NOT EXISTS kot_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kot_id INTEGER NOT NULL,
  order_item_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  FOREIGN KEY (kot_id) REFERENCES kots(id),
  FOREIGN KEY (order_item_id) REFERENCES order_items(id)
);

-- Bills
CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_number TEXT UNIQUE NOT NULL,
  order_id INTEGER NOT NULL,
  table_id INTEGER,
  subtotal REAL NOT NULL CHECK(subtotal >= 0),
  service_charge REAL DEFAULT 0 CHECK(service_charge >= 0),
  service_charge_percent REAL DEFAULT 10,
  tax REAL DEFAULT 0 CHECK(tax >= 0),
  tax_percent REAL DEFAULT 13,
  discount_amount REAL DEFAULT 0 CHECK(discount_amount >= 0),
  discount_type TEXT CHECK(discount_type IN ('amount', 'percentage', NULL)),
  discount_reason TEXT,
  grand_total REAL NOT NULL CHECK(grand_total >= 0),
  status TEXT DEFAULT 'unpaid' CHECK(status IN ('unpaid', 'paid', 'cancelled')),
  cashier_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  paid_at DATETIME,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE SET NULL,
  FOREIGN KEY (cashier_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Bill Payments
CREATE TABLE IF NOT EXISTS bill_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL,
  payment_method TEXT NOT NULL CHECK(payment_method IN ('cash', 'card', 'qr', 'credit')),
  amount REAL NOT NULL,
  reference_number TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bill_id) REFERENCES bills(id)
);

-- Ingredients
CREATE TABLE IF NOT EXISTS ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  unit TEXT NOT NULL CHECK(unit IN ('kg', 'g', 'L', 'ml', 'pcs', 'dozen', 'packet')),
  current_stock REAL DEFAULT 0,
  min_stock_level REAL DEFAULT 0,
  cost_per_unit REAL DEFAULT 0,
  supplier TEXT,
  last_purchased_at DATETIME,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Recipe Ingredients
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_item_id INTEGER NOT NULL,
  ingredient_id INTEGER NOT NULL,
  quantity_required REAL NOT NULL,
  unit TEXT NOT NULL,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
);

-- Sync Logs
CREATE TABLE IF NOT EXISTS sync_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  record_id INTEGER NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('INSERT', 'UPDATE', 'DELETE')),
  data TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  device_id TEXT,
  synced_to_local BOOLEAN DEFAULT 0,
  synced_to_cloud BOOLEAN DEFAULT 0,
  sync_attempted_at DATETIME,
  sync_error TEXT,
  vector_clock TEXT
);

-- Branches
CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Settings
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Customers (for loyalty and delivery)
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  email TEXT,
  address TEXT,
  total_orders INTEGER DEFAULT 0,
  total_spent REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_tables_status ON tables(status);
CREATE INDEX IF NOT EXISTS idx_tables_floor_section ON tables(floor, section);
CREATE INDEX IF NOT EXISTS idx_menuitems_category ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menuitems_available ON menu_items(is_available);
CREATE INDEX IF NOT EXISTS idx_menuitems_code ON menu_items(item_code);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(table_id);
CREATE INDEX IF NOT EXISTS idx_orders_waiter ON orders(waiter_id);
CREATE INDEX IF NOT EXISTS idx_orderitems_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_kots_status ON kots(status);
CREATE INDEX IF NOT EXISTS idx_kots_station ON kots(station);
CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);
CREATE INDEX IF NOT EXISTS idx_bills_created ON bills(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_synclogs_synced_local ON sync_logs(synced_to_local);
CREATE INDEX IF NOT EXISTS idx_synclogs_synced_cloud ON sync_logs(synced_to_cloud);
CREATE INDEX IF NOT EXISTS idx_synclogs_timestamp ON sync_logs(timestamp);

-- ============================================
-- TRIGGERS
-- ============================================

-- Update timestamps
CREATE TRIGGER IF NOT EXISTS update_users_timestamp 
AFTER UPDATE ON users
BEGIN
  UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_menuitems_timestamp 
AFTER UPDATE ON menu_items
BEGIN
  UPDATE menu_items SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Auto-generate order number
CREATE TRIGGER IF NOT EXISTS generate_order_number
AFTER INSERT ON orders
WHEN NEW.order_number = ''
BEGIN
  UPDATE orders 
  SET order_number = 'ORD-' || strftime('%Y%m%d', 'now') || '-' || printf('%05d', NEW.id)
  WHERE id = NEW.id;
END;

-- Update table status when order is created
CREATE TRIGGER IF NOT EXISTS order_created_update_table
AFTER INSERT ON orders
WHEN NEW.table_id IS NOT NULL AND NEW.order_type = 'dine-in'
BEGIN
  UPDATE tables 
  SET status = 'occupied', 
      current_order_id = NEW.id,
      occupied_at = CURRENT_TIMESTAMP
  WHERE id = NEW.table_id;
END;

-- Auto-generate bill number
CREATE TRIGGER IF NOT EXISTS generate_bill_number
AFTER INSERT ON bills
WHEN NEW.bill_number = ''
BEGIN
  UPDATE bills 
  SET bill_number = 'BILL-' || strftime('%Y%m%d', 'now') || '-' || printf('%05d', NEW.id)
  WHERE id = NEW.id;
END;

-- Auto-generate KOT number
CREATE TRIGGER IF NOT EXISTS generate_kot_number
AFTER INSERT ON kots
WHEN NEW.kot_number = ''
BEGIN
  UPDATE kots 
  SET kot_number = 'KOT-' || strftime('%Y%m%d%H%M', 'now') || '-' || printf('%04d', NEW.id)
  WHERE id = NEW.id;
END;
