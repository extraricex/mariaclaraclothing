-- Replace only the known legacy campaign originals with visually equivalent,
-- bounded assets. Admin-uploaded/custom media is intentionally untouched.
UPDATE store_settings
SET value = replace(
              replace(
                replace(value::text,
                  '"/brand/hero1v2.jpg"',
                  '"/brand/hero1v2-2400.webp"'),
                '"/brand/hero1v2-web.jpg"',
                '"/brand/hero1v2-2400.webp"'),
              '"/brand/hero2-web.jpg"',
              '"/brand/hero2-2200.webp"')::jsonb,
    updated_at = now()
WHERE key = 'siteContent'
  AND (
    value::text LIKE '%"/brand/hero1v2.jpg"%'
    OR value::text LIKE '%"/brand/hero1v2-web.jpg"%'
    OR value::text LIKE '%"/brand/hero2-web.jpg"%'
  );
