CREATE TABLE IF NOT EXISTS products (
  slug text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  collections jsonb NOT NULL DEFAULT '[]'::jsonb,
  price_cents integer NOT NULL CHECK (price_cents > 0),
  compare_at_price_cents integer CHECK (compare_at_price_cents IS NULL OR compare_at_price_cents > 0),
  merchandising_status text NOT NULL DEFAULT 'sale',
  status text NOT NULL DEFAULT 'active',
  featured boolean NOT NULL DEFAULT false,
  category text NOT NULL DEFAULT 'T-Shirts',
  product_type text NOT NULL DEFAULT 'Tshirt',
  vendor text NOT NULL DEFAULT 'Maria Clara',
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  seo jsonb NOT NULL DEFAULT '{}'::jsonb,
  metafields jsonb NOT NULL DEFAULT '{}'::jsonb,
  theme_template text NOT NULL DEFAULT 'Default product',
  product_page jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'T-Shirts';
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type text NOT NULL DEFAULT 'Tshirt';
ALTER TABLE products ADD COLUMN IF NOT EXISTS vendor text NOT NULL DEFAULT 'Maria Clara';
ALTER TABLE products ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS seo jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS metafields jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS theme_template text NOT NULL DEFAULT 'Default product';

CREATE TABLE IF NOT EXISTS product_images (
  id bigserial PRIMARY KEY,
  product_slug text NOT NULL REFERENCES products(slug) ON DELETE CASCADE,
  url text NOT NULL,
  alt_text text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS product_images_product_slug_idx ON product_images(product_slug);

CREATE TABLE IF NOT EXISTS product_variants (
  id bigserial PRIMARY KEY,
  product_slug text NOT NULL REFERENCES products(slug) ON DELETE CASCADE,
  size text NOT NULL,
  sku text NOT NULL,
  price_cents integer CHECK (price_cents IS NULL OR price_cents > 0),
  stock_quantity integer NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  external_pos_variant_id text NOT NULL DEFAULT ''
);

ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS price_cents integer CHECK (price_cents IS NULL OR price_cents > 0);

CREATE INDEX IF NOT EXISTS product_variants_product_slug_idx ON product_variants(product_slug);
CREATE UNIQUE INDEX IF NOT EXISTS product_variants_sku_idx ON product_variants(sku);

CREATE TABLE IF NOT EXISTS orders (
  order_number text PRIMARY KEY,
  customer jsonb NOT NULL,
  address jsonb NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal_cents integer NOT NULL DEFAULT 0,
  discount_total_cents integer NOT NULL DEFAULT 0,
  shipping_fee_cents integer NOT NULL DEFAULT 0,
  shipping_region text NOT NULL DEFAULT '',
  shipping_region_label text NOT NULL DEFAULT '',
  free_shipping_unlocked boolean NOT NULL DEFAULT false,
  total_cents integer NOT NULL DEFAULT 0,
  cart_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  checkout_channel text NOT NULL DEFAULT 'storefront_checkout',
  payment_method text NOT NULL DEFAULT 'cash_on_delivery',
  channel text NOT NULL DEFAULT 'Online Store',
  status text NOT NULL DEFAULT 'received',
  fulfillment_status text NOT NULL DEFAULT 'unfulfilled',
  payment_status text NOT NULL DEFAULT 'cod_pending',
  cod_confirmation_status text NOT NULL DEFAULT 'pending',
  delivery_status text NOT NULL DEFAULT 'pending',
  delivery_method text NOT NULL DEFAULT 'Standard shipping',
  tracking_number text NOT NULL DEFAULT '',
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text NOT NULL DEFAULT '',
  exported_to_jnt boolean NOT NULL DEFAULT false,
  jnt_exported_at timestamptz,
  admin_editable_totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  placed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS exported_to_jnt boolean NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS jnt_exported_at timestamptz;

CREATE INDEX IF NOT EXISTS orders_placed_at_idx ON orders(placed_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_code text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS discount_codes (
  code text PRIMARY KEY,
  type text NOT NULL DEFAULT 'percentage',
  value integer NOT NULL CHECK (value >= 0),
  status text NOT NULL DEFAULT 'active',
  ends_at timestamptz,
  usage_limit integer,
  usage_count integer NOT NULL DEFAULT 0,
  minimum_subtotal_cents integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
