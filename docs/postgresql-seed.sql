-- Seed data for Salon POS (PostgreSQL)
-- Run once on a fresh database after applying postgresql-schema.sql.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Service categories
INSERT INTO salon_service_categories (name, display_order)
VALUES
  ('Haircut', 1),
  ('Hair Color', 2),
  ('Facial', 3),
  ('Beard', 4),
  ('Treatment', 5),
  ('Makeup', 6),
  ('Spa', 7),
  ('Other', 8)
ON CONFLICT (name) DO NOTHING;

-- Launch services and packages
INSERT INTO salon_services (name, category, price, duration_minutes, description, is_package, package_items, is_active)
VALUES
  ('Hair Cut', 'Haircut', 150, 30, 'Client rate card service', FALSE, NULL, TRUE),
  ('Hair Wash', 'Treatment', 50, 15, 'Client rate card service', FALSE, NULL, TRUE),
  ('Shaving', 'Beard', 100, 20, 'Client rate card service', FALSE, NULL, TRUE),
  ('Head Massage', 'Spa', 200, 20, 'Client rate card service', FALSE, NULL, TRUE),
  ('Threading', 'Facial', 50, 15, 'Client rate card service', FALSE, NULL, TRUE),
  ('Normal Cleansing', 'Facial', 500, 35, 'Client rate card service', FALSE, NULL, TRUE),
  ('Deep Cleansing', 'Facial', 800, 45, 'Client rate card service', FALSE, NULL, TRUE),
  ('Wine Facial', 'Facial', 1200, 60, 'Client rate card service', FALSE, NULL, TRUE),
  ('Fruit Facial', 'Facial', 1500, 60, 'Client rate card service', FALSE, NULL, TRUE),
  ('Lotus Facial', 'Facial', 1800, 60, 'Client rate card service', FALSE, NULL, TRUE),
  ('Hair Colouring', 'Hair Color', 500, 75, 'Starting from NPR 500+', FALSE, NULL, TRUE),
  ('Cap Highlight', 'Hair Color', 1000, 90, 'Starting from NPR 1000+', FALSE, NULL, TRUE),
  ('Hair Straight', 'Treatment', 1200, 90, 'Starting from NPR 1200+', FALSE, NULL, TRUE),
  ('Keratin', 'Treatment', 1500, 120, 'Starting from NPR 1500+', FALSE, NULL, TRUE),
  ('Piece Highlight', 'Hair Color', 200, 20, 'NPR 200 per piece', FALSE, NULL, TRUE),
  ('Silver Package', 'Other', 650, 80, 'Includes Hair Cut, Hair Wash, Shaving, Normal Cleansing', TRUE, 'Hair Cut,Hair Wash,Shaving,Normal Cleansing', TRUE),
  ('Gold Package', 'Other', 850, 90, 'Includes Hair Cut, Hair Wash, Shaving, Deep Cleansing', TRUE, 'Hair Cut,Hair Wash,Shaving,Deep Cleansing', TRUE),
  ('Platinum Package', 'Other', 1450, 120, 'Includes Hair Cut, Hair Wash, Shaving, Head Massage, Facial', TRUE, 'Hair Cut,Hair Wash,Shaving,Head Massage,Facial', TRUE);

-- Inventory products
INSERT INTO salon_products (name, category, purchase_price, selling_price, current_stock, low_stock_threshold, supplier, status)
VALUES
  ('Keratin Shampoo', 'Shampoo', 450, 750, 18, 5, 'Salon Supplier', 'active'),
  ('Hair Color Tube', 'Hair Color', 300, 550, 24, 8, 'Color Pro', 'active'),
  ('Facial Kit', 'Facial Kit', 900, 1400, 8, 3, 'Beauty Care', 'active'),
  ('Hair Wax', 'Styling', 220, 400, 15, 5, 'Style Hub', 'active');

