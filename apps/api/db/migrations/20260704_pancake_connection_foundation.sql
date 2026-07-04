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
