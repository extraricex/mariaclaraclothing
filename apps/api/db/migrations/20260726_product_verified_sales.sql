ALTER TABLE products
  ADD COLUMN IF NOT EXISTS commerce_stats jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS historical_sold_quantity integer NOT NULL DEFAULT 0;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS historical_sold_source text NOT NULL DEFAULT '';

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS historical_sold_note text NOT NULL DEFAULT '';

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS historical_sold_updated_by text NOT NULL DEFAULT '';

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS historical_sold_updated_at timestamptz;

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_historical_sold_quantity_non_negative;

ALTER TABLE products
  ADD CONSTRAINT products_historical_sold_quantity_non_negative
  CHECK (historical_sold_quantity >= 0);
