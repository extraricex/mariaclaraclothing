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
ALTER TABLE products ADD COLUMN IF NOT EXISTS parcel_weight_grams integer NOT NULL DEFAULT 250;

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
ALTER TABLE orders ADD COLUMN IF NOT EXISTS parcel_weight_grams integer NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS parcel_weight_override_grams integer;

CREATE INDEX IF NOT EXISTS orders_placed_at_idx ON orders(placed_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_code text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS order_status_events (
  id text PRIMARY KEY,
  order_number text NOT NULL REFERENCES orders(order_number) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'admin',
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_status_events_order_number_idx ON order_status_events(order_number, created_at DESC);

CREATE TABLE IF NOT EXISTS order_tracking_notifications (
  id text PRIMARY KEY,
  order_number text NOT NULL REFERENCES orders(order_number) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'sms',
  status text NOT NULL DEFAULT 'recorded',
  source text NOT NULL DEFAULT 'admin',
  recipient text NOT NULL DEFAULT '',
  tracking_number text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_tracking_notifications_order_number_idx ON order_tracking_notifications(order_number, created_at DESC);

CREATE TABLE IF NOT EXISTS order_notification_outbox (
  id text PRIMARY KEY,
  order_number text NOT NULL REFERENCES orders(order_number) ON DELETE CASCADE,
  event_name text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('sms', 'email')),
  recipient text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  sent_at timestamptz,
  provider_message_id text NOT NULL DEFAULT '',
  last_error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_number, event_name, channel)
);

CREATE INDEX IF NOT EXISTS order_notification_outbox_due_idx ON order_notification_outbox(status, next_attempt_at);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id text PRIMARY KEY,
  order_number text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'order',
  reason text NOT NULL DEFAULT 'order_created',
  product_slug text NOT NULL DEFAULT '',
  product_name text NOT NULL DEFAULT '',
  sku text NOT NULL DEFAULT '',
  size text NOT NULL DEFAULT '',
  quantity_change integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_movements_order_number_idx ON inventory_movements(order_number, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_movements_sku_idx ON inventory_movements(sku, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_movements_created_at_idx ON inventory_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_movements_reason_created_at_idx ON inventory_movements(reason, created_at DESC);

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

ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_account_id text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS customer_accounts (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  password_salt text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  saved_address jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS store_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '';
ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS method text NOT NULL DEFAULT 'code';
ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS starts_at timestamptz;
ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS minimum_quantity integer;
ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;
ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS banner_text text NOT NULL DEFAULT '';
ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS terms text NOT NULL DEFAULT '';
ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS rules jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS cart_sessions (
  session_id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'draft',
  customer jsonb NOT NULL DEFAULT '{}'::jsonb,
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  item_count integer NOT NULL DEFAULT 0,
  subtotal_cents integer NOT NULL DEFAULT 0,
  checkout_started_at timestamptz,
  converted_order_number text NOT NULL DEFAULT '',
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cart_sessions_status_idx ON cart_sessions(status);
CREATE INDEX IF NOT EXISTS cart_sessions_last_activity_idx ON cart_sessions(last_activity_at DESC);

CREATE TABLE IF NOT EXISTS checkout_quotes (
  id text PRIMARY KEY,
  cart_session_id text NOT NULL,
  request_hash text NOT NULL,
  snapshot jsonb NOT NULL,
  finalizable boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  consumed_order_number text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS checkout_quotes_expiry_idx ON checkout_quotes(expires_at);
CREATE INDEX IF NOT EXISTS checkout_quotes_cart_idx ON checkout_quotes(cart_session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS checkout_idempotency (
  key_hash text PRIMARY KEY,
  request_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('in_progress', 'completed')),
  order_number text NOT NULL DEFAULT '',
  response jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS checkout_idempotency_expiry_idx ON checkout_idempotency(expires_at);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_token_hash text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_token_created_at timestamptz;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_idempotency_key text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS orders_checkout_idempotency_key_idx
  ON orders(checkout_idempotency_key) WHERE checkout_idempotency_key <> '';

CREATE TABLE IF NOT EXISTS marketing_event_outbox (
  id text PRIMARY KEY,
  provider text NOT NULL CHECK (provider = 'meta'),
  event_name text NOT NULL CHECK (event_name = 'Purchase'),
  event_id text NOT NULL UNIQUE,
  aggregate_id text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  sent_at timestamptz,
  provider_trace_id text NOT NULL DEFAULT '',
  last_error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_event_outbox_pending_idx
  ON marketing_event_outbox(status, next_attempt_at, created_at);
