-- The owner confirmed The Hair Cut is a UNISEX salon (Sept 2026). Update the original seeded
-- website wording — but only where it is still the exact old default text, so anything the owner
-- has since written in Website CMS is left untouched. Forward-only and idempotent.

BEGIN;

UPDATE website_content
SET
  title = REPLACE(title, 'The Hair Cut | Men''s Salon in Birendranagar, Surkhet', 'The Hair Cut | Unisex Salon in Birendranagar, Surkhet'),
  description = REPLACE(description,
    'The Hair Cut is a modern men''s salon in Birendranagar-7, Surkhet offering haircuts, shaving, hair color, hair spa, facials, and grooming packages.',
    'The Hair Cut is a unisex salon in Birendranagar-7, Surkhet offering haircuts, shaving, hair colour, keratin, facials and grooming packages.'),
  metadata = REPLACE(REPLACE(metadata,
    'The Hair Cut | Men''s Salon in Birendranagar, Surkhet', 'The Hair Cut | Unisex Salon in Birendranagar, Surkhet'),
    'The Hair Cut is a modern men''s salon in Birendranagar-7, Surkhet offering haircuts, shaving, hair color, hair spa, facials, and grooming packages.',
    'The Hair Cut is a unisex salon in Birendranagar-7, Surkhet offering haircuts, shaving, hair colour, keratin, facials and grooming packages.'),
  updated_at = NOW()
WHERE section_key IN ('hero', 'seo')
  AND (title LIKE '%Men''s Salon in Birendranagar%' OR description LIKE '%modern men''s salon in Birendranagar-7%' OR metadata LIKE '%men''s salon%' OR metadata LIKE '%Men''s Salon%');

COMMIT;
