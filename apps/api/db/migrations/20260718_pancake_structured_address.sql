ALTER TABLE pancake_order_exports
  ADD COLUMN IF NOT EXISTS address_mapping jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE pancake_order_exports
  ADD COLUMN IF NOT EXISTS provider_verification jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE pancake_order_exports
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

ALTER TABLE pancake_order_exports
  DROP CONSTRAINT IF EXISTS pancake_order_exports_status_check;

ALTER TABLE pancake_order_exports
  ADD CONSTRAINT pancake_order_exports_status_check
  CHECK (status IN (
    'queued', 'waiting_payment', 'shadow_built', 'created_unverified',
    'blocked', 'failed', 'sent', 'skipped'
  ));

CREATE TABLE IF NOT EXISTS pancake_geo_mappings (
  id text PRIMARY KEY,
  website_location_type text NOT NULL
    CHECK (website_location_type IN ('province', 'city', 'municipality', 'barangay')),
  website_code text NOT NULL,
  website_name text NOT NULL,
  website_name_normalized text NOT NULL,
  website_parent_code text NOT NULL DEFAULT '',
  pancake_location_type text NOT NULL
    CHECK (pancake_location_type IN ('province', 'district', 'commune')),
  pancake_id text NOT NULL,
  pancake_code text NOT NULL DEFAULT '',
  pancake_name text NOT NULL,
  pancake_parent_id text NOT NULL DEFAULT '',
  match_method text NOT NULL
    CHECK (match_method IN ('stored_id', 'exact_code', 'exact_name', 'approved_alias', 'manual')),
  verification_status text NOT NULL
    CHECK (verification_status IN ('auto_matched', 'manually_verified', 'needs_review', 'not_found', 'ambiguous')),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (website_location_type, website_code, website_parent_code)
);

CREATE INDEX IF NOT EXISTS pancake_geo_mappings_lookup_idx
  ON pancake_geo_mappings (
    website_location_type, website_name_normalized, website_parent_code, verification_status
  );

CREATE INDEX IF NOT EXISTS pancake_geo_mappings_provider_idx
  ON pancake_geo_mappings (pancake_location_type, pancake_id, pancake_parent_id);
