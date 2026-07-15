ALTER TABLE products ADD COLUMN IF NOT EXISTS reviews_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS show_rating_summary boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS review_import_batches (
  id text PRIMARY KEY,
  filename text NOT NULL,
  total_rows integer NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  successful_rows integer NOT NULL DEFAULT 0 CHECK (successful_rows >= 0),
  failed_rows integer NOT NULL DEFAULT 0 CHECK (failed_rows >= 0),
  imported_by text NOT NULL DEFAULT 'admin',
  error_report jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reviews (
  id text PRIMARY KEY,
  review_type text NOT NULL DEFAULT 'product' CHECK (review_type IN ('product', 'store')),
  -- Product assignment is application-validated. This remains a stable slug
  -- instead of an FK because catalog replacement deletes/reinserts products.
  product_slug text,
  customer_id text,
  -- Unmatched customer claims remain Pending/unverified instead of failing the submission.
  order_number text,
  reviewer_name text NOT NULL,
  reviewer_email text NOT NULL DEFAULT '',
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title text NOT NULL DEFAULT '',
  body text NOT NULL,
  variant text NOT NULL DEFAULT '',
  size text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'hidden', 'archived', 'spam', 'rejected')),
  source text NOT NULL DEFAULT 'customer_submitted' CHECK (source IN ('customer_submitted', 'imported', 'admin_created', 'verified_order')),
  verified_purchase boolean NOT NULL DEFAULT false,
  helpful_count integer NOT NULL DEFAULT 0 CHECK (helpful_count >= 0),
  admin_reply text NOT NULL DEFAULT '',
  admin_reply_date timestamptz,
  moderation_reason text NOT NULL DEFAULT '',
  moderated_by text NOT NULL DEFAULT '',
  moderated_at timestamptz,
  previous_status text NOT NULL DEFAULT '',
  concern_resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  import_batch_id text REFERENCES review_import_batches(id) ON DELETE SET NULL,
  original_row_number integer,
  original_import_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  duplicate_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (review_type = 'store' OR product_slug IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS reviews_duplicate_key_active_idx ON reviews(duplicate_key) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS reviews_product_idx ON reviews(product_slug, status, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_status_idx ON reviews(status, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_rating_idx ON reviews(rating, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_created_at_idx ON reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_order_idx ON reviews(order_number) WHERE order_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS reviews_import_batch_idx ON reviews(import_batch_id) WHERE import_batch_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS review_images (
  id text PRIMARY KEY,
  review_id text NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS review_images_review_idx ON review_images(review_id, sort_order);

CREATE TABLE IF NOT EXISTS review_audit_events (
  id text PRIMARY KEY,
  review_id text REFERENCES reviews(id) ON DELETE SET NULL,
  actor text NOT NULL DEFAULT 'admin',
  action text NOT NULL,
  reason text NOT NULL DEFAULT '',
  previous_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS review_audit_events_review_idx ON review_audit_events(review_id, created_at DESC);
