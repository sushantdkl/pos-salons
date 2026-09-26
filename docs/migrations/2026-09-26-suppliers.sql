-- Suppliers, purchases (stock received) and supplier payments.
--
-- Accounting treatment (cash basis, the same as every other outflow in this POS):
--   purchase received  -> stock increases and the SUPPLIER BALANCE (payable) increases.
--                         No expense and no cash movement: nothing has been paid yet.
--   supplier payment   -> one 'Product Purchase' EXPENSE row (cash / online split), linked by
--                         expenses.supplier_payment_id. That row is what moves Expected Cash,
--                         online balances, Summary, Analytics and reports — exactly once.
--   supplier balance   = opening_balance + purchases received - payments made.
-- Forward-only; no existing row is changed.
BEGIN;

CREATE TABLE IF NOT EXISTS suppliers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  pan_vat TEXT,
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (opening_balance >= 0),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_suppliers_name_active ON suppliers(LOWER(name)) WHERE is_active;

CREATE TABLE IF NOT EXISTS purchases (
  id BIGSERIAL PRIMARY KEY,
  purchase_number TEXT NOT NULL UNIQUE,
  supplier_id BIGINT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  purchase_date DATE NOT NULL,
  supplier_invoice TEXT,
  subtotal NUMERIC(14,2) NOT NULL CHECK (subtotal >= 0),
  discount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  tax NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (tax >= 0),
  total NUMERIC(14,2) NOT NULL CHECK (total >= 0),
  status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'VOID')),
  void_reason TEXT,
  voided_at TIMESTAMPTZ,
  voided_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  business_day_id BIGINT REFERENCES business_days(id) ON DELETE SET NULL,
  store_session_id BIGINT REFERENCES store_sessions(id) ON DELETE SET NULL,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (total = subtotal - discount + tax)
);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id, purchase_date);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(purchase_date, status);

CREATE TABLE IF NOT EXISTS purchase_items (
  id BIGSERIAL PRIMARY KEY,
  purchase_id BIGINT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES salon_products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(14,2) NOT NULL CHECK (unit_cost >= 0),
  line_total NUMERIC(14,2) NOT NULL CHECK (line_total >= 0)
);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id BIGSERIAL PRIMARY KEY,
  payment_number TEXT NOT NULL UNIQUE,
  supplier_id BIGINT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  purchase_id BIGINT REFERENCES purchases(id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'online')),
  payment_date DATE NOT NULL,
  reference_number TEXT,
  notes TEXT,
  expense_id BIGINT REFERENCES expenses(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'VOID')),
  void_reason TEXT,
  voided_at TIMESTAMPTZ,
  voided_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  business_day_id BIGINT REFERENCES business_days(id) ON DELETE SET NULL,
  store_session_id BIGINT REFERENCES store_sessions(id) ON DELETE SET NULL,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON supplier_payments(supplier_id, payment_date);

-- The expense a supplier payment produced. Such rows are managed from Suppliers only.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS supplier_payment_id BIGINT REFERENCES supplier_payments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_supplier_payment ON expenses(supplier_payment_id) WHERE supplier_payment_id IS NOT NULL;

-- Stock movements caused by a purchase (or its void).
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS purchase_id BIGINT REFERENCES purchases(id) ON DELETE SET NULL;

INSERT INTO document_sequences(document_type, next_value) VALUES ('purchase', 1), ('supplier_payment', 1)
ON CONFLICT (document_type) DO NOTHING;

COMMIT;
