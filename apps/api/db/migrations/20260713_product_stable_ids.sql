ALTER TABLE products ADD COLUMN IF NOT EXISTS product_id text;

UPDATE products
SET product_id = 'prod_' || substr(md5(slug), 1, 20)
WHERE product_id IS NULL OR product_id = '';

ALTER TABLE products ALTER COLUMN product_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS products_product_id_idx
  ON products(product_id);
