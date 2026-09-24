-- Phase 5A: digital service loyalty (auditable ledger) + customer reviews / feedback forms.
-- Forward-only and idempotent.
--
-- Loyalty is a LEDGER: progress = SUM(visits). EARN (+1 per eligible paid bill line, once),
-- REDEEM (−required visits), REVERSAL (undoes one EARN or REDEEM), MANUAL_ADJUSTMENT, EXPIRY.
-- A redeemed reward is a DISCOUNT on the bill (salon_bills.loyalty_discount, also inside
-- discount_amount so gross − discount = net holds everywhere) — never a payment.

BEGIN;

CREATE TABLE IF NOT EXISTS loyalty_programs (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  rule_type TEXT NOT NULL DEFAULT 'VISIT_COUNT' CHECK (rule_type IN ('VISIT_COUNT')),
  eligible_service_ids BIGINT[] NOT NULL DEFAULT '{}',
  eligible_categories TEXT[] NOT NULL DEFAULT '{}',
  required_visits INTEGER NOT NULL CHECK (required_visits BETWEEN 1 AND 100),
  reward_type TEXT NOT NULL CHECK (reward_type IN ('FREE_SERVICE', 'FIXED_DISCOUNT', 'PERCENTAGE_DISCOUNT')),
  reward_service_id BIGINT REFERENCES salon_services(id) ON DELETE RESTRICT,
  reward_value NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (reward_value >= 0),
  reward_label TEXT NOT NULL,
  reward_counts_as_visit BOOLEAN NOT NULL DEFAULT FALSE,   -- default: the free service does not start the next card
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date IS NULL OR end_date >= start_date),
  CHECK (reward_type <> 'FREE_SERVICE' OR reward_service_id IS NOT NULL),
  CHECK (reward_type <> 'PERCENTAGE_DISCOUNT' OR reward_value <= 100),
  CHECK (cardinality(eligible_service_ids) > 0 OR cardinality(eligible_categories) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_loyalty_programs_name ON loyalty_programs(LOWER(name));

ALTER TABLE salon_bills ADD COLUMN IF NOT EXISTS loyalty_discount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE salon_bills ADD COLUMN IF NOT EXISTS loyalty_program_id BIGINT REFERENCES loyalty_programs(id) ON DELETE SET NULL;
ALTER TABLE salon_bill_items ADD COLUMN IF NOT EXISTS loyalty_reward BOOLEAN NOT NULL DEFAULT FALSE;
-- A bill fully covered by a loyalty reward totals Rs 0 and must still be voidable: a void
-- correction may record a zero amount (nothing is refunded).
ALTER TABLE financial_corrections DROP CONSTRAINT IF EXISTS financial_corrections_amount_check;
ALTER TABLE financial_corrections ADD CONSTRAINT financial_corrections_amount_check CHECK (amount >= 0);
DO $$ BEGIN
  ALTER TABLE salon_bills ADD CONSTRAINT salon_bills_loyalty_discount_check CHECK (loyalty_discount >= 0 AND loyalty_discount <= discount_amount);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS loyalty_ledger (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  program_id BIGINT NOT NULL REFERENCES loyalty_programs(id) ON DELETE RESTRICT,
  bill_id BIGINT REFERENCES salon_bills(id) ON DELETE RESTRICT,
  bill_item_id BIGINT REFERENCES salon_bill_items(id) ON DELETE RESTRICT,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('EARN', 'REDEEM', 'REVERSAL', 'MANUAL_ADJUSTMENT', 'EXPIRY')),
  visits INTEGER NOT NULL CHECK (visits <> 0),
  reversal_of BIGINT REFERENCES loyalty_ledger(id) ON DELETE RESTRICT,
  source TEXT NOT NULL CHECK (source IN ('POS', 'CLAIM_CODE', 'ADMIN', 'VOID', 'SYSTEM')),
  balance_before INTEGER,
  balance_after INTEGER,
  note TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (entry_type <> 'EARN' OR (visits = 1 AND bill_item_id IS NOT NULL)),
  CHECK (entry_type <> 'REVERSAL' OR reversal_of IS NOT NULL),
  CHECK (entry_type <> 'MANUAL_ADJUSTMENT' OR note IS NOT NULL)
);
-- One eligible bill line earns at most once per program; each entry is reversed at most once;
-- one bill redeems a program at most once.
CREATE UNIQUE INDEX IF NOT EXISTS ux_loyalty_earn_item ON loyalty_ledger(program_id, bill_item_id) WHERE entry_type = 'EARN';
CREATE UNIQUE INDEX IF NOT EXISTS ux_loyalty_reversal ON loyalty_ledger(reversal_of) WHERE entry_type = 'REVERSAL';
CREATE UNIQUE INDEX IF NOT EXISTS ux_loyalty_redeem_bill ON loyalty_ledger(program_id, bill_id) WHERE entry_type = 'REDEEM';
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_customer ON loyalty_ledger(customer_id, program_id, created_at);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_bill ON loyalty_ledger(bill_id);