-- Demo staff/users with PINs (bcrypt via pgcrypto)
WITH staff_seed (username, full_name, role, salon_role, pin, email, assigned_services, commission_percentage, base_salary) AS (
  VALUES
    ('admin', 'Admin', 'admin', 'admin', '1111', 'admin@thehaircut.local', '', 0, 0),
    ('kanchan', 'Kanchan', 'cashier', 'beautician', '2222', 'kanchan@thehaircut.local', 'Normal Cleansing,Deep Cleansing,Wine Facial,Fruit Facial,Lotus Facial,Threading', 10, 0),
    ('raashid', 'Raashid', 'barber', 'barber', '3333', 'raashid@thehaircut.local', 'Hair Cut,Hair Wash,Shaving,Head Massage,Threading', 10, 0),
    ('salman', 'Salman', 'barber', 'barber', '4444', 'salman@thehaircut.local', 'Hair Cut,Hair Wash,Shaving,Head Massage,Threading', 10, 0),
    ('saajid', 'Saajid', 'barber', 'barber', '5555', 'saajid@thehaircut.local', 'Hair Cut,Hair Wash,Shaving,Head Massage,Threading', 10, 0)
),
upsert_users AS (
  INSERT INTO users (username, full_name, role, password_hash, email, phone, is_active)
  SELECT
    username,
    full_name,
    role,
    crypt(pin, gen_salt('bf')),
    email,
    '',
    TRUE
  FROM staff_seed
  ON CONFLICT (username) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    password_hash = EXCLUDED.password_hash,
    email = EXCLUDED.email,
    is_active = TRUE,
    updated_at = NOW()
  RETURNING id, username
)
INSERT INTO staff_profiles (user_id, display_name, salon_role, assigned_services, commission_percentage, base_salary)
SELECT
  u.id,
  s.full_name,
  s.salon_role,
  s.assigned_services,
  s.commission_percentage,
  s.base_salary
