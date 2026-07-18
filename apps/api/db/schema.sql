CREATE TABLE IF NOT EXISTS products (
  slug text PRIMARY KEY,
  product_id text,
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
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_id text;
UPDATE products SET product_id = 'prod_' || substr(md5(slug), 1, 20) WHERE product_id IS NULL OR product_id = '';
ALTER TABLE products ALTER COLUMN product_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS products_product_id_idx ON products(product_id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type text NOT NULL DEFAULT 'Tshirt';
ALTER TABLE products ADD COLUMN IF NOT EXISTS vendor text NOT NULL DEFAULT 'Maria Clara';
ALTER TABLE products ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS seo jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS metafields jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS theme_template text NOT NULL DEFAULT 'Default product';
ALTER TABLE products ADD COLUMN IF NOT EXISTS parcel_weight_grams integer NOT NULL DEFAULT 250;
ALTER TABLE products ADD COLUMN IF NOT EXISTS public_handle text;

CREATE UNIQUE INDEX IF NOT EXISTS products_public_handle_lower_idx
  ON products (lower(public_handle)) WHERE public_handle IS NOT NULL;

ALTER TABLE products ADD COLUMN IF NOT EXISTS reviews_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS show_rating_summary boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS product_url_aliases (
  alias text PRIMARY KEY,
  product_slug text NOT NULL REFERENCES products(slug) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (alias = lower(alias))
);

CREATE INDEX IF NOT EXISTS product_url_aliases_product_slug_idx
  ON product_url_aliases(product_slug);

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
  currency text NOT NULL DEFAULT 'PHP' CHECK (currency = 'PHP'),
  meta_purchase_value numeric(14,2) CHECK (meta_purchase_value IS NULL OR meta_purchase_value > 0),
  meta_purchase_currency text NOT NULL DEFAULT 'PHP' CHECK (meta_purchase_currency = 'PHP'),
  cart_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  checkout_channel text NOT NULL DEFAULT 'storefront_checkout',
  payment_method text NOT NULL DEFAULT 'cash_on_delivery',
  channel text NOT NULL DEFAULT 'Online Store',
  status text NOT NULL DEFAULT 'confirmed',
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
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'confirmed';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_provider text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS provider_checkout_session_id text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS provider_payment_id text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_amount_cents integer;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_expires_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS inventory_reservation_status text NOT NULL DEFAULT 'committed';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_email_sent_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_email_status text NOT NULL DEFAULT 'not_queued';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_email_error text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_reason text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_test_order boolean NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS meta_purchase_event_id text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS meta_purchase_tracking_version integer NOT NULL DEFAULT 1;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS meta_browser_purchase_claim_id text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS meta_browser_purchase_claimed_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS meta_browser_purchase_sent_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS meta_capi_purchase_queued_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS meta_capi_purchase_sent_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS meta_purchase_status text NOT NULL DEFAULT 'legacy';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS meta_purchase_last_error text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'PHP';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS meta_purchase_value numeric(14,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS meta_purchase_currency text NOT NULL DEFAULT 'PHP';

UPDATE orders
SET meta_purchase_event_id = 'purchase_' || order_number
WHERE meta_purchase_event_id = '';

CREATE UNIQUE INDEX IF NOT EXISTS orders_meta_purchase_event_id_idx
  ON orders(meta_purchase_event_id) WHERE meta_purchase_event_id <> '';
CREATE INDEX IF NOT EXISTS orders_meta_purchase_status_idx
  ON orders(meta_purchase_status, placed_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS orders_provider_checkout_session_idx
  ON orders(provider_checkout_session_id) WHERE provider_checkout_session_id<>'';

CREATE TABLE IF NOT EXISTS paymongo_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  order_number text NOT NULL DEFAULT '',
  payload_digest text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS paymongo_refunds (
  id text PRIMARY KEY,
  order_number text NOT NULL REFERENCES orders(order_number) ON DELETE CASCADE,
  paymongo_refund_id text NOT NULL DEFAULT '',
  payment_id text NOT NULL,
  request_key_hash text NOT NULL UNIQUE,
  provider_idempotency_key text NOT NULL UNIQUE,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'PHP',
  reason text NOT NULL CHECK (reason IN ('duplicate','fraudulent','others')),
  notes text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('requesting','pending','processing','succeeded','failed')),
  livemode boolean NOT NULL DEFAULT false,
  provider_created_at timestamptz,
  provider_updated_at timestamptz,
  last_error_code text NOT NULL DEFAULT '',
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  requested_by text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS paymongo_refunds_provider_id_idx
  ON paymongo_refunds(paymongo_refund_id) WHERE paymongo_refund_id <> '';
CREATE INDEX IF NOT EXISTS paymongo_refunds_order_idx
  ON paymongo_refunds(order_number, created_at DESC);
CREATE INDEX IF NOT EXISTS paymongo_refunds_status_idx
  ON paymongo_refunds(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS payment_operation_events (
  id text PRIMARY KEY,
  provider text NOT NULL DEFAULT 'paymongo',
  event_type text NOT NULL,
  level text NOT NULL CHECK (level IN ('info','warning','error')),
  order_number text NOT NULL DEFAULT '',
  code text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_operation_events_created_idx
  ON payment_operation_events(created_at DESC);
CREATE INDEX IF NOT EXISTS payment_operation_events_order_idx
  ON payment_operation_events(order_number, created_at DESC);

CREATE INDEX IF NOT EXISTS orders_placed_at_idx ON orders(placed_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status);
CREATE INDEX IF NOT EXISTS orders_test_order_placed_idx ON orders(is_test_order, placed_at DESC);

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
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'retrying', 'sent', 'failed', 'skipped', 'cancelled')),
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  sent_at timestamptz,
  provider_message_id text NOT NULL DEFAULT '',
  last_error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_number, event_name, channel, recipient)
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
  password_hash text,
  password_salt text,
  full_name text NOT NULL DEFAULT '',
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  saved_address jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_auth_identities (
  id text PRIMARY KEY,
  customer_account_id text NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google', 'facebook')),
  provider_user_id text NOT NULL,
  provider_email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_user_id),
  UNIQUE (customer_account_id, provider)
);

CREATE INDEX IF NOT EXISTS customer_auth_identities_account_idx
  ON customer_auth_identities(customer_account_id);

CREATE TABLE IF NOT EXISTS customer_password_resets (
  id text PRIMARY KEY,
  customer_account_id text NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_password_resets_active_idx
  ON customer_password_resets(customer_account_id, expires_at DESC) WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash text PRIMARY KEY,
  csrf_token_hash text NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('admin', 'customer')),
  actor_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_sessions_actor_idx ON auth_sessions(actor_type, actor_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions(expires_at) WHERE revoked_at IS NULL;

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
ALTER TABLE cart_sessions ADD COLUMN IF NOT EXISTS recovery_consent boolean NOT NULL DEFAULT false;
ALTER TABLE cart_sessions ADD COLUMN IF NOT EXISTS recovery_status text NOT NULL DEFAULT 'not_requested';
ALTER TABLE cart_sessions ADD COLUMN IF NOT EXISTS recovery_email_sent_at timestamptz;
ALTER TABLE cart_sessions ADD COLUMN IF NOT EXISTS recovery_error text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS cart_sessions_recovery_idx
  ON cart_sessions(recovery_status, last_activity_at DESC)
  WHERE recovery_consent = true AND converted_order_number = '';

CREATE TABLE IF NOT EXISTS storefront_analytics_events (
  event_id text PRIMARY KEY,
  event_name text NOT NULL CHECK (event_name IN (
    'page_view', 'product_view', 'add_to_cart', 'initiate_checkout', 'add_payment_info',
    'payment_failed', 'payment_cancelled', 'web_vital'
  )),
  session_hash text NOT NULL,
  path text NOT NULL DEFAULT '',
  product_id text NOT NULL DEFAULT '',
  variant_id text NOT NULL DEFAULT '',
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0 AND quantity <= 1000),
  value_cents integer CHECK (value_cents IS NULL OR (value_cents >= 0 AND value_cents <= 100000000)),
  currency text NOT NULL DEFAULT 'PHP' CHECK (currency = 'PHP'),
  payment_method text NOT NULL DEFAULT '',
  device_type text NOT NULL DEFAULT 'unknown' CHECK (device_type IN ('mobile', 'tablet', 'desktop', 'unknown')),
  referrer_host text NOT NULL DEFAULT '',
  utm_source text NOT NULL DEFAULT '',
  utm_medium text NOT NULL DEFAULT '',
  utm_campaign text NOT NULL DEFAULT '',
  metric_name text NOT NULL DEFAULT '',
  metric_value double precision CHECK (metric_value IS NULL OR (metric_value >= 0 AND metric_value <= 600000)),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS storefront_analytics_events_time_idx
  ON storefront_analytics_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS storefront_analytics_events_name_time_idx
  ON storefront_analytics_events(event_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS storefront_analytics_events_session_time_idx
  ON storefront_analytics_events(session_hash, occurred_at DESC);
CREATE INDEX IF NOT EXISTS storefront_analytics_events_product_time_idx
  ON storefront_analytics_events(product_id, occurred_at DESC) WHERE product_id <> '';
CREATE INDEX IF NOT EXISTS storefront_analytics_events_metric_time_idx
  ON storefront_analytics_events(metric_name, occurred_at DESC) WHERE metric_name <> '';

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
  event_name text NOT NULL CHECK (event_name IN ('PageView','ViewContent','AddToCart','InitiateCheckout','AddPaymentInfo','Purchase')),
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
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM marketing_event_outbox
     WHERE event_name = 'Purchase'
     GROUP BY aggregate_id, event_name
    HAVING count(*) > 1
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS marketing_event_outbox_order_event_idx
      ON marketing_event_outbox(aggregate_id, event_name) WHERE event_name = ''Purchase''';
  ELSE
    RAISE WARNING 'Historical duplicate Meta outbox rows found; order-level uniqueness will be added after reconciliation cleanup.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS meta_event_dispatches (
  id text PRIMARY KEY,
  order_number text NULL REFERENCES orders(order_number) ON DELETE CASCADE,
  event_name text NOT NULL CHECK (event_name IN ('PageView','ViewContent','AddToCart','InitiateCheckout','AddPaymentInfo','Purchase')),
  event_id text NOT NULL,
  source text NOT NULL CHECK (source IN ('browser', 'server')),
  value numeric(14,2) CHECK (value IS NULL OR value > 0),
  currency text NOT NULL DEFAULT 'PHP' CHECK (currency = 'PHP'),
  status text NOT NULL CHECK (status IN ('pending', 'claimed', 'sending', 'sent', 'failed', 'skipped')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  claim_id text NOT NULL DEFAULT '',
  provider_response_id text NOT NULL DEFAULT '',
  error_code text NOT NULL DEFAULT '',
  error_message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_number, event_name, source),
  UNIQUE (event_id, event_name, source)
);

CREATE INDEX IF NOT EXISTS meta_event_dispatches_order_idx
  ON meta_event_dispatches(order_number, event_name, source);
CREATE INDEX IF NOT EXISTS meta_event_dispatches_status_idx
  ON meta_event_dispatches(status, created_at DESC);

UPDATE orders AS order_record
SET meta_capi_purchase_queued_at = COALESCE(order_record.meta_capi_purchase_queued_at, event.created_at),
    meta_capi_purchase_sent_at = COALESCE(order_record.meta_capi_purchase_sent_at, event.sent_at),
    meta_purchase_status = CASE
      WHEN event.sent_at IS NOT NULL AND order_record.meta_browser_purchase_sent_at IS NOT NULL THEN 'complete'
      WHEN event.sent_at IS NOT NULL THEN 'capi_sent'
      WHEN order_record.meta_purchase_tracking_version >= 2 THEN order_record.meta_purchase_status
      ELSE 'legacy'
    END,
    meta_purchase_last_error = CASE
      WHEN order_record.meta_purchase_tracking_version >= 2 THEN order_record.meta_purchase_last_error
      ELSE COALESCE(event.last_error, '')
    END
FROM marketing_event_outbox AS event
WHERE event.event_name = 'Purchase'
  AND event.event_id = order_record.meta_purchase_event_id;

CREATE TABLE IF NOT EXISTS pancake_connections (
  connection_key text PRIMARY KEY DEFAULT 'primary',
  shop_id text NOT NULL DEFAULT '',
  warehouse_id text NOT NULL DEFAULT '',
  order_source_id text NOT NULL DEFAULT '',
  mode text NOT NULL DEFAULT 'disabled' CHECK (mode IN ('disabled', 'read_only', 'shadow', 'live')),
  health_status text NOT NULL DEFAULT 'never_checked',
  last_checked_at timestamptz,
  last_connected_at timestamptz,
  last_error_code text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pancake_connection_checks (
  id text PRIMARY KEY,
  connection_key text NOT NULL DEFAULT 'primary' REFERENCES pancake_connections(connection_key) ON DELETE CASCADE,
  status text NOT NULL,
  duration_ms integer NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  shop_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pancake_connection_checks_created_at_idx
  ON pancake_connection_checks(connection_key, created_at DESC);

ALTER TABLE pancake_connections ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT '';
ALTER TABLE pancake_connections ADD COLUMN IF NOT EXISTS currency_status text NOT NULL DEFAULT 'unknown';
ALTER TABLE pancake_connections ADD COLUMN IF NOT EXISTS price_unit_status text NOT NULL DEFAULT 'unknown';
ALTER TABLE pancake_connections ADD COLUMN IF NOT EXISTS shop_locked boolean NOT NULL DEFAULT false;
ALTER TABLE pancake_connections ADD COLUMN IF NOT EXISTS warehouse_locked boolean NOT NULL DEFAULT false;
ALTER TABLE pancake_connections ADD COLUMN IF NOT EXISTS order_source_locked boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS pancake_shops (
  shop_id text PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  safe_digest text NOT NULL,
  last_seen_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS pancake_warehouses (
  shop_id text NOT NULL,
  warehouse_id text NOT NULL,
  name text NOT NULL DEFAULT '',
  allow_create_order boolean NOT NULL DEFAULT false,
  source_updated_at timestamptz,
  last_seen_at timestamptz NOT NULL,
  PRIMARY KEY (shop_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS pancake_order_sources (
  shop_id text NOT NULL,
  order_source_id text NOT NULL,
  parent_id text,
  name text NOT NULL DEFAULT '',
  source_updated_at timestamptz,
  last_seen_at timestamptz NOT NULL,
  PRIMARY KEY (shop_id, order_source_id)
);

CREATE TABLE IF NOT EXISTS pancake_catalog_imports (
  id text PRIMARY KEY,
  shop_id text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('running','shop_selection_required','complete','failed')),
  page_count integer NOT NULL DEFAULT 0 CHECK (page_count >= 0),
  pancake_variation_count integer NOT NULL DEFAULT 0 CHECK (pancake_variation_count >= 0),
  local_variant_count integer NOT NULL DEFAULT 0 CHECK (local_variant_count >= 0),
  verified_count integer NOT NULL DEFAULT 0 CHECK (verified_count >= 0),
  conflict_count integer NOT NULL DEFAULT 0 CHECK (conflict_count >= 0),
  price_unit_status text NOT NULL DEFAULT 'unknown',
  safe_error_code text NOT NULL DEFAULT '',
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  duration_ms integer NOT NULL DEFAULT 0 CHECK (duration_ms >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS pancake_one_running_catalog_import_idx
  ON pancake_catalog_imports ((1)) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS pancake_catalog_imports_started_idx ON pancake_catalog_imports(started_at DESC);

CREATE TABLE IF NOT EXISTS pancake_catalog_variations (
  shop_id text NOT NULL,
  pancake_product_id text NOT NULL,
  pancake_variation_id text NOT NULL,
  display_id text NOT NULL DEFAULT '',
  normalized_sku text NOT NULL DEFAULT '',
  product_name text NOT NULL DEFAULT '',
  retail_price_raw bigint,
  is_hidden boolean NOT NULL DEFAULT false,
  is_locked boolean NOT NULL DEFAULT false,
  source_updated_at timestamptz,
  payload_digest text NOT NULL,
  last_seen_import_id text NOT NULL REFERENCES pancake_catalog_imports(id),
  last_seen_at timestamptz NOT NULL,
  UNIQUE (shop_id, pancake_variation_id)
);

CREATE INDEX IF NOT EXISTS pancake_catalog_variations_sku_idx ON pancake_catalog_variations(shop_id, normalized_sku);

CREATE TABLE IF NOT EXISTS pancake_variant_mappings (
  id text PRIMARY KEY,
  local_variant_id bigint,
  product_slug text NOT NULL,
  local_sku text NOT NULL DEFAULT '',
  normalized_sku text NOT NULL DEFAULT '',
  pancake_product_id text NOT NULL DEFAULT '',
  pancake_variation_id text NOT NULL DEFAULT '',
  warehouse_id text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('verified','missing','duplicate_local','duplicate_pancake','inactive')),
  last_verified_import_id text REFERENCES pancake_catalog_imports(id),
  last_verified_at timestamptz,
  payload_digest text NOT NULL DEFAULT '',
  UNIQUE (local_variant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS pancake_variant_mappings_variation_idx
  ON pancake_variant_mappings(pancake_variation_id) WHERE status = 'verified';
CREATE INDEX IF NOT EXISTS pancake_variant_mappings_status_idx ON pancake_variant_mappings(status, normalized_sku);

CREATE TABLE IF NOT EXISTS pancake_product_syncs (
  product_slug text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('syncing','synced','failed','missing_mapping','blocked')),
  pancake_product_id text NOT NULL DEFAULT '',
  attempt_id text NOT NULL DEFAULT '',
  safe_error_code text NOT NULL DEFAULT '',
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_attempt_at timestamptz NOT NULL,
  last_synced_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pancake_product_syncs_status_idx
  ON pancake_product_syncs(status, last_attempt_at DESC);

CREATE TABLE IF NOT EXISTS pancake_inventory_outbox (
  product_slug text PRIMARY KEY REFERENCES products(slug) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('admin','website_order')),
  status text NOT NULL CHECK (status IN ('pending','processing','synced','failed')),
  desired_quantities jsonb NOT NULL DEFAULT '[]'::jsonb,
  checksum text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 10,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  last_synced_at timestamptz,
  last_error_code text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pancake_inventory_outbox_due_idx ON pancake_inventory_outbox(status,next_attempt_at);

CREATE TABLE IF NOT EXISTS pancake_inventory_state (
  local_variant_id bigint PRIMARY KEY REFERENCES product_variants(id) ON DELETE CASCADE,
  product_slug text NOT NULL,
  sku text NOT NULL,
  pancake_product_id text NOT NULL DEFAULT '',
  pancake_variation_id text NOT NULL DEFAULT '',
  website_quantity integer NOT NULL DEFAULT 0,
  pancake_quantity integer,
  status text NOT NULL CHECK (status IN ('matched','pending','mismatch','missing_mapping')),
  last_source text NOT NULL DEFAULT '',
  last_synced_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pancake_inventory_state_product_idx ON pancake_inventory_state(product_slug,status);

CREATE TABLE IF NOT EXISTS pancake_inventory_sync_logs (
  id text PRIMARY KEY,
  product_slug text NOT NULL DEFAULT '', sku text NOT NULL DEFAULT '',
  direction text NOT NULL CHECK (direction IN ('outbound','inbound')),
  source text NOT NULL, status text NOT NULL,
  website_quantity integer, pancake_quantity integer,
  attempt_count integer NOT NULL DEFAULT 0,
  safe_error_code text NOT NULL DEFAULT '', message text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pancake_inventory_sync_logs_created_idx ON pancake_inventory_sync_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS pancake_sync_conflicts (
  id text PRIMARY KEY,
  conflict_key text NOT NULL UNIQUE,
  entity_type text NOT NULL,
  entity_id text NOT NULL DEFAULT '',
  code text NOT NULL,
  severity text NOT NULL DEFAULT 'blocking',
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  occurrence_count integer NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS pancake_sync_conflicts_open_idx ON pancake_sync_conflicts(status, code, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS pancake_inventory_reconciliations (
  id text PRIMARY KEY,
  shop_id text NOT NULL DEFAULT '',
  warehouse_id text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('running','complete','blocked','failed')),
  checked_count integer NOT NULL DEFAULT 0 CHECK (checked_count >= 0),
  updated_count integer NOT NULL DEFAULT 0 CHECK (updated_count >= 0),
  unchanged_count integer NOT NULL DEFAULT 0 CHECK (unchanged_count >= 0),
  skipped_count integer NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  conflict_count integer NOT NULL DEFAULT 0 CHECK (conflict_count >= 0),
  safe_error_code text NOT NULL DEFAULT '',
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  duration_ms integer NOT NULL DEFAULT 0 CHECK (duration_ms >= 0)
);

CREATE INDEX IF NOT EXISTS pancake_inventory_reconciliations_started_idx
  ON pancake_inventory_reconciliations(started_at DESC);

-- Inventory movements may use reason 'pancake_reconcile' for absolute stock snapshots.

CREATE TABLE IF NOT EXISTS pancake_order_exports (
  id text PRIMARY KEY,
  order_number text NOT NULL REFERENCES orders(order_number) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'shadow' CHECK (mode IN ('read_only','shadow','live')),
  status text NOT NULL CHECK (status IN ('queued','waiting_payment','shadow_built','created_unverified','blocked','failed','sent','skipped')),
  shop_id text NOT NULL DEFAULT '',
  warehouse_id text NOT NULL DEFAULT '',
  order_source_id text NOT NULL DEFAULT '',
  pancake_order_id text NOT NULL DEFAULT '',
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  address_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_verification jsonb NOT NULL DEFAULT '{}'::jsonb,
  safe_error_code text NOT NULL DEFAULT '',
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  duration_ms integer NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  queued_at timestamptz NOT NULL DEFAULT now(),
  built_at timestamptz,
  sent_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pancake_order_exports_order_number_key UNIQUE (order_number)
);

CREATE INDEX IF NOT EXISTS pancake_order_exports_status_idx
  ON pancake_order_exports(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS pancake_geo_mappings (
  id text PRIMARY KEY,
  website_location_type text NOT NULL CHECK (website_location_type IN ('province','city','municipality','barangay')),
  website_code text NOT NULL,
  website_name text NOT NULL,
  website_name_normalized text NOT NULL,
  website_parent_code text NOT NULL DEFAULT '',
  pancake_location_type text NOT NULL CHECK (pancake_location_type IN ('province','district','commune')),
  pancake_id text NOT NULL,
  pancake_code text NOT NULL DEFAULT '',
  pancake_name text NOT NULL,
  pancake_parent_id text NOT NULL DEFAULT '',
  match_method text NOT NULL CHECK (match_method IN ('stored_id','exact_code','exact_name','approved_alias','manual')),
  verification_status text NOT NULL CHECK (verification_status IN ('auto_matched','manually_verified','needs_review','not_found','ambiguous')),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (website_location_type, website_code, website_parent_code)
);

CREATE INDEX IF NOT EXISTS pancake_geo_mappings_lookup_idx
  ON pancake_geo_mappings(website_location_type,website_name_normalized,website_parent_code,verification_status);
CREATE INDEX IF NOT EXISTS pancake_geo_mappings_provider_idx
  ON pancake_geo_mappings(pancake_location_type,pancake_id,pancake_parent_id);

CREATE TABLE IF NOT EXISTS pancake_order_links (
  id text PRIMARY KEY,
  order_number text NOT NULL REFERENCES orders(order_number) ON DELETE CASCADE,
  pancake_order_id text NOT NULL,
  shop_id text NOT NULL DEFAULT '',
  sync_status text NOT NULL DEFAULT 'pending_sync' CHECK (sync_status IN ('synced','pending_sync','sync_failed','blocked','not_linked')),
  last_synced_at timestamptz,
  last_pancake_updated_at timestamptz,
  last_local_updated_at timestamptz,
  safe_error_code text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_number),
  UNIQUE (pancake_order_id)
);

CREATE INDEX IF NOT EXISTS pancake_order_links_status_idx ON pancake_order_links(sync_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS pancake_sync_events (
  id text PRIMARY KEY,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  entity_type text NOT NULL CHECK (entity_type IN ('order','inventory')),
  entity_id text NOT NULL,
  order_number text NOT NULL DEFAULT '',
  pancake_order_id text NOT NULL DEFAULT '',
  event_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','processing','succeeded','failed_retryable','blocked','duplicate')),
  payload_hash text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  safe_error_code text NOT NULL DEFAULT '',
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (direction, entity_type, entity_id, event_key)
);

CREATE INDEX IF NOT EXISTS pancake_sync_events_due_idx ON pancake_sync_events(status, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS pancake_sync_events_order_idx ON pancake_sync_events(order_number, created_at DESC);
CREATE INDEX IF NOT EXISTS pancake_sync_events_pancake_order_idx ON pancake_sync_events(pancake_order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pancake_sync_logs (
  id text PRIMARY KEY,
  direction text NOT NULL DEFAULT '',
  entity_type text NOT NULL DEFAULT '',
  entity_id text NOT NULL DEFAULT '',
  order_number text NOT NULL DEFAULT '',
  pancake_order_id text NOT NULL DEFAULT '',
  level text NOT NULL CHECK (level IN ('info','warning','error')),
  code text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pancake_sync_logs_order_idx ON pancake_sync_logs(order_number, created_at DESC);
CREATE INDEX IF NOT EXISTS pancake_sync_logs_created_idx ON pancake_sync_logs(created_at DESC);

-- Customer product reviews, imports, moderation, photos, and immutable audit history.
CREATE TABLE IF NOT EXISTS review_import_batches (
  id text PRIMARY KEY,
  filename text NOT NULL,
  total_rows integer NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  successful_rows integer NOT NULL DEFAULT 0 CHECK (successful_rows >= 0),
  failed_rows integer NOT NULL DEFAULT 0 CHECK (failed_rows >= 0),
  imported_by text NOT NULL DEFAULT 'admin',
  error_report jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reviews (
  id text PRIMARY KEY,
  review_type text NOT NULL DEFAULT 'product' CHECK (review_type IN ('product', 'store')),
  -- Product assignment is application-validated. This remains a stable slug
  -- instead of an FK because catalog replacement deletes/reinserts products.
  product_slug text,
  customer_id text,
  -- A customer may enter an unmatched number for later moderation. Verification
  -- is application-enforced against a delivered order, so this claim is not an FK.
  order_number text,
  reviewer_name text NOT NULL,
  reviewer_email text NOT NULL DEFAULT '',
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title text NOT NULL DEFAULT '',
  body text NOT NULL,
  variant text NOT NULL DEFAULT '',
  size text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'hidden', 'archived', 'spam', 'rejected')),
  source text NOT NULL DEFAULT 'customer_submitted' CHECK (source IN ('customer_submitted', 'imported', 'admin_created', 'verified_order')),
  verified_purchase boolean NOT NULL DEFAULT false,
  helpful_count integer NOT NULL DEFAULT 0 CHECK (helpful_count >= 0),
  admin_reply text NOT NULL DEFAULT '',
  admin_reply_date timestamptz,
  moderation_reason text NOT NULL DEFAULT '',
  moderated_by text NOT NULL DEFAULT '',
  moderated_at timestamptz,
  previous_status text NOT NULL DEFAULT '',
  concern_resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  import_batch_id text REFERENCES review_import_batches(id) ON DELETE SET NULL,
  original_row_number integer,
  original_import_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  duplicate_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (review_type = 'store' OR product_slug IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS reviews_duplicate_key_active_idx ON reviews(duplicate_key) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS reviews_product_idx ON reviews(product_slug, status, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_status_idx ON reviews(status, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_rating_idx ON reviews(rating, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_created_at_idx ON reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_order_idx ON reviews(order_number) WHERE order_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS reviews_import_batch_idx ON reviews(import_batch_id) WHERE import_batch_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS review_images (
  id text PRIMARY KEY,
  review_id text NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS review_images_review_idx ON review_images(review_id, sort_order);

CREATE TABLE IF NOT EXISTS review_audit_events (
  id text PRIMARY KEY,
  review_id text REFERENCES reviews(id) ON DELETE SET NULL,
  actor text NOT NULL DEFAULT 'admin',
  action text NOT NULL,
  reason text NOT NULL DEFAULT '',
  previous_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS review_audit_events_review_idx ON review_audit_events(review_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pancake_order_snapshots (
  pancake_order_id text PRIMARY KEY,
  order_number text NOT NULL DEFAULT '',
  shop_id text NOT NULL DEFAULT '',
  normalized jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_hash text NOT NULL DEFAULT '',
  pancake_updated_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pancake_order_snapshots_order_idx ON pancake_order_snapshots(order_number);

CREATE TABLE IF NOT EXISTS issue_reports (
  id text PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  issue_type text NOT NULL,
  message text NOT NULL,
  page_url text NOT NULL DEFAULT '',
  device_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  browser_info text NOT NULL DEFAULT '',
  screen_size text NOT NULL DEFAULT '',
  user_agent text NOT NULL DEFAULT '',
  customer_id text NOT NULL DEFAULT '',
  cart_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  order_number text NOT NULL DEFAULT '',
  error_message text NOT NULL DEFAULT '',
  screenshot_url text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'new',
  admin_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS issue_reports_status_created_idx ON issue_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS issue_reports_issue_type_created_idx ON issue_reports (issue_type, created_at DESC);
