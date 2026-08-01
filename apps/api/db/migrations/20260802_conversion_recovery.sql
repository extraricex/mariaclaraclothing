-- Conversion recovery: make checkout and catalog claims match the live COD-only
-- storefront, restore honest review collection, and correct verified product facts.

WITH normalized_methods AS (
  SELECT settings.key,
         jsonb_agg(
           jsonb_set(
             method.value,
             '{enabled}',
             to_jsonb((method.value->>'id') = 'cash_on_delivery'),
             true
           )
           ORDER BY method.ordinality
         ) AS methods
  FROM store_settings AS settings
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(settings.value#>'{payments,methods}', '[]'::jsonb))
    WITH ORDINALITY AS method(value, ordinality)
  WHERE settings.key = 'storeSettings'
  GROUP BY settings.key
)
UPDATE store_settings AS settings
SET value = jsonb_set(settings.value, '{payments,methods}', normalized_methods.methods, true),
    updated_at = now()
FROM normalized_methods
WHERE settings.key = normalized_methods.key;

UPDATE store_settings
SET value = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(value, '{reviews,enabled}', 'true'::jsonb, true),
          '{reviews,showOnProductPages}', 'true'::jsonb, true
        ),
        '{reviews,showRatingsOnProductCards}', 'false'::jsonb, true
      ),
      '{reviews,allowCustomerSubmissions}', 'true'::jsonb, true
    ),
    updated_at = now()
WHERE key = 'storeSettings';