-- One-time codes for bills made without an identified customer (printed on the receipt).
CREATE TABLE IF NOT EXISTS loyalty_claim_codes (
  id BIGSERIAL PRIMARY KEY,
  bill_id BIGINT NOT NULL UNIQUE REFERENCES salon_bills(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ,
  claimed_customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feedback_forms (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'INACTIVE')),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  applicable_service_ids BIGINT[] NOT NULL DEFAULT '{}',
  rating_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  review_text_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  staff_feedback_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  service_feedback_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  public_consent_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  questions JSONB NOT NULL DEFAULT '[]',
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_feedback_forms_default ON feedback_forms(is_default) WHERE is_default;

CREATE TABLE IF NOT EXISTS customer_reviews (
  id BIGSERIAL PRIMARY KEY,
  form_id BIGINT REFERENCES feedback_forms(id) ON DELETE SET NULL,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  bill_id BIGINT REFERENCES salon_bills(id) ON DELETE SET NULL,
  service_id BIGINT REFERENCES salon_services(id) ON DELETE SET NULL,
  staff_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  overall_rating SMALLINT CHECK (overall_rating BETWEEN 1 AND 5),
  answers JSONB NOT NULL DEFAULT '[]',
  review_text TEXT,
  display_name TEXT,                 -- first name only, snapshot for public display
  public_consent BOOLEAN NOT NULL DEFAULT FALSE,
  verified BOOLEAN NOT NULL DEFAULT FALSE,   -- linked to a real paid bill of this customer
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PUBLISHED', 'PRIVATE', 'REJECTED', 'ARCHIVED')),
  superseded BOOLEAN NOT NULL DEFAULT FALSE, -- admin re-opened the visit for a new review
  source TEXT NOT NULL DEFAULT 'QR' CHECK (source IN ('QR', 'ADMIN')),
  client_hash TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  moderated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  moderated_at TIMESTAMPTZ,
  moderation_note TEXT,
  CHECK (status <> 'PUBLISHED' OR public_consent)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_customer_reviews_bill ON customer_reviews(bill_id) WHERE bill_id IS NOT NULL AND NOT superseded;
CREATE INDEX IF NOT EXISTS idx_customer_reviews_status ON customer_reviews(status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_reviews_customer ON customer_reviews(customer_id);

CREATE TABLE IF NOT EXISTS crm_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  public_rewards_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  public_reviews_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  general_feedback_enabled BOOLEAN NOT NULL DEFAULT TRUE,   -- reviews without a verified visit
  claim_codes_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  claim_code_valid_days INTEGER NOT NULL DEFAULT 7 CHECK (claim_code_valid_days BETWEEN 1 AND 60),
  review_window_days INTEGER NOT NULL DEFAULT 14 CHECK (review_window_days BETWEEN 1 AND 90),
  website_reviews_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  receipt_qr_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  qr_headline TEXT NOT NULL DEFAULT 'LOVE YOUR LOOK?',
  qr_subtext TEXT NOT NULL DEFAULT 'Scan to leave a review & check your rewards.',
  qr_footer TEXT NOT NULL DEFAULT '9 Haircuts + 1 FREE',
  low_rating_threshold SMALLINT NOT NULL DEFAULT 2 CHECK (low_rating_threshold BETWEEN 1 AND 4),
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO crm_settings(id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS crm_audit_log (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,      -- loyalty_program | loyalty_ledger | review | feedback_form | crm_settings
  entity_id BIGINT,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  reason TEXT,
  actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_audit_entity ON crm_audit_log(entity_type, entity_id);

-- Default feedback form (simple: overall rating, a few star questions, comments).
INSERT INTO feedback_forms(name, description, status, is_default, questions)
SELECT 'General Salon Feedback', 'How was your visit?', 'ACTIVE', TRUE, '[
  {"id":"service_quality","type":"STAR","label":"Service quality","required":false},
  {"id":"staff_experience","type":"STAR","label":"Staff experience","required":false},
  {"id":"cleanliness","type":"STAR","label":"Cleanliness","required":false},
  {"id":"value","type":"STAR","label":"Value for money","required":false}
]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM feedback_forms);

-- Permissions: denied to every non-admin role by default.
INSERT INTO role_permissions(role, permission_key, allowed)
SELECT role_name, permission_key, FALSE
FROM (VALUES ('cashier'), ('barber'), ('stylist'), ('beautician')) roles(role_name)
CROSS JOIN (VALUES ('loyalty.view'), ('loyalty.adjust'), ('loyalty.manage'), ('reviews.view'), ('reviews.moderate'), ('reviews.manage')) permissions(permission_key)
ON CONFLICT (role, permission_key) DO NOTHING;

COMMIT;
