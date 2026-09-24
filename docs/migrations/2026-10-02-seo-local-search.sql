-- Website CMS → SEO & Local Search.
-- Public website only: search settings, per-page SEO overrides, service landing pages, guides,
-- and a 301 redirect list. Nothing here touches customers, billing, loyalty or staff data.
-- Forward-only and idempotent. Applied with `npm run db:migrate` (never from a request).

BEGIN;

-- One row (id = 1): local business facts, Google review link, Search Console token, GBP checklist,
-- keyword watchlist. JSON so the owner-facing form can grow without schema churn.
CREATE TABLE IF NOT EXISTS website_seo_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO website_seo_settings (id, settings) VALUES (1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING;

-- SEO overrides for the fixed public pages (/, /services, /contact, ...). Empty field = use the default.
CREATE TABLE IF NOT EXISTS website_page_seo (
  id SERIAL PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  seo_title TEXT,
  meta_description TEXT,
  og_title TEXT,
  og_description TEXT,
  og_image TEXT,
  canonical_override TEXT,
  noindex BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Service landing pages (/services/<slug>). A page lists only real services from the price list.
CREATE TABLE IF NOT EXISTS website_service_pages (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  heading TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  suitable_for TEXT NOT NULL DEFAULT '',
  service_names TEXT NOT NULL DEFAULT '',
  faqs JSONB NOT NULL DEFAULT '[]'::jsonb,
  related_slugs TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  image_alt TEXT,
  status TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  seo_title TEXT,
  meta_description TEXT,
  og_image TEXT,
  noindex BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Guides / articles (/guides/<slug>). Nothing is published until the owner writes and publishes it.
CREATE TABLE IF NOT EXISTS website_articles (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  cover_image TEXT,
  cover_alt TEXT,
  body TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  related_service_slug TEXT,
  seo_title TEXT,
  meta_description TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  published_at TIMESTAMPTZ,
  updated_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Permanent redirects for renamed public pages. Slug changes add rows here automatically.
CREATE TABLE IF NOT EXISTS website_redirects (
  id SERIAL PRIMARY KEY,
  from_path TEXT NOT NULL UNIQUE,
  to_path TEXT NOT NULL,
  note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  hits INTEGER NOT NULL DEFAULT 0,
  last_hit_at TIMESTAMPTZ,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (from_path <> to_path)
);

COMMIT;
