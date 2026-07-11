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
  password_hash text,
  password_salt text,
  full_name text NOT NULL DEFAULT '',
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
  status text NOT NULL CHECK (status IN ('queued','shadow_built','blocked','failed','sent')),
  shop_id text NOT NULL DEFAULT '',
  warehouse_id text NOT NULL DEFAULT '',
  order_source_id text NOT NULL DEFAULT '',
  pancake_order_id text NOT NULL DEFAULT '',
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  safe_error_code text NOT NULL DEFAULT '',
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  duration_ms integer NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  queued_at timestamptz NOT NULL DEFAULT now(),
  built_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pancake_order_exports_order_number_key UNIQUE (order_number)
);

CREATE INDEX IF NOT EXISTS pancake_order_exports_status_idx
  ON pancake_order_exports(status, updated_at DESC);

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
