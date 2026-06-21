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

const BILL_COLUMNS = [
  ['token_id', 'INTEGER'],
  ['transaction_time', 'DATETIME'],
  ['is_printed', 'INTEGER DEFAULT 0'],
  ['printed_at', 'DATETIME'],
  ['printed_by', 'INTEGER'],
  ['cash_amount', 'REAL DEFAULT 0'],
  ['qr_amount', 'REAL DEFAULT 0'],
  ['qr_type', 'TEXT'],
  ['total_paid', 'REAL DEFAULT 0'],
  ['payment_status', "TEXT DEFAULT 'paid'"]
];

const TOKEN_COLUMNS = [
  ['is_printed', 'INTEGER DEFAULT 0'],
  ['printed_at', 'DATETIME'],
  ['printed_by', 'INTEGER']
];

const SERVICE_WEBSITE_COLUMNS = [
  ['show_on_website', 'INTEGER DEFAULT 1'],
  ['featured_on_website', 'INTEGER DEFAULT 0'],
  ['website_image', 'TEXT'],
  ['website_description', 'TEXT']
];

const STAFF_WEBSITE_COLUMNS = [
  ['show_on_website', 'INTEGER DEFAULT 1'],
  ['featured_on_website', 'INTEGER DEFAULT 0'],
  ['website_title', 'TEXT'],
  ['website_bio', 'TEXT'],
  ['website_photo', 'TEXT']
];

const EXPENSE_CATEGORIES = [
  'Staff Salary',
  'Staff Commission',
  'Product Purchase',
  'Rent',
  'Electricity',
  'Water',
  'Internet',
  'Maintenance',
  'Marketing',
  'Equipment',
  'Cleaning',
  'Other'
];

const EXPENSE_COLUMNS = [
  ['title', "TEXT DEFAULT 'Expense'"],
  ['category', "TEXT DEFAULT 'Other'"],
  ['amount', 'REAL DEFAULT 0'],
  ['payment_method', "TEXT DEFAULT 'cash'"],
  ['cash_amount', 'REAL DEFAULT 0'],
  ['online_amount', 'REAL DEFAULT 0'],
  ['paid_by', 'TEXT'],
  ['paid_to', 'TEXT'],
  ['expense_date', 'DATE'],
  ['description', 'TEXT'],
  ['notes', 'TEXT'],
  ['reference_number', 'TEXT'],
  ['attachment_url', 'TEXT'],
  ['salary_payment_id', 'INTEGER'],
  ['created_by', 'INTEGER'],
  ['updated_by', 'INTEGER'],
  ['deleted_at', 'DATETIME'],
  ['created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP'],
  ['updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP']
];

