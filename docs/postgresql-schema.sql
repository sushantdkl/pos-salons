-- PostgreSQL schema for Salon POS
-- Compatible with cPanel PostgreSQL/phpPgAdmin and managed PostgreSQL providers.

BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'cashier', 'barber', 'stylist', 'beautician')),
  email TEXT,
  phone TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT UNIQUE NOT NULL,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  device_type TEXT,
  ip_address TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT UNIQUE,
  email TEXT,
  address TEXT,
  credit_limit NUMERIC DEFAULT 0,
  current_credit NUMERIC DEFAULT 0,
  gender TEXT,
  favorite_services TEXT,
  preferred_barber_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  preferred_stylist_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  preferred_beautician_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  customer_category TEXT DEFAULT 'New Customer',
  notes TEXT,
  total_visits INTEGER DEFAULT 0,
  total_spent NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS salon_service_categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS salon_services (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Haircut', 'Hair Color', 'Facial', 'Beard', 'Treatment', 'Makeup', 'Spa', 'Other')),
  price NUMERIC NOT NULL CHECK (price >= 0),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  assigned_staff_ids TEXT,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_package BOOLEAN DEFAULT FALSE,
  package_items TEXT,
  show_on_website BOOLEAN DEFAULT TRUE,
  featured_on_website BOOLEAN DEFAULT FALSE,
  website_image TEXT,
  website_description TEXT
);

