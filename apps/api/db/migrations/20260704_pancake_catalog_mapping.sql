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