const SALARY_PAYMENT_COLUMNS = [
  ['staff_id', 'INTEGER'],
  ['salary_month', 'TEXT'],
  ['base_salary', 'REAL DEFAULT 0'],
  ['commission_earned', 'REAL DEFAULT 0'],
  ['services_completed', 'INTEGER DEFAULT 0'],
  ['revenue_generated', 'REAL DEFAULT 0'],
  ['bonus', 'REAL DEFAULT 0'],
  ['deduction', 'REAL DEFAULT 0'],
  ['total_payable', 'REAL DEFAULT 0'],
  ['amount_paid', 'REAL DEFAULT 0'],
  ['remaining_balance', 'REAL DEFAULT 0'],
  ['payment_method', "TEXT DEFAULT 'cash'"],
  ['cash_amount', 'REAL DEFAULT 0'],
  ['online_amount', 'REAL DEFAULT 0'],
  ['payment_status', "TEXT DEFAULT 'unpaid'"],
  ['payment_date', 'DATE'],
  ['notes', 'TEXT'],
  ['expense_id', 'INTEGER'],
  ['created_by', 'INTEGER'],
  ['updated_by', 'INTEGER'],
  ['deleted_at', 'DATETIME'],
  ['created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP'],
  ['updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP']
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

function seedWebsiteCmsData(db) {
  const contentCount = db.prepare('SELECT COUNT(*) as count FROM website_content').get().count;
  if (contentCount === 0) {
    const insertContent = db.prepare(`
      INSERT INTO website_content (
        section_key, title, subtitle, description, image_url, button_text,
        button_link, secondary_button_text, secondary_button_link, is_visible,
        sort_order, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    [
      [
        'hero',
        'The Hair Cut',
        "We'll style, You'll smile!",
        "The Hair Cut is a modern men's salon in Birendranagar-7, Surkhet offering haircuts, shaving, hair color, hair spa, facials, and grooming packages.",
        '/assets/hair_dressing_space1.jpg',
        'Book Appointment',
        '/book-appointment',
        'WhatsApp',
        'whatsapp',
        1,
        1,
        JSON.stringify({ eyebrow: 'Salon experience' })
      ],
      [
        'about',
        'A Surkhet grooming space built for everyday confidence',
        'About',
        'Our salon combines practical grooming, beauty care, and a clean professional setting.',
        '/assets/Salon_outside.jpg',
        '',
        '',
        '',
        '',
        1,
        2,
        JSON.stringify({
          highlights: ['Premium finish', 'Friendly staff', 'Clear packages'],
          galleryImages: ['/assets/Salon_Banner.jpeg', '/assets/Details.jpeg']
        })
      ],
      [
        'services',
        'Popular services',
        'Services',
        'Fast, clear pricing for daily grooming and beauty care.',
        '/assets/Haircut1.jpg',
        '',
        '',
        '',
        '',
        1,
        3,
        '{}'
      ],
      [
        'packages',
        "Men's packages",
        'Packages',
        'Grouped services for fast booking and clean billing.',
        '',
        '',
        '',
        '',
        '',
        1,
        4,
        '{}'
      ],
      [
        'staff',
        'Meet the staff',
        'Team',
        'Experienced staff for barbering, hair dressing, beauty care, and reception.',
        '',
        '',
        '',
        '',
        '',
        1,
        5,
        '{}'
      ],
      [
        'contact',
        'Location and contact',
        'Visit us',
        'Reach the salon or request an appointment through WhatsApp.',
        '',
        'Contact details',
        '/contact',
        'Book now',
        '/book-appointment',
        1,
        6,
        JSON.stringify({
          salonName: 'The Hair Cut',
          phone: '+977 9858051694',
          whatsappNumber: '9779858051694',
          address: 'Birendranagar-7, Surkhet',
          email: '',
          facebook: 'https://www.facebook.com/profile.php?id=61563439747795',
          tiktok: 'https://www.tiktok.com/@the.haircut1?_r=1&_t=ZS-96n9lkFroZA',
          openingHours: 'Opening hours: update with final salon schedule',
          mapEmbedUrl: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d4533.836830090373!2d81.6257918!3d28.5996354!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x39a2850030b92a09%3A0xa0f6893a8b7d98f4!2sThe%20Hair%20Cut!5e1!3m2!1sen!2snp!4v1780240711625!5m2!1sen!2snp'
        })
      ],
      [
        'seo',
        "The Hair Cut | Men's Salon in Birendranagar, Surkhet",
        '',
        "The Hair Cut is a modern men's salon in Birendranagar-7, Surkhet offering haircuts, shaving, hair color, hair spa, facials, and grooming packages.",
        '/assets/Salon_Banner.jpeg',
        '',
        '',
        '',
        '',
        1,
        7,
        JSON.stringify({
          ogTitle: "The Hair Cut | Men's Salon in Birendranagar, Surkhet",
          ogDescription: "The Hair Cut is a modern men's salon in Birendranagar-7, Surkhet offering haircuts, shaving, hair color, hair spa, facials, and grooming packages.",
          keywords: 'salon, haircut, barber, surkhet, facial, shaving'
        })
      ]
    ].forEach((row) => insertContent.run(...row));
  }

  const galleryCount = db.prepare('SELECT COUNT(*) as count FROM website_gallery_images').get().count;
  if (galleryCount === 0) {
    const insertGallery = db.prepare(`
      INSERT INTO website_gallery_images (image_url, title, alt_text, category, description, sort_order, is_visible)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `);
    [
      ['/assets/hair_dressing_space1.jpg', 'Hair Dressing Space 1', 'Salon hair dressing area.', 'Salon', 'Salon hair dressing area.'],
      ['/assets/hair_dressing_space2.jpg', 'Hair Dressing Space 2', 'Clean grooming workspace.', 'Salon', 'Clean grooming workspace.'],
      ['/assets/hair_dressing_space3.jpg', 'Hair Dressing Space 3', 'Salon styling area.', 'Salon', 'Salon styling area.'],
      ['/assets/hair_dressing_space4.jpg', 'Hair Dressing Space 4', 'Comfortable service station.', 'Salon', 'Comfortable service station.'],
      ['/assets/Haircut1.jpg', 'Haircut 1', 'Haircut service moment.', 'Services', 'Haircut service moment.'],
      ['/assets/Haircut2.jpg', 'Haircut 2', 'Salon haircut service.', 'Services', 'Salon haircut service.'],
      ['/assets/Haircut3.jpg', 'Haircut 3', 'Finished haircut style.', 'Services', 'Finished haircut style.'],
      ['/assets/Hairwash.jpg', 'Hair Wash', 'Hair wash service.', 'Services', 'Hair wash service.'],
      ['/assets/Happy_customers.jpg', 'Happy Customers', 'Customers enjoying the salon experience.', 'Customers', 'Customers enjoying the salon experience.'],
      ['/assets/Love_of_peoples.jpg', 'Love of Peoples', 'Community support and customer love.', 'Customers', 'Community support and customer love.'],
      ['/assets/Opening_moments.jpg', 'Opening Moments', 'Salon opening celebration.', 'Opening', 'Salon opening celebration.'],
      ['/assets/Opening_moments1.jpg', 'Opening Moments 1', 'Opening day memories.', 'Opening', 'Opening day memories.'],
      ['/assets/Opening_moments2.jpg', 'Opening Moments 2', 'Salon launch moments.', 'Opening', 'Salon launch moments.'],
      ['/assets/Salon_opening.jpg', 'Salon Opening', 'The Hair Cut opening event.', 'Opening', 'The Hair Cut opening event.'],
      ['/assets/Salon_outside.jpg', 'Salon Outside', 'Outside view of the salon.', 'Salon', 'Outside view of the salon.'],
      ['/assets/shaving.jpg', 'Shaving', 'Shaving and grooming service.', 'Services', 'Shaving and grooming service.'],
      ['/assets/Uv_sanitizations.jpg', 'UV Sanitizations', 'Clean and hygienic tools.', 'Hygiene', 'Clean and hygienic tools.']
    ].forEach((row, index) => insertGallery.run(...row, index + 1));
  }

  db.prepare(`
    UPDATE staff_profiles
    SET website_title = CASE
          WHEN website_title IS NOT NULL AND website_title <> '' THEN website_title
          WHEN salon_role = 'barber' THEN 'Barber / Hair Dresser'
          WHEN salon_role = 'beautician' THEN 'Beautician / Cashier'
          ELSE display_name
        END,
        website_bio = COALESCE(NULLIF(website_bio, ''), assigned_services)
  `).run();
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
        'cashier_id', 'token_id', 'transaction_time', 'is_printed', 'printed_at',
        'printed_by', 'notes', 'status', 'created_at'
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
          cash_amount REAL DEFAULT 0 CHECK(cash_amount >= 0),
          qr_amount REAL DEFAULT 0 CHECK(qr_amount >= 0),
          qr_type TEXT,
          total_paid REAL DEFAULT 0 CHECK(total_paid >= 0),
          payment_status TEXT DEFAULT 'paid',
          cashier_id INTEGER,
          token_id INTEGER,
          transaction_time DATETIME,
          is_printed INTEGER DEFAULT 0,
          printed_at DATETIME,
          printed_by INTEGER,
          notes TEXT,
          status TEXT DEFAULT 'paid' CHECK(status IN ('paid', 'cancelled')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
          FOREIGN KEY (token_id) REFERENCES walk_in_tokens(id) ON DELETE SET NULL,
          FOREIGN KEY (cashier_id) REFERENCES users(id) ON DELETE SET NULL,
          FOREIGN KEY (printed_by) REFERENCES users(id) ON DELETE SET NULL
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
  const legacyTerms = ['wait' + 'er', 'ch' + 'ef', 'kit' + 'chen', 'rest' + 'aurant', 'man' + 'ager'];
  const legacyNameSql = legacyTerms
    .map(() => "lower(COALESCE(full_name, '') || ' ' || COALESCE(username, '')) LIKE ?")
    .join(' OR ');
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
  `).run(...legacyTerms.map((term) => `%${term}%`));

  const legacyProfileSql = legacyTerms
    .map(() => "lower(COALESCE(display_name, '')) LIKE ?")
    .join(' OR ');

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
    WHERE ${legacyProfileSql}
  `).run(...legacyTerms.map((term) => `%${term}%`));
}

export async function ensureSalonSchema() {
  // PostgreSQL schema is applied via docs/postgresql-schema.sql before deployment.
  return;
}

async function ensureSalonSchemaLegacySqlite(db) {
  if (db?.provider === 'postgres') return;

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
  addColumnIfMissing(db, 'salon_services', 'is_package', 'INTEGER DEFAULT 0');
  addColumnIfMissing(db, 'salon_services', 'package_items', 'TEXT');
  SERVICE_WEBSITE_COLUMNS.forEach(([column, definition]) => addColumnIfMissing(db, 'salon_services', column, definition));

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
  STAFF_WEBSITE_COLUMNS.forEach(([column, definition]) => addColumnIfMissing(db, 'staff_profiles', column, definition));

  db.prepare(`
    CREATE TABLE IF NOT EXISTS website_content (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_key TEXT UNIQUE NOT NULL,
      title TEXT,
      subtitle TEXT,
      description TEXT,
      image_url TEXT,
      button_text TEXT,
      button_link TEXT,
      secondary_button_text TEXT,
      secondary_button_link TEXT,
      is_visible INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_by INTEGER,
      FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS website_gallery_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_url TEXT NOT NULL,
      title TEXT,
      alt_text TEXT,
      category TEXT,
      description TEXT,
      sort_order INTEGER DEFAULT 0,
      is_visible INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_by INTEGER,
      FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `).run();
  [
    'CREATE INDEX IF NOT EXISTS idx_website_content_section ON website_content(section_key)',
    'CREATE INDEX IF NOT EXISTS idx_website_gallery_visible_order ON website_gallery_images(is_visible, sort_order)'
  ].forEach((sql) => db.prepare(sql).run());

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
    CREATE TABLE IF NOT EXISTS walk_in_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_number TEXT NOT NULL,
      token_date DATE NOT NULL,
      customer_id INTEGER,
      customer_name TEXT,
      customer_phone TEXT,
      service_id INTEGER NOT NULL,
      package_id INTEGER,
      assigned_staff_id INTEGER,
      status TEXT NOT NULL DEFAULT 'WAITING' CHECK(status IN ('WAITING', 'BILLED', 'CANCELLED', 'NO_SHOW')),
      people_ahead INTEGER DEFAULT 0 CHECK(people_ahead >= 0),
      estimated_wait_minutes_min INTEGER DEFAULT 0 CHECK(estimated_wait_minutes_min >= 0),
      estimated_wait_minutes_max INTEGER DEFAULT 0 CHECK(estimated_wait_minutes_max >= 0),
      created_by INTEGER,
      billed_at DATETIME,
      cancelled_at DATETIME,
      no_show_at DATETIME,
      invoice_id INTEGER,
      is_printed INTEGER DEFAULT 0,
      printed_at DATETIME,
      printed_by INTEGER,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
      FOREIGN KEY (service_id) REFERENCES salon_services(id) ON DELETE RESTRICT,
      FOREIGN KEY (assigned_staff_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (printed_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (invoice_id) REFERENCES salon_bills(id) ON DELETE SET NULL,
      UNIQUE(token_date, token_number)
    )
  `).run();
  [
    'CREATE INDEX IF NOT EXISTS idx_tokens_date ON walk_in_tokens(token_date)',
    'CREATE INDEX IF NOT EXISTS idx_tokens_number ON walk_in_tokens(token_number)',
    'CREATE INDEX IF NOT EXISTS idx_tokens_status ON walk_in_tokens(status)',
    'CREATE INDEX IF NOT EXISTS idx_tokens_staff ON walk_in_tokens(assigned_staff_id)',
    'CREATE INDEX IF NOT EXISTS idx_tokens_invoice ON walk_in_tokens(invoice_id)',
    'CREATE INDEX IF NOT EXISTS idx_tokens_created_at ON walk_in_tokens(created_at)'
  ].forEach((sql) => db.prepare(sql).run());
  TOKEN_COLUMNS.forEach(([column, definition]) => addColumnIfMissing(db, 'walk_in_tokens', column, definition));
  db.prepare(`
    UPDATE walk_in_tokens
    SET status = 'BILLED',
        billed_at = COALESCE(billed_at, CURRENT_TIMESTAMP),
        updated_at = CURRENT_TIMESTAMP
    WHERE invoice_id IS NOT NULL AND status <> 'BILLED'
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
      cash_amount REAL DEFAULT 0 CHECK(cash_amount >= 0),
      qr_amount REAL DEFAULT 0 CHECK(qr_amount >= 0),
      qr_type TEXT,
      total_paid REAL DEFAULT 0 CHECK(total_paid >= 0),
      payment_status TEXT DEFAULT 'paid',
      cashier_id INTEGER,
      token_id INTEGER,
      transaction_time DATETIME,
      is_printed INTEGER DEFAULT 0,
      printed_at DATETIME,
      printed_by INTEGER,
      notes TEXT,
      status TEXT DEFAULT 'paid' CHECK(status IN ('paid', 'cancelled')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
      FOREIGN KEY (token_id) REFERENCES walk_in_tokens(id) ON DELETE SET NULL,
      FOREIGN KEY (printed_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (cashier_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `).run();
  BILL_COLUMNS.forEach(([column, definition]) => addColumnIfMissing(db, 'salon_bills', column, definition));

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

  db.prepare(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL CHECK(amount >= 0),
      payment_method TEXT NOT NULL CHECK(payment_method IN ('cash', 'online', 'bank_transfer', 'mixed')),
      cash_amount REAL DEFAULT 0 CHECK(cash_amount >= 0),
      online_amount REAL DEFAULT 0 CHECK(online_amount >= 0),
      paid_by TEXT,
      paid_to TEXT,
      expense_date DATE NOT NULL,
      notes TEXT,
      reference_number TEXT,
      attachment_url TEXT,
      salary_payment_id INTEGER,
      created_by INTEGER,
      updated_by INTEGER,
      deleted_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (salary_payment_id) REFERENCES salary_payments(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS salary_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id INTEGER NOT NULL,
      salary_month TEXT NOT NULL,
      base_salary REAL DEFAULT 0 CHECK(base_salary >= 0),
      commission_earned REAL DEFAULT 0 CHECK(commission_earned >= 0),
      services_completed INTEGER DEFAULT 0 CHECK(services_completed >= 0),
      revenue_generated REAL DEFAULT 0 CHECK(revenue_generated >= 0),
      bonus REAL DEFAULT 0 CHECK(bonus >= 0),
      deduction REAL DEFAULT 0 CHECK(deduction >= 0),
      total_payable REAL NOT NULL CHECK(total_payable >= 0),
      amount_paid REAL DEFAULT 0 CHECK(amount_paid >= 0),
      remaining_balance REAL DEFAULT 0 CHECK(remaining_balance >= 0),
      payment_method TEXT NOT NULL CHECK(payment_method IN ('cash', 'online', 'bank_transfer', 'mixed')),
      cash_amount REAL DEFAULT 0 CHECK(cash_amount >= 0),
      online_amount REAL DEFAULT 0 CHECK(online_amount >= 0),
      payment_status TEXT NOT NULL CHECK(payment_status IN ('unpaid', 'partially_paid', 'paid')),
      payment_date DATE NOT NULL,
      notes TEXT,
      expense_id INTEGER,
      created_by INTEGER,
      updated_by INTEGER,
      deleted_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (staff_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `).run();
  EXPENSE_COLUMNS.forEach(([column, definition]) => addColumnIfMissing(db, 'expenses', column, definition));
  SALARY_PAYMENT_COLUMNS.forEach(([column, definition]) => addColumnIfMissing(db, 'salary_payments', column, definition));
  db.prepare("UPDATE expenses SET expense_date = DATE(created_at) WHERE expense_date IS NULL").run();
  db.prepare("UPDATE salary_payments SET payment_date = DATE(created_at) WHERE payment_date IS NULL").run();
  db.prepare("UPDATE salary_payments SET salary_month = strftime('%Y-%m', COALESCE(payment_date, created_at)) WHERE salary_month IS NULL OR salary_month = ''").run();

  [
    'CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date)',
    'CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category)',
    'CREATE INDEX IF NOT EXISTS idx_expenses_payment_method ON expenses(payment_method)',
    'CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_salary_staff ON salary_payments(staff_id)',
    'CREATE INDEX IF NOT EXISTS idx_salary_month ON salary_payments(salary_month)',
    'CREATE INDEX IF NOT EXISTS idx_salary_status ON salary_payments(payment_status)',
    'CREATE INDEX IF NOT EXISTS idx_salary_created_at ON salary_payments(created_at)'
  ].forEach((sql) => db.prepare(sql).run());
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
  seedWebsiteCmsData(db);
}

export async function getAuthUser(request, db) {
  const header = request.headers.get('authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  return await db.get(`
    SELECT u.id, u.username, u.full_name, u.role
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > NOW() AND u.is_active = TRUE
  `, [token]);
}

export async function requireAuth(request, db) {
  const user = await getAuthUser(request, db);
  if (!user) {
    const error = new Error('Unauthorized');
    error.status = 401;
    throw error;
  }
  return user;
}

export async function requireRole(request, db, roles) {
  const user = await requireAuth(request, db);
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
