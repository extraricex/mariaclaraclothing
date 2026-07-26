ALTER TABLE storefront_analytics_events
  DROP CONSTRAINT IF EXISTS storefront_analytics_events_event_name_check;
ALTER TABLE storefront_analytics_events
  DROP CONSTRAINT IF EXISTS storefront_analytics_event_name_check;
ALTER TABLE storefront_analytics_events
  ADD CONSTRAINT storefront_analytics_event_name_check CHECK (event_name IN (
    'page_view', 'product_view', 'size_select', 'add_to_cart', 'checkout_start',
    'shipping_info_completed', 'initiate_checkout', 'add_payment_info', 'place_order',
    'checkout_error', 'thank_you_view', 'payment_failed', 'payment_cancelled', 'web_vital'
  ));

ALTER TABLE storefront_analytics_events
  ADD COLUMN IF NOT EXISTS browser_category text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS checkout_step text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS error_category text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS error_message text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reference_hash text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

CREATE INDEX IF NOT EXISTS storefront_analytics_events_error_time_idx
  ON storefront_analytics_events(error_category, occurred_at DESC)
  WHERE error_category <> '';

CREATE TABLE IF NOT EXISTS checkout_issue_resolutions (
  category text PRIMARY KEY,
  resolved_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
