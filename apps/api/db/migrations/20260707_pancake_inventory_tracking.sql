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
