-- Correct verified customer-facing catalog facts and canonical handles while
-- preserving every previous public URL as a permanent alias.
UPDATE products
SET description = regexp_replace(
      description,
      '(<strong>Color:</strong>[[:space:]]*)Black',
      '\1Off-white',
      'gi'
    ),
    product_page = CASE
      WHEN product_page IS NULL THEN product_page
      ELSE jsonb_set(
        product_page,
        '{intro}',
        to_jsonb(regexp_replace(
          COALESCE(product_page->>'intro', ''),
          '(<strong>Color:</strong>[[:space:]]*)Black',
          '\1Off-white',
          'gi'
        )),
        true
      )
    END,
    updated_at = now()
WHERE name ILIKE 'CURIOSITY OFFWHITE%';

UPDATE products
SET description = regexp_replace(
      regexp_replace(
        regexp_replace(
          description,
          'MANDALA WHITE V1',
          'MANDALA BLACK V1',
          'gi'
        ),
        'versatile white color',
        'versatile black color',
        'gi'
      ),
      '(<strong>Color:</strong>[[:space:]]*)White',
      '\1Black',
      'gi'
    ),
    product_page = CASE
      WHEN product_page IS NULL THEN product_page
      ELSE jsonb_set(
        product_page,
        '{intro}',
        to_jsonb(regexp_replace(
          regexp_replace(
            regexp_replace(
              COALESCE(product_page->>'intro', ''),
              'MANDALA WHITE V1',
              'MANDALA BLACK V1',
              'gi'
            ),
            'versatile white color',
            'versatile black color',
            'gi'
          ),
          '(<strong>Color:</strong>[[:space:]]*)White',
          '\1Black',
          'gi'
        )),
        true
      )
    END,
    updated_at = now()
WHERE name = 'MANDALA BLACK V1 — Premium Oversized 240 GSM Cotton T-Shirt';

DO $migration$
DECLARE
  correction record;
  current_product record;
  conflicting_slug text;
BEGIN
  FOR correction IN
    SELECT * FROM (VALUES
      ('DARUMA OFFWHITE — Premium Oversized 240 GSM Cotton T-Shirt', 'daruma-offwhite-premium-oversized-240-gsm-cotton-t-shirt'),
      ('MANDALA BLACK V1 — Premium Oversized 240 GSM Cotton T-Shirt', 'mandala-black-v1-premium-oversized-240-gsm-cotton-t-shirt'),
      ('MARIACLARA ROCKSTAR — Premium Regular Fit 240 GSM Cotton T-Shirt', 'mariaclara-rockstar-premium-regular-fit-240-gsm-cotton-t-shirt'),
      ('WANNA GRAY — Premium Regular Fit 240 GSM Cotton T-Shirt', 'wanna-gray-premium-regular-fit-240-gsm-cotton-t-shirt')
    ) AS values_to_apply(product_name, new_handle)
  LOOP
    SELECT slug, public_handle
    INTO current_product
    FROM products
    WHERE name = correction.product_name;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF current_product.public_handle = correction.new_handle THEN
      CONTINUE;
    END IF;

    SELECT slug
    INTO conflicting_slug
    FROM products
    WHERE lower(public_handle) = correction.new_handle
      AND slug <> current_product.slug;
    IF FOUND THEN
      RAISE EXCEPTION 'Public handle % is already owned by product %', correction.new_handle, conflicting_slug;
    END IF;

    SELECT product_slug
    INTO conflicting_slug
    FROM product_url_aliases
    WHERE alias = correction.new_handle
      AND product_slug <> current_product.slug;
    IF FOUND THEN
      RAISE EXCEPTION 'Public handle % is already an alias for product %', correction.new_handle, conflicting_slug;
    END IF;

    INSERT INTO product_url_aliases (alias, product_slug)
    VALUES (lower(current_product.public_handle), current_product.slug)
    ON CONFLICT (alias) DO NOTHING;

    DELETE FROM product_url_aliases
    WHERE alias = correction.new_handle
      AND product_slug = current_product.slug;

    UPDATE products
    SET public_handle = correction.new_handle,
        seo = jsonb_set(COALESCE(seo, '{}'::jsonb), '{handle}', to_jsonb(correction.new_handle::text), true),
        updated_at = now()
    WHERE slug = current_product.slug;
  END LOOP;
END
$migration$;
