import bcrypt from 'bcryptjs';

const CUSTOMER_COLUMNS = [
  ['gender', 'TEXT'],
  ['favorite_services', 'TEXT'],
  ['preferred_barber_id', 'INTEGER'],
  ['preferred_stylist_id', 'INTEGER'],
  ['preferred_beautician_id', 'INTEGER'],
  ['customer_category', "TEXT DEFAULT 'New Customer'"],
  ['notes', 'TEXT'],
  ['total_visits', 'INTEGER DEFAULT 0'],
  ['total_spent', 'REAL DEFAULT 0'],
  ['updated_at', 'DATETIME']
];

const BARBER_SERVICES = 'Hair Cut,Hair Wash,Shaving,Head Massage,Threading';
const BEAUTY_SERVICES = 'Normal Cleansing,Deep Cleansing,Wine Facial,Fruit Facial,Lotus Facial,Threading';

const LAUNCH_STAFF = [
  {
    username: 'admin',
    name: 'Admin',
    role: 'admin',
    salonRole: 'admin',
    pin: '1111',
    email: 'admin@thehaircut.local',
    assignedServices: '',
    commission: 0,
  },
  {
    username: 'kanchan',
    name: 'Kanchan',
    role: 'cashier',
    salonRole: 'beautician',
    pin: '2222',
    email: 'kanchan@thehaircut.local',
    assignedServices: BEAUTY_SERVICES,
    commission: 10,
  },
  {
    username: 'raashid',
    name: 'Raashid',
    role: 'barber',
    salonRole: 'barber',
    pin: '3333',
    email: 'raashid@thehaircut.local',
    assignedServices: BARBER_SERVICES,
    commission: 10,
  },
  {
    username: 'salman',
    name: 'Salman',
    role: 'barber',
    salonRole: 'barber',
    pin: '4444',
    email: 'salman@thehaircut.local',
    assignedServices: BARBER_SERVICES,
    commission: 10,
  },
  {
    username: 'saajid',
    name: 'Saajid',
    role: 'barber',
    salonRole: 'barber',
    pin: '5555',
    email: 'saajid@thehaircut.local',
    assignedServices: BARBER_SERVICES,
    commission: 10,
  },
];

const LAUNCH_SERVICES = [
  ['Hair Cut', 'Haircut', 150, 30, 'Client rate card service', 0, ''],
  ['Hair Wash', 'Treatment', 50, 15, 'Client rate card service', 0, ''],
  ['Shaving', 'Beard', 100, 20, 'Client rate card service', 0, ''],
  ['Head Massage', 'Spa', 200, 20, 'Client rate card service', 0, ''],
  ['Threading', 'Facial', 50, 15, 'Client rate card service', 0, ''],
  ['Normal Cleansing', 'Facial', 500, 35, 'Client rate card service', 0, ''],
  ['Deep Cleansing', 'Facial', 800, 45, 'Client rate card service', 0, ''],
  ['Wine Facial', 'Facial', 1200, 60, 'Client rate card service', 0, ''],
  ['Fruit Facial', 'Facial', 1500, 60, 'Client rate card service', 0, ''],
  ['Lotus Facial', 'Facial', 1800, 60, 'Client rate card service', 0, ''],
  ['Hair Colouring', 'Hair Color', 500, 75, 'Starting from NPR 500+', 0, ''],
  ['Cap Highlight', 'Hair Color', 1000, 90, 'Starting from NPR 1000+', 0, ''],
  ['Hair Straight', 'Treatment', 1200, 90, 'Starting from NPR 1200+', 0, ''],
  ['Keratin', 'Treatment', 1500, 120, 'Starting from NPR 1500+', 0, ''],
  ['Piece Highlight', 'Hair Color', 200, 20, 'NPR 200 per piece', 0, ''],
  ['Silver Package', 'Other', 650, 80, 'Includes Hair Cut, Hair Wash, Shaving, Normal Cleansing', 1, 'Hair Cut,Hair Wash,Shaving,Normal Cleansing'],
  ['Gold Package', 'Other', 850, 90, 'Includes Hair Cut, Hair Wash, Shaving, Deep Cleansing', 1, 'Hair Cut,Hair Wash,Shaving,Deep Cleansing'],
  ['Platinum Package', 'Other', 1450, 120, 'Includes Hair Cut, Hair Wash, Shaving, Head Massage, Facial', 1, 'Hair Cut,Hair Wash,Shaving,Head Massage,Facial'],
];