WITH filtered_faq AS (
  SELECT settings.key,
         COALESCE(jsonb_agg(entry.value ORDER BY entry.ordinality)
           FILTER (WHERE lower(COALESCE(entry.value->>'heading', '')) NOT LIKE '%online payment%'), '[]'::jsonb) AS entries
  FROM store_settings AS settings
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(settings.value#>'{website,infoPages,faq}', '[]'::jsonb))
    WITH ORDINALITY AS entry(value, ordinality)
  WHERE settings.key = 'storeSettings'
  GROUP BY settings.key
)
UPDATE store_settings AS settings
SET value = jsonb_set(settings.value, '{website,infoPages,faq}', filtered_faq.entries, true),
    updated_at = now()
FROM filtered_faq
WHERE settings.key = filtered_faq.key;

WITH cod_terms AS (
  SELECT settings.key,
         jsonb_agg(
           CASE
             WHEN lower(COALESCE(entry.value->>'heading', '')) = 'orders'
               THEN jsonb_set(
                 entry.value,
                 '{body}',
                 to_jsonb('All storefront orders use Cash on Delivery. No advance payment is required. Orders are reviewed before fulfillment, and we may contact you by text or phone or hold or cancel orders with invalid or unreachable contact details.'::text),
                 true
               )
             ELSE entry.value
           END
           ORDER BY entry.ordinality
         ) AS entries
  FROM store_settings AS settings
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(settings.value#>'{website,infoPages,terms}', '[]'::jsonb))
    WITH ORDINALITY AS entry(value, ordinality)
  WHERE settings.key = 'storeSettings'
  GROUP BY settings.key
)
UPDATE store_settings AS settings
SET value = jsonb_set(settings.value, '{website,infoPages,terms}', cod_terms.entries, true),
    updated_at = now()
FROM cod_terms
WHERE settings.key = cod_terms.key;

UPDATE products
SET reviews_enabled = true,
    updated_at = now()
WHERE status = 'active' AND reviews_enabled = false;

UPDATE products
SET seo = COALESCE(seo, '{}'::jsonb) || jsonb_build_object(
      'title', 'DARUMA OFFWHITE — Oversized 240 GSM Shirt',
      'description', 'Shop the DARUMA OFFWHITE premium oversized 240 GSM cotton shirt from Maria Clara Clothing, with Cash on Delivery and nationwide shipping.'
    ),
    updated_at = now()
WHERE name = 'DARUMA OFFWHITE — Premium Oversized 240 GSM Cotton T-Shirt';

UPDATE products
SET seo = COALESCE(seo, '{}'::jsonb) || jsonb_build_object(
      'title', 'MANDALA BLACK V1 — Oversized 240 GSM Shirt',
      'description', 'Shop the MANDALA BLACK V1 premium oversized 240 GSM cotton shirt from Maria Clara Clothing, with Cash on Delivery and nationwide shipping.'
    ),
    updated_at = now()
WHERE name = 'MANDALA BLACK V1 — Premium Oversized 240 GSM Cotton T-Shirt';

UPDATE products
SET description = replace(description, 'versatile gray color', 'bold red color'),
    product_page = replace(COALESCE(product_page, '{}'::jsonb)::text, 'versatile gray color', 'bold red color')::jsonb,
    seo = COALESCE(seo, '{}'::jsonb) || jsonb_build_object(
      'title', 'MARIACLARA ROCKSTAR — Regular Fit 240 GSM Shirt',
      'description', 'Shop the red MARIACLARA ROCKSTAR premium regular-fit 240 GSM cotton shirt, with Cash on Delivery and nationwide shipping.'
    ),
    updated_at = now()
WHERE name = 'MARIACLARA ROCKSTAR — Premium Regular Fit 240 GSM Cotton T-Shirt';

UPDATE products
SET seo = COALESCE(seo, '{}'::jsonb) || jsonb_build_object(
      'title', 'WANNA GRAY — Regular Fit 240 GSM Shirt',
      'description', 'Shop the WANNA GRAY premium regular-fit 240 GSM cotton shirt from Maria Clara Clothing, with Cash on Delivery and nationwide shipping.'
    ),
    updated_at = now()
WHERE name = 'WANNA GRAY — Premium Regular Fit 240 GSM Cotton T-Shirt';

UPDATE product_images AS image
SET alt_text = product.name || ' — product photo ' || (image.sort_order + 1)
FROM products AS product
WHERE image.product_slug = product.slug
  AND product.name IN (
    'DARUMA OFFWHITE — Premium Oversized 240 GSM Cotton T-Shirt',
    'MANDALA BLACK V1 — Premium Oversized 240 GSM Cotton T-Shirt',
    'MARIACLARA ROCKSTAR — Premium Regular Fit 240 GSM Cotton T-Shirt',
    'WANNA GRAY — Premium Regular Fit 240 GSM Cotton T-Shirt'
  );

UPDATE products
SET description = replace(replace(description, 'Available sizes: Small to 3XL', 'Available sizes: Small to 2XL'), 'Cash on Delivery and online payment', 'Cash on Delivery'),
    product_page = replace(
      replace(COALESCE(product_page, '{}'::jsonb)::text, 'Available sizes: Small to 3XL', 'Available sizes: Small to 2XL'),
      'Cash on Delivery and online payment',
      'Cash on Delivery'
    )::jsonb,
    updated_at = now()
WHERE name IN (
  'DARUMA OFFWHITE — Premium Oversized 240 GSM Cotton T-Shirt',
  'HAWAK WHITE — Premium Oversized 240 GSM Cotton T-Shirt',
  'IMPERIAL CHOCO TEE — Premium Oversized 240 GSM Cotton T-Shirt',
  'MANDALA BLACK V1 — Premium Oversized 240 GSM Cotton T-Shirt',
  'MANDALA WHITE V1 — Premium Oversized 240 GSM Cotton T-Shirt',
  'INFINITE POSSIBILITIES BLACK — Premium Crop Box 240 GSM Cotton T-Shirt'
);

UPDATE products
SET description = replace(
      replace(
        replace(description,
          'Metro Manila: Delivered within 2–3 days',
          'Metro Manila and Cavite: Delivered within 2–4 days'
        ),
        'Outside Metro Manila / Luzon: Delivered within 3–5 days',
        'Other Luzon provinces: Delivered within 3–6 days'
      ),
      'Visayas and Mindanao: Delivered within 6–8 days',
      'Visayas and Mindanao: Delivered within 5–8 days'
    ),
    product_page = replace(
      replace(
        replace(COALESCE(product_page, '{}'::jsonb)::text,
          'Metro Manila: Delivered within 2–3 days',
          'Metro Manila and Cavite: Delivered within 2–4 days'
        ),
        'Outside Metro Manila / Luzon: Delivered within 3–5 days',
        'Other Luzon provinces: Delivered within 3–6 days'
      ),
      'Visayas and Mindanao: Delivered within 6–8 days',
      'Visayas and Mindanao: Delivered within 5–8 days'
    )::jsonb,
    updated_at = now()
WHERE product_page IS NOT NULL;
