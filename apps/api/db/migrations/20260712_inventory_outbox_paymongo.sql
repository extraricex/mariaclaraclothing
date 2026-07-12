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

CREATE INDEX IF NOT EXISTS pancake_inventory_outbox_due_idx
  ON pancake_inventory_outbox(status,next_attempt_at);

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

CREATE INDEX IF NOT EXISTS pancake_inventory_state_product_idx
  ON pancake_inventory_state(product_slug,status);

CREATE TABLE IF NOT EXISTS pancake_inventory_sync_logs (
  id text PRIMARY KEY,
  product_slug text NOT NULL DEFAULT '',
  sku text NOT NULL DEFAULT '',
  direction text NOT NULL CHECK (direction IN ('outbound','inbound')),
  source text NOT NULL,
  status text NOT NULL,
  website_quantity integer,
  pancake_quantity integer,
  attempt_count integer NOT NULL DEFAULT 0,
  safe_error_code text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pancake_inventory_sync_logs_created_idx
  ON pancake_inventory_sync_logs(created_at DESC);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_provider text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS provider_checkout_session_id text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS provider_payment_id text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_amount_cents integer;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_expires_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS inventory_reservation_status text NOT NULL DEFAULT 'committed';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS orders_provider_checkout_session_idx
  ON orders(provider_checkout_session_id) WHERE provider_checkout_session_id<>'';

CREATE TABLE IF NOT EXISTS paymongo_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  order_number text NOT NULL DEFAULT '',
  payload_digest text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
