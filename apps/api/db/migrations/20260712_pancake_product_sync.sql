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
