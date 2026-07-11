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
