ALTER TABLE products ADD COLUMN IF NOT EXISTS public_handle text;

CREATE TABLE IF NOT EXISTS product_url_aliases (
  alias text PRIMARY KEY,
  product_slug text NOT NULL REFERENCES products(slug) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (alias = lower(alias))
);

DO $$
DECLARE
  product_record record;
  base_handle text;
  candidate_handle text;
  suffix integer;
BEGIN
  FOR product_record IN
    SELECT slug, name
    FROM products
    WHERE public_handle IS NULL OR trim(public_handle) = ''
    ORDER BY created_at, slug
  LOOP
    base_handle := trim(both '-' from regexp_replace(lower(product_record.name), '[^a-z0-9]+', '-', 'g'));
    IF base_handle = '' THEN
      base_handle := product_record.slug;
    END IF;

    candidate_handle := base_handle;
    suffix := 2;
    WHILE EXISTS (
      SELECT 1
      FROM products
      WHERE (
        lower(slug) = candidate_handle
        OR lower(COALESCE(public_handle, '')) = candidate_handle
      )
      AND slug <> product_record.slug
    ) LOOP
      candidate_handle := base_handle || '-' || suffix;
      suffix := suffix + 1;
    END LOOP;

    UPDATE products
    SET public_handle = candidate_handle
    WHERE slug = product_record.slug;
  END LOOP;
END $$;

UPDATE products SET public_handle = lower(trim(public_handle));

CREATE UNIQUE INDEX IF NOT EXISTS products_public_handle_lower_idx
  ON products (lower(public_handle));

ALTER TABLE products ALTER COLUMN public_handle SET NOT NULL;

INSERT INTO product_url_aliases (alias, product_slug)
SELECT lower(slug), slug
FROM products
WHERE lower(slug) <> lower(public_handle)
ON CONFLICT (alias) DO NOTHING;

CREATE INDEX IF NOT EXISTS product_url_aliases_product_slug_idx
  ON product_url_aliases(product_slug);
