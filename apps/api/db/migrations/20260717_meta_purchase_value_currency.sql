ALTER TABLE orders ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'PHP';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS meta_purchase_value numeric(14,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS meta_purchase_currency text NOT NULL DEFAULT 'PHP';

UPDATE orders
SET currency = 'PHP'
WHERE currency IS DISTINCT FROM 'PHP';

UPDATE orders
SET meta_purchase_currency = 'PHP'
WHERE meta_purchase_currency IS DISTINCT FROM 'PHP';

UPDATE orders
SET meta_purchase_value = ROUND(total_cents::numeric / 100, 2)
WHERE meta_purchase_value IS NULL
  AND total_cents > 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_currency_php_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_currency_php_check CHECK (currency = 'PHP');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_meta_purchase_currency_php_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_meta_purchase_currency_php_check CHECK (meta_purchase_currency = 'PHP');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_meta_purchase_value_positive_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_meta_purchase_value_positive_check
      CHECK (meta_purchase_value IS NULL OR meta_purchase_value > 0);
  END IF;
END $$;