function columnExists(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

function addColumnIfMissing(db, table, column, definition) {
  if (!columnExists(db, table, column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
}

function tableSql(db, table) {
  return db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)?.sql || '';
}

function seedSalonData(db) {
  const insertCategory = db.prepare('INSERT OR IGNORE INTO salon_service_categories (name, display_order) VALUES (?, ?)');
  ['Haircut', 'Hair Color', 'Facial', 'Beard', 'Treatment', 'Makeup', 'Spa', 'Other'].forEach((name, index) => {
    insertCategory.run(name, index + 1);
  });

  const insertService = db.prepare(`
    INSERT INTO salon_services (name, category, price, duration_minutes, description, is_package, package_items, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);
  const updateService = db.prepare(`
    UPDATE salon_services
    SET category = ?, price = ?, duration_minutes = ?, description = ?,
        is_package = ?, package_items = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  LAUNCH_SERVICES.forEach(([name, category, price, duration, description, isPackage, packageItems]) => {
    const existing = db.prepare('SELECT id FROM salon_services WHERE name = ? ORDER BY id ASC LIMIT 1').get(name);
    if (existing) {
      updateService.run(category, price, duration, description, isPackage, packageItems, existing.id);
    } else {
      insertService.run(name, category, price, duration, description, isPackage, packageItems);
    }
  });

  db.prepare(`
    UPDATE salon_services
    SET is_active = 0, updated_at = CURRENT_TIMESTAMP
    WHERE name IN ('Classic Haircut', 'Beard Trim', 'Hair Color', 'Deep Facial', 'Hair Spa')
  `).run();

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
    VALUES (?, ?, ?, ?, ?, 0)
    ON CONFLICT(user_id) DO UPDATE SET
      display_name = excluded.display_name,
      salon_role = excluded.salon_role,
      assigned_services = excluded.assigned_services,
      commission_percentage = excluded.commission_percentage,
      updated_at = CURRENT_TIMESTAMP
  `);

  db.prepare(`
    UPDATE users
    SET is_active = 0
    WHERE username IN ('cashier', 'barber', 'stylist', 'beautician')
       OR username LIKE 'qa_%'
       OR username LIKE 'salon_staff_%'
  `).run();

  LAUNCH_STAFF.forEach((staff) => {
    const hash = bcrypt.hashSync(staff.pin, 10);
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(staff.username);
    let userId = existing?.id;
    if (existing) {
      updateUser.run(staff.name, staff.role, hash, staff.email, staff.username);
    } else {
      const result = insertUser.run(staff.username, staff.name, staff.role, hash, staff.email);
      userId = result.lastInsertRowid;
    }
    upsertProfile.run(userId, staff.name, staff.salonRole, staff.assignedServices, staff.commission);
  });
}

function normalizeStaffProfileRoles(db) {
  const table = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'staff_profiles'").get();
  if (!table?.sql?.includes("'barber'")) {
    db.prepare('ALTER TABLE staff_profiles RENAME TO staff_profiles_legacy').run();
    db.prepare(`
      CREATE TABLE staff_profiles (
        user_id INTEGER PRIMARY KEY,
        display_name TEXT,
        salon_role TEXT NOT NULL DEFAULT 'stylist' CHECK(salon_role IN ('admin', 'cashier', 'barber', 'stylist', 'beautician')),
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
             CASE WHEN salon_role IN ('admin', 'cashier', 'barber', 'beautician') THEN salon_role ELSE 'stylist' END,
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

function normalizeUsersTableRoles(db) {
  const table = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
  if (!table?.sql || table.sql.includes("'barber'")) return;

  db.pragma('foreign_keys = OFF');
  db.pragma('legacy_alter_table = ON');
  db.prepare('ALTER TABLE users RENAME TO users_legacy').run();
  db.prepare(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'cashier', 'barber', 'stylist', 'beautician')),
      email TEXT,
      phone TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  db.prepare(`
    INSERT INTO users (id, username, password_hash, full_name, role, email, phone, is_active, created_at)
    SELECT id,
           username,
           password_hash,
           full_name,
           CASE
             WHEN role = 'admin' THEN 'admin'
             WHEN role = 'cashier' THEN 'cashier'
             ELSE 'stylist'
           END,
           email,
           phone,
           COALESCE(is_active, 1),
           created_at
    FROM users_legacy
  `).run();
  db.prepare('DROP TABLE users_legacy').run();
  db.pragma('legacy_alter_table = OFF');
  db.pragma('foreign_keys = ON');
}

function rebuildTable(db, table, createSql, columns) {
  const legacyTable = `${table}_user_fk_legacy`;
  db.prepare(`DROP TABLE IF EXISTS ${legacyTable}`).run();
  db.prepare(`ALTER TABLE ${table} RENAME TO ${legacyTable}`).run();
  db.prepare(createSql).run();

  const legacyColumns = columns.filter((column) => columnExists(db, legacyTable, column));
  if (legacyColumns.length) {
    const columnList = legacyColumns.join(', ');
    db.prepare(`INSERT INTO ${table} (${columnList}) SELECT ${columnList} FROM ${legacyTable}`).run();
  }
  db.prepare(`DROP TABLE ${legacyTable}`).run();
}

function repairUserForeignKeyReferences(db) {
  const tables = [
    {
      table: 'sessions',
      columns: ['id', 'user_id', 'token', 'expires_at', 'created_at'],
      createSql: `
        CREATE TABLE sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          token TEXT UNIQUE NOT NULL,
          expires_at DATETIME NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `
    },
    {
      table: 'salon_bills',
      columns: [
        'id', 'bill_number', 'customer_id', 'customer_name', 'customer_phone',
        'subtotal', 'discount_amount', 'discount_type', 'tax', 'tax_percent',
        'service_charge', 'grand_total', 'payment_method', 'amount_paid',
        'cashier_id', 'notes', 'status', 'created_at'
      ],
      createSql: `
        CREATE TABLE salon_bills (
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
      `
    },
    {
      table: 'salon_bill_items',
      columns: [
        'id', 'bill_id', 'item_type', 'item_id', 'name', 'quantity',
        'unit_price', 'subtotal', 'staff_id', 'commission_percentage',
        'commission_amount', 'created_at'
      ],
      createSql: `
        CREATE TABLE salon_bill_items (
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
      `
    },
    {
      table: 'action_logs',
      columns: ['id', 'user_id', 'action', 'entity_type', 'entity_id', 'details', 'created_at'],
      createSql: `
        CREATE TABLE action_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          action TEXT NOT NULL,
          entity_type TEXT,
          entity_id INTEGER,
          details TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )
      `
    }
  ];

  const needsRepair = tables.some(({ table }) => tableSql(db, table).includes('users_legacy'));
  if (!needsRepair) return;

  db.pragma('foreign_keys = OFF');
  db.pragma('legacy_alter_table = ON');
  tables.forEach((definition) => {
    if (tableSql(db, definition.table).includes('users_legacy')) {
      rebuildTable(db, definition.table, definition.createSql, definition.columns);
    }
  });
  db.pragma('legacy_alter_table = OFF');
  db.pragma('foreign_keys = ON');
}

function cleanLegacyStaffIdentity(db) {
  const legacyPattern = "%waiter%";
  const legacyNameSql = `
    lower(COALESCE(full_name, '') || ' ' || COALESCE(username, '')) LIKE ?
    OR lower(COALESCE(full_name, '') || ' ' || COALESCE(username, '')) LIKE '%chef%'
    OR lower(COALESCE(full_name, '') || ' ' || COALESCE(username, '')) LIKE '%kitchen%'
    OR lower(COALESCE(full_name, '') || ' ' || COALESCE(username, '')) LIKE '%restaurant%'
    OR lower(COALESCE(full_name, '') || ' ' || COALESCE(username, '')) LIKE '%manager%'
  `;
  db.prepare(`
    UPDATE users
    SET full_name = CASE
          WHEN role = 'admin' THEN 'Salon Admin'
          WHEN role = 'cashier' THEN 'Salon Cashier'
          WHEN role = 'barber' THEN 'Salon Barber'
          WHEN role = 'beautician' THEN 'Salon Beautician'
          ELSE 'Salon Stylist'
        END,
        username = 'salon_staff_' || id,
        updated_at = CURRENT_TIMESTAMP
    WHERE username NOT IN ('admin', 'cashier', 'barber', 'stylist', 'beautician')
      AND (${legacyNameSql})
  `).run(legacyPattern);

  db.prepare(`
    UPDATE staff_profiles
    SET display_name = CASE
          WHEN salon_role = 'admin' THEN 'Salon Admin'
          WHEN salon_role = 'cashier' THEN 'Salon Cashier'
          WHEN salon_role = 'barber' THEN 'Salon Barber'
          WHEN salon_role = 'beautician' THEN 'Salon Beautician'
          ELSE 'Salon Stylist'
        END,
        updated_at = CURRENT_TIMESTAMP
    WHERE lower(COALESCE(display_name, '')) LIKE '%waiter%'
       OR lower(COALESCE(display_name, '')) LIKE '%chef%'
       OR lower(COALESCE(display_name, '')) LIKE '%kitchen%'
       OR lower(COALESCE(display_name, '')) LIKE '%restaurant%'
       OR lower(COALESCE(display_name, '')) LIKE '%manager%'
  `).run();
}

export function ensureSalonSchema(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'cashier', 'barber', 'stylist', 'beautician')),
      email TEXT,
      phone TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  normalizeUsersTableRoles(db);

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
  addColumnIfMissing(db, 'salon_services', 'is_package', 'INTEGER DEFAULT 0');
  addColumnIfMissing(db, 'salon_services', 'package_items', 'TEXT');

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
      salon_role TEXT NOT NULL DEFAULT 'stylist' CHECK(salon_role IN ('admin', 'cashier', 'barber', 'stylist', 'beautician')),
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
  repairUserForeignKeyReferences(db);

  CUSTOMER_COLUMNS.forEach(([column, definition]) => addColumnIfMissing(db, 'customers', column, definition));
  db.prepare(`
    INSERT INTO staff_profiles (user_id, display_name, salon_role, commission_percentage, base_salary)
    SELECT id,
           CASE
             WHEN role = 'admin' THEN 'Salon Admin'
             WHEN role = 'cashier' THEN 'Cashier'
             WHEN role = 'barber' THEN 'Barber'
             ELSE 'Stylist'
           END,
           CASE
             WHEN role = 'admin' THEN 'admin'
             WHEN role = 'cashier' THEN 'cashier'
             WHEN role = 'barber' THEN 'barber'
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
      WHEN role = 'barber' THEN 'barber'
      ELSE 'stylist'
    END
  `).run();
  cleanLegacyStaffIdentity(db);

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
