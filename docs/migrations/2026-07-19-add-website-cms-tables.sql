-- One-time migration for existing cPanel PostgreSQL databases.
-- Adds public website CMS tables without requiring the runtime app user to run DDL.

BEGIN;

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

CREATE INDEX IF NOT EXISTS idx_website_content_section ON website_content(section_key);
CREATE INDEX IF NOT EXISTS idx_website_gallery_visible_order ON website_gallery_images(is_visible, sort_order);
CREATE INDEX IF NOT EXISTS idx_website_services_visible_order ON website_services(show_on_website, display_order);
CREATE INDEX IF NOT EXISTS idx_website_staff_visible_order ON website_staff_profiles(show_on_website, display_order);

COMMIT;