FROM upsert_users u
JOIN staff_seed s USING (username)
ON CONFLICT (user_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  salon_role = EXCLUDED.salon_role,
  assigned_services = EXCLUDED.assigned_services,
  commission_percentage = EXCLUDED.commission_percentage,
  base_salary = EXCLUDED.base_salary,
  updated_at = NOW();

-- Website CMS content
INSERT INTO website_content (
  section_key, title, subtitle, description, image_url, button_text,
  button_link, secondary_button_text, secondary_button_link, is_visible,
  sort_order, metadata
) VALUES
  (
    'hero',
    'The Hair Cut',
    'We''ll style, You''ll smile!',
    'The Hair Cut is a modern men''s salon in Birendranagar-7, Surkhet offering haircuts, shaving, hair color, hair spa, facials, and grooming packages.',
    '/assets/hair_dressing_space1.jpg',
    'Book Appointment',
    '/book-appointment',
    'WhatsApp',
    'whatsapp',
    TRUE,
    1,
    '{"eyebrow": "Salon experience"}'
  ),
  (
    'about',
    'A Surkhet grooming space built for everyday confidence',
    'About',
    'Our salon combines practical grooming, beauty care, and a clean professional setting.',
    '/assets/Salon_outside.jpg',
    '',
    '',
    '',
    '',
    TRUE,
    2,
    '{"highlights": ["Premium finish", "Friendly staff", "Clear packages"], "galleryImages": ["/assets/Salon_Banner.jpeg", "/assets/Details.jpeg"]}'
  ),
  (
    'services',
    'Popular services',
    'Services',
    'Fast, clear pricing for daily grooming and beauty care.',
    '/assets/Haircut1.jpg',
    '',
    '',
    '',
    '',
    TRUE,
    3,
    '{}'
  ),
  (
    'packages',
    'Men''s packages',
    'Packages',
    'Grouped services for fast booking and clean billing.',
    '',
    '',
    '',
    '',
    '',
    TRUE,
    4,
    '{}'
  ),
  (
    'staff',
    'Meet the staff',
    'Team',
    'Experienced staff for barbering, hair dressing, beauty care, and reception.',
    '',
    '',
    '',
    '',
    '',
    TRUE,
    5,
    '{}'
  ),
  (
    'contact',
    'Location and contact',
    'Visit us',
    'Reach the salon or request an appointment through WhatsApp.',
    '',
    'Contact details',
    '/contact',
    'Book now',
    '/book-appointment',
    TRUE,
    6,
    '{"salonName": "The Hair Cut", "phone": "+977 9858051694", "whatsappNumber": "9779858051694", "address": "Birendranagar-7, Surkhet", "email": "", "facebook": "https://www.facebook.com/profile.php?id=61563439747795", "tiktok": "https://www.tiktok.com/@the.haircut1?_r=1&_t=ZS-96n9lkFroZA", "openingHours": "Opening hours: update with final salon schedule", "mapEmbedUrl": "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d4533.836830090373!2d81.6257918!3d28.5996354!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x39a2850030b92a09%3A0xa0f6893a8b7d98f4!2sThe%20Hair%20Cut!5e1!3m2!1sen!2snp!4v1780240711625!5m2!1sen!2snp"}'
  ),
  (
    'seo',
    'The Hair Cut | Men''s Salon in Birendranagar, Surkhet',
    '',
    'The Hair Cut is a modern men''s salon in Birendranagar-7, Surkhet offering haircuts, shaving, hair color, hair spa, facials, and grooming packages.',
    '/assets/Salon_Banner.jpeg',
    '',
    '',
    '',
    '',
    TRUE,
    7,
    '{"ogTitle": "The Hair Cut | Men''s Salon in Birendranagar, Surkhet", "ogDescription": "The Hair Cut is a modern men''s salon in Birendranagar-7, Surkhet offering haircuts, shaving, hair color, hair spa, facials, and grooming packages.", "keywords": "salon, haircut, barber, surkhet, facial, shaving"}'
  );

-- Gallery images
INSERT INTO website_gallery_images (image_url, title, alt_text, category, description, sort_order, is_visible)
VALUES
  ('/assets/hair_dressing_space1.jpg', 'Hair Dressing Space 1', 'Salon hair dressing area.', 'Salon', 'Salon hair dressing area.', 1, TRUE),
  ('/assets/hair_dressing_space2.jpg', 'Hair Dressing Space 2', 'Clean grooming workspace.', 'Salon', 'Clean grooming workspace.', 2, TRUE),
  ('/assets/hair_dressing_space3.jpg', 'Hair Dressing Space 3', 'Salon styling area.', 'Salon', 'Salon styling area.', 3, TRUE),
  ('/assets/hair_dressing_space4.jpg', 'Hair Dressing Space 4', 'Comfortable service station.', 'Salon', 'Comfortable service station.', 4, TRUE),
  ('/assets/Haircut1.jpg', 'Haircut 1', 'Haircut service moment.', 'Services', 'Haircut service moment.', 5, TRUE),
  ('/assets/Haircut2.jpg', 'Haircut 2', 'Salon haircut service.', 'Services', 'Salon haircut service.', 6, TRUE),
  ('/assets/Haircut3.jpg', 'Haircut 3', 'Finished haircut style.', 'Services', 'Finished haircut style.', 7, TRUE),
  ('/assets/Hairwash.jpg', 'Hair Wash', 'Hair wash service.', 'Services', 'Hair wash service.', 8, TRUE),
  ('/assets/Happy_customers.jpg', 'Happy Customers', 'Customers enjoying the salon experience.', 'Customers', 'Customers enjoying the salon experience.', 9, TRUE),
  ('/assets/Love_of_peoples.jpg', 'Love of Peoples', 'Community support and customer love.', 'Customers', 'Community support and customer love.', 10, TRUE),
  ('/assets/Opening_moments.jpg', 'Opening Moments', 'Salon opening celebration.', 'Opening', 'Salon opening celebration.', 11, TRUE),
  ('/assets/Opening_moments1.jpg', 'Opening Moments 1', 'Opening day memories.', 'Opening', 'Opening day memories.', 12, TRUE),
  ('/assets/Opening_moments2.jpg', 'Opening Moments 2', 'Salon launch moments.', 'Opening', 'Salon launch moments.', 13, TRUE),
  ('/assets/Salon_opening.jpg', 'Salon Opening', 'The Hair Cut opening event.', 'Opening', 'The Hair Cut opening event.', 14, TRUE),
  ('/assets/Salon_outside.jpg', 'Salon Outside', 'Outside view of the salon.', 'Salon', 'Outside view of the salon.', 15, TRUE),
  ('/assets/shaving.jpg', 'Shaving', 'Shaving and grooming service.', 'Services', 'Shaving and grooming service.', 16, TRUE),
  ('/assets/Uv_sanitizations.jpg', 'UV Sanitizations', 'Clean and hygienic tools.', 'Hygiene', 'Clean and hygienic tools.', 17, TRUE);

-- System settings defaults
INSERT INTO system_settings (setting_key, setting_value)
VALUES
  ('vat_percentage', '13'),
  ('service_charge_percentage', '10'),
  ('salon_name', 'The Hair Cut'),
  ('salon_address', 'Birendranagar-7, Surkhet'),
  ('salon_phone', '+977 9858051694'),
  ('salon_email', ''),
  ('owner_name', ''),
  ('vat_number', ''),
  ('pan_number', ''),
  ('currency_symbol', 'Rs'),
  ('bank_qr_image', ''),
  ('esewa_qr_image', '')
ON CONFLICT (setting_key) DO UPDATE SET
  setting_value = EXCLUDED.setting_value,
  updated_at = NOW();

-- Default website titles/bios
UPDATE staff_profiles
SET website_title = CASE
      WHEN website_title IS NOT NULL AND website_title <> '' THEN website_title
      WHEN salon_role = 'barber' THEN 'Barber / Hair Dresser'
      WHEN salon_role = 'beautician' THEN 'Beautician / Cashier'
      ELSE display_name
    END,
    website_bio = COALESCE(NULLIF(website_bio, ''), assigned_services),
    updated_at = NOW();

COMMIT;