CREATE TABLE IF NOT EXISTS staff_profiles (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT,
  salon_role TEXT NOT NULL DEFAULT 'stylist' CHECK (salon_role IN ('admin', 'cashier', 'barber', 'stylist', 'beautician')),
  assigned_services TEXT,
  commission_percentage NUMERIC DEFAULT 0 CHECK (commission_percentage >= 0 AND commission_percentage <= 100),
  base_salary NUMERIC DEFAULT 0 CHECK (base_salary >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  show_on_website BOOLEAN DEFAULT TRUE,
  featured_on_website BOOLEAN DEFAULT FALSE,
  website_title TEXT,
  website_bio TEXT,
  website_photo TEXT
);

CREATE TABLE IF NOT EXISTS website_content (
  id BIGSERIAL PRIMARY KEY,
  section_key TEXT UNIQUE NOT NULL,
  title TEXT,
  subtitle TEXT,
  description TEXT,
  image_url TEXT,
  button_text TEXT,
  button_link TEXT,
  secondary_button_text TEXT,
  secondary_button_link TEXT,
  is_visible BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  metadata TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS website_gallery_images (
  id BIGSERIAL PRIMARY KEY,
  image_url TEXT NOT NULL,
  title TEXT,
  alt_text TEXT,
  category TEXT,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_visible BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS website_services (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'Other',
  price NUMERIC DEFAULT 0 CHECK (price >= 0),
  price_label TEXT,
  duration_minutes INTEGER DEFAULT 30 CHECK (duration_minutes > 0),
  description TEXT,
  image_url TEXT,
  is_package BOOLEAN DEFAULT FALSE,
  package_items TEXT,
  show_on_website BOOLEAN DEFAULT TRUE,
  featured_on_website BOOLEAN DEFAULT FALSE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS website_staff_profiles (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  role_title TEXT,
  bio TEXT,
  specialties TEXT,
  image_url TEXT,
  show_on_website BOOLEAN DEFAULT TRUE,
  featured_on_website BOOLEAN DEFAULT FALSE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS salon_products (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  purchase_price NUMERIC DEFAULT 0 CHECK (purchase_price >= 0),
  selling_price NUMERIC NOT NULL CHECK (selling_price >= 0),
  current_stock INTEGER DEFAULT 0 CHECK (current_stock >= 0),
  low_stock_threshold INTEGER DEFAULT 0 CHECK (low_stock_threshold >= 0),
  supplier TEXT,
  expiry_date DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS walk_in_tokens (
  id BIGSERIAL PRIMARY KEY,
  token_number TEXT NOT NULL,
  token_date DATE NOT NULL,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  customer_phone TEXT,
  service_id BIGINT NOT NULL REFERENCES salon_services(id) ON DELETE RESTRICT,
  package_id BIGINT,
  assigned_staff_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'WAITING' CHECK (status IN ('WAITING', 'BILLED', 'CANCELLED', 'NO_SHOW')),
  people_ahead INTEGER DEFAULT 0 CHECK (people_ahead >= 0),
  estimated_wait_minutes_min INTEGER DEFAULT 0 CHECK (estimated_wait_minutes_min >= 0),
  estimated_wait_minutes_max INTEGER DEFAULT 0 CHECK (estimated_wait_minutes_max >= 0),
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  billed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  no_show_at TIMESTAMPTZ,
  invoice_id BIGINT,
  is_printed BOOLEAN DEFAULT FALSE,
  printed_at TIMESTAMPTZ,
  printed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (token_date, token_number)
);

CREATE TABLE IF NOT EXISTS salon_bills (
  id BIGSERIAL PRIMARY KEY,
  bill_number TEXT UNIQUE NOT NULL,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  customer_phone TEXT,
  subtotal NUMERIC NOT NULL CHECK (subtotal >= 0),
  discount_amount NUMERIC DEFAULT 0 CHECK (discount_amount >= 0),
  discount_type TEXT DEFAULT 'amount' CHECK (discount_type IN ('amount', 'percentage')),
  tax NUMERIC DEFAULT 0 CHECK (tax >= 0),
  tax_percent NUMERIC DEFAULT 0 CHECK (tax_percent >= 0),
  service_charge NUMERIC DEFAULT 0 CHECK (service_charge >= 0),
  grand_total NUMERIC NOT NULL CHECK (grand_total >= 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'online', 'split')),
  amount_paid NUMERIC NOT NULL CHECK (amount_paid >= 0),
  cash_amount NUMERIC DEFAULT 0 CHECK (cash_amount >= 0),
  qr_amount NUMERIC DEFAULT 0 CHECK (qr_amount >= 0),
  qr_type TEXT CHECK (qr_type IS NULL OR qr_type IN ('ESEWA_PHONEPAY', 'BANK')),
  total_paid NUMERIC DEFAULT 0 CHECK (total_paid >= 0),
  payment_status TEXT DEFAULT 'paid',
  cashier_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  token_id BIGINT REFERENCES walk_in_tokens(id) ON DELETE SET NULL,
  transaction_time TIMESTAMPTZ,
  is_printed BOOLEAN DEFAULT FALSE,
  printed_at TIMESTAMPTZ,
  printed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  status TEXT DEFAULT 'paid' CHECK (status IN ('paid', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS salon_bill_items (
  id BIGSERIAL PRIMARY KEY,
  bill_id BIGINT NOT NULL REFERENCES salon_bills(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('service', 'product')),
  item_id BIGINT NOT NULL,
  name TEXT NOT NULL,
  quantity INTEGER DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
  subtotal NUMERIC NOT NULL CHECK (subtotal >= 0),
  staff_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  commission_percentage NUMERIC DEFAULT 0,
  commission_amount NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES salon_products(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('stock_in', 'stock_out', 'sale', 'adjustment')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  previous_stock INTEGER NOT NULL,
  new_stock INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS action_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id BIGINT,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'online', 'bank_transfer', 'mixed')),
  cash_amount NUMERIC DEFAULT 0 CHECK (cash_amount >= 0),
  online_amount NUMERIC DEFAULT 0 CHECK (online_amount >= 0),
  paid_by TEXT,
  paid_to TEXT,
  expense_date DATE NOT NULL,
  notes TEXT,
  reference_number TEXT,
  attachment_url TEXT,
  salary_payment_id BIGINT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS salary_payments (
  id BIGSERIAL PRIMARY KEY,
  staff_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  salary_month TEXT NOT NULL,
  base_salary NUMERIC DEFAULT 0 CHECK (base_salary >= 0),
  commission_earned NUMERIC DEFAULT 0 CHECK (commission_earned >= 0),
  services_completed INTEGER DEFAULT 0 CHECK (services_completed >= 0),
  revenue_generated NUMERIC DEFAULT 0 CHECK (revenue_generated >= 0),
  bonus NUMERIC DEFAULT 0 CHECK (bonus >= 0),
  deduction NUMERIC DEFAULT 0 CHECK (deduction >= 0),
  total_payable NUMERIC NOT NULL CHECK (total_payable >= 0),
  amount_paid NUMERIC DEFAULT 0 CHECK (amount_paid >= 0),
  remaining_balance NUMERIC DEFAULT 0 CHECK (remaining_balance >= 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'online', 'bank_transfer', 'mixed')),
  cash_amount NUMERIC DEFAULT 0 CHECK (cash_amount >= 0),
  online_amount NUMERIC DEFAULT 0 CHECK (online_amount >= 0),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('unpaid', 'partially_paid', 'paid')),
  payment_date DATE NOT NULL,
  notes TEXT,
  expense_id BIGINT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_settings (
  id BIGSERIAL PRIMARY KEY,
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS license_info (
  id BIGSERIAL PRIMARY KEY,
  salon_name TEXT,
  salon_address TEXT,
  salon_phone TEXT,
  salon_email TEXT,
  owner_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE walk_in_tokens
  ADD CONSTRAINT fk_walk_in_tokens_invoice_id
  FOREIGN KEY (invoice_id) REFERENCES salon_bills(id) ON DELETE SET NULL;

ALTER TABLE expenses
  ADD CONSTRAINT fk_expenses_salary_payment_id
  FOREIGN KEY (salary_payment_id) REFERENCES salary_payments(id) ON DELETE SET NULL;

ALTER TABLE salary_payments
  ADD CONSTRAINT fk_salary_payments_expense_id
  FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_website_content_section ON website_content(section_key);
CREATE INDEX IF NOT EXISTS idx_website_gallery_visible_order ON website_gallery_images(is_visible, sort_order);
CREATE INDEX IF NOT EXISTS idx_website_services_visible_order ON website_services(show_on_website, display_order);
CREATE INDEX IF NOT EXISTS idx_website_staff_visible_order ON website_staff_profiles(show_on_website, display_order);
CREATE INDEX IF NOT EXISTS idx_tokens_date ON walk_in_tokens(token_date);
CREATE INDEX IF NOT EXISTS idx_tokens_number ON walk_in_tokens(token_number);
CREATE INDEX IF NOT EXISTS idx_tokens_status ON walk_in_tokens(status);
CREATE INDEX IF NOT EXISTS idx_tokens_staff ON walk_in_tokens(assigned_staff_id);
CREATE INDEX IF NOT EXISTS idx_tokens_invoice ON walk_in_tokens(invoice_id);
CREATE INDEX IF NOT EXISTS idx_tokens_created_at ON walk_in_tokens(created_at);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_payment_method ON expenses(payment_method);
CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses(created_at);
CREATE INDEX IF NOT EXISTS idx_salary_staff ON salary_payments(staff_id);
CREATE INDEX IF NOT EXISTS idx_salary_month ON salary_payments(salary_month);
CREATE INDEX IF NOT EXISTS idx_salary_status ON salary_payments(payment_status);
CREATE INDEX IF NOT EXISTS idx_salary_created_at ON salary_payments(created_at);

COMMIT;
