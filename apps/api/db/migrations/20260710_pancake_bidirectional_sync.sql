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
