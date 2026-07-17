ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_reason text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_test_order boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS orders_test_order_placed_idx
  ON orders(is_test_order, placed_at DESC);

CREATE TABLE IF NOT EXISTS storefront_analytics_events (
  event_id text PRIMARY KEY,
  event_name text NOT NULL CHECK (event_name IN (
    'page_view', 'product_view', 'add_to_cart', 'initiate_checkout', 'add_payment_info'
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
