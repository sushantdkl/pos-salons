import bcrypt from 'bcryptjs';

const CUSTOMER_COLUMNS = [
  ['gender', 'TEXT'],
  ['favorite_services', 'TEXT'],
  ['preferred_stylist_id', 'INTEGER'],
  ['notes', 'TEXT'],
  ['total_visits', 'INTEGER DEFAULT 0'],
  ['total_spent', 'REAL DEFAULT 0'],
  ['updated_at', 'DATETIME']
];

function columnExists(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

function addColumnIfMissing(db, table, column, definition) {
  if (!columnExists(db, table, column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
}

function seedSalonData(db) {
  const categoryCount = db.prepare('SELECT COUNT(*) as count FROM salon_service_categories').get().count;
  if (categoryCount === 0) {
    const insertCategory = db.prepare('INSERT INTO salon_service_categories (name, display_order) VALUES (?, ?)');
    ['Haircut', 'Hair Color', 'Facial', 'Beard', 'Treatment', 'Makeup', 'Spa', 'Other'].forEach((name, index) => {
      insertCategory.run(name, index + 1);
    });
  }

  const serviceCount = db.prepare('SELECT COUNT(*) as count FROM salon_services').get().count;
  if (serviceCount === 0) {
    const insertService = db.prepare(`
      INSERT INTO salon_services (name, category, price, duration_minutes, description, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    [
      ['Classic Haircut', 'Haircut', 500, 30, 'Clean salon haircut with finishing'],
      ['Beard Trim', 'Beard', 250, 20, 'Shape, trim, and finish'],
      ['Hair Color', 'Hair Color', 2200, 90, 'Professional color application'],
      ['Deep Facial', 'Facial', 1800, 60, 'Skin cleansing and facial care'],
      ['Hair Spa', 'Spa', 1500, 50, 'Relaxing hair spa treatment']
    ].forEach((service) => insertService.run(...service));
  }

  const productCount = db.prepare('SELECT COUNT(*) as count FROM salon_products').get().count;
  if (productCount === 0) {
    const insertProduct = db.prepare(`
      INSERT INTO salon_products (
        name, category, purchase_price, selling_price, current_stock,
        low_stock_threshold, supplier, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `);
    [
      ['Keratin Shampoo', 'Shampoo', 450, 750, 18, 5, 'Salon Supplier'],
      ['Hair Color Tube', 'Hair Color', 300, 550, 24, 8, 'Color Pro'],
      ['Facial Kit', 'Facial Kit', 900, 1400, 8, 3, 'Beauty Care'],
      ['Hair Wax', 'Styling', 220, 400, 15, 5, 'Style Hub']
    ].forEach((product) => insertProduct.run(...product));
  }
}

function seedRoleUsers(db) {
  const users = [
    ['admin', 'Salon Admin', 'admin', '123456', 'admin@salon.local'],
    ['cashier', 'Salon Cashier', 'cashier', '1234', 'cashier@salon.local'],
    ['stylist', 'Salon Stylist', 'stylist', '2222', 'stylist@salon.local'],
    ['beautician', 'Salon Beautician', 'beautician', '3333', 'beautician@salon.local'],
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (username, full_name, role, password_hash, email, phone, is_active)
    VALUES (?, ?, ?, ?, ?, '', 1)
  `);
  const updateUser = db.prepare(`
    UPDATE users
    SET full_name = ?, role = ?, password_hash = ?, email = ?, is_active = 1
    WHERE username = ?
  `);
  const upsertProfile = db.prepare(`
    INSERT INTO staff_profiles (user_id, display_name, salon_role, assigned_services, commission_percentage, base_salary)
    VALUES (?, ?, ?, '', ?, 0)
    ON CONFLICT(user_id) DO UPDATE SET
      display_name = excluded.display_name,
      salon_role = excluded.salon_role,
      updated_at = CURRENT_TIMESTAMP
  `);

  users.forEach(([username, name, role, password, email]) => {
    const hash = bcrypt.hashSync(password, 10);
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    let userId = existing?.id;
    if (existing) {
      updateUser.run(name, role, hash, email, username);
    } else {
      const result = insertUser.run(username, name, role, hash, email);
      userId = result.lastInsertRowid;
    }
    upsertProfile.run(userId, name, role, role === 'admin' ? 0 : 10);
  });
}

function normalizeStaffProfileRoles(db) {
  const table = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'staff_profiles'").get();
  if (!table?.sql?.includes("'cashier'")) {
    db.prepare('ALTER TABLE staff_profiles RENAME TO staff_profiles_legacy').run();
    db.prepare(`
      CREATE TABLE staff_profiles (
        user_id INTEGER PRIMARY KEY,
        display_name TEXT,
        salon_role TEXT NOT NULL DEFAULT 'stylist' CHECK(salon_role IN ('admin', 'cashier', 'stylist', 'beautician')),
        assigned_services TEXT,
        commission_percentage REAL DEFAULT 0 CHECK(commission_percentage >= 0 AND commission_percentage <= 100),
        base_salary REAL DEFAULT 0 CHECK(base_salary >= 0),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `).run();
    db.prepare(`
      INSERT INTO staff_profiles (
        user_id, display_name, salon_role, assigned_services,
        commission_percentage, base_salary, created_at, updated_at
      )
      SELECT user_id,
             display_name,
             CASE WHEN salon_role IN ('admin', 'cashier', 'beautician') THEN salon_role ELSE 'stylist' END,
             assigned_services,
             commission_percentage,
             base_salary,
             created_at,
             updated_at
      FROM staff_profiles_legacy
    `).run();
    db.prepare('DROP TABLE staff_profiles_legacy').run();
  }
}

export function ensureSalonSchema(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'cashier', 'stylist', 'beautician')),
      email TEXT,
      phone TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT UNIQUE NOT NULL,
      user_id INTEGER,
      device_type TEXT,
      ip_address TEXT,
      is_active INTEGER DEFAULT 1,
      last_seen DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT UNIQUE,
      email TEXT,
      address TEXT,
      credit_limit REAL DEFAULT 0,
      current_credit REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS salon_service_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      display_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS salon_services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('Haircut', 'Hair Color', 'Facial', 'Beard', 'Treatment', 'Makeup', 'Spa', 'Other')),
      price REAL NOT NULL CHECK(price >= 0),
      duration_minutes INTEGER NOT NULL CHECK(duration_minutes > 0),
      assigned_staff_ids TEXT,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS staff_profiles (
      user_id INTEGER PRIMARY KEY,
      display_name TEXT,
      salon_role TEXT NOT NULL DEFAULT 'stylist' CHECK(salon_role IN ('admin', 'cashier', 'stylist', 'beautician')),
      assigned_services TEXT,
      commission_percentage REAL DEFAULT 0 CHECK(commission_percentage >= 0 AND commission_percentage <= 100),
      base_salary REAL DEFAULT 0 CHECK(base_salary >= 0),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();
  normalizeStaffProfileRoles(db);
  addColumnIfMissing(db, 'staff_profiles', 'display_name', 'TEXT');

  db.prepare(`
    CREATE TABLE IF NOT EXISTS salon_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      purchase_price REAL DEFAULT 0 CHECK(purchase_price >= 0),
      selling_price REAL NOT NULL CHECK(selling_price >= 0),
      current_stock INTEGER DEFAULT 0 CHECK(current_stock >= 0),
      low_stock_threshold INTEGER DEFAULT 0 CHECK(low_stock_threshold >= 0),
      supplier TEXT,
      expiry_date DATE,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS salon_bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_number TEXT UNIQUE NOT NULL,
      customer_id INTEGER,
      customer_name TEXT,
      customer_phone TEXT,
      subtotal REAL NOT NULL CHECK(subtotal >= 0),
      discount_amount REAL DEFAULT 0 CHECK(discount_amount >= 0),
      discount_type TEXT DEFAULT 'amount' CHECK(discount_type IN ('amount', 'percentage')),
      tax REAL DEFAULT 0 CHECK(tax >= 0),
      tax_percent REAL DEFAULT 0 CHECK(tax_percent >= 0),
      service_charge REAL DEFAULT 0 CHECK(service_charge >= 0),
      grand_total REAL NOT NULL CHECK(grand_total >= 0),
      payment_method TEXT NOT NULL CHECK(payment_method IN ('cash', 'card', 'online', 'split')),
      amount_paid REAL NOT NULL CHECK(amount_paid >= 0),
      cashier_id INTEGER,
      notes TEXT,
      status TEXT DEFAULT 'paid' CHECK(status IN ('paid', 'cancelled')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
      FOREIGN KEY (cashier_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS salon_bill_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER NOT NULL,
      item_type TEXT NOT NULL CHECK(item_type IN ('service', 'product')),
      item_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      quantity INTEGER DEFAULT 1 CHECK(quantity > 0),
      unit_price REAL NOT NULL CHECK(unit_price >= 0),
      subtotal REAL NOT NULL CHECK(subtotal >= 0),
      staff_id INTEGER,
      commission_percentage REAL DEFAULT 0,
      commission_amount REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bill_id) REFERENCES salon_bills(id) ON DELETE CASCADE,
      FOREIGN KEY (staff_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      movement_type TEXT NOT NULL CHECK(movement_type IN ('stock_in', 'stock_out', 'sale', 'adjustment')),
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      previous_stock INTEGER NOT NULL,
      new_stock INTEGER NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES salon_products(id) ON DELETE CASCADE
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS action_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `).run();

  CUSTOMER_COLUMNS.forEach(([column, definition]) => addColumnIfMissing(db, 'customers', column, definition));
  db.prepare(`
    INSERT INTO staff_profiles (user_id, display_name, salon_role, commission_percentage, base_salary)
    SELECT id,
           CASE
             WHEN role = 'admin' THEN 'Salon Admin'
             WHEN role = 'cashier' THEN 'Cashier'
             ELSE 'Stylist'
           END,
           CASE
             WHEN role = 'admin' THEN 'admin'
             WHEN role = 'cashier' THEN 'cashier'
             ELSE 'stylist'
           END,
           10,
           0
    FROM users
    WHERE NOT EXISTS (SELECT 1 FROM staff_profiles WHERE staff_profiles.user_id = users.id)
  `).run();

  db.prepare(`
    UPDATE users
    SET role = CASE
      WHEN role = 'admin' THEN 'admin'
      WHEN role = 'cashier' THEN 'cashier'
      ELSE 'stylist'
    END
  `).run();

  seedRoleUsers(db);
  seedSalonData(db);
}

export function getAuthUser(request, db) {
  const header = request.headers.get('authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  return db.prepare(`
    SELECT u.id, u.username, u.full_name, u.role
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now') AND u.is_active = 1
  `).get(token);
}

export function requireAuth(request, db) {
  const user = getAuthUser(request, db);
  if (!user) {
    const error = new Error('Unauthorized');
    error.status = 401;
    throw error;
  }
  return user;
}

export function requireRole(request, db, roles) {
  const user = requireAuth(request, db);
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!allowed.includes(user.role)) {
    const error = new Error('Access denied');
    error.status = 403;
    throw error;
  }
  return user;
}

export function cleanText(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value).replace(/[<>]/g, '').trim();
}
