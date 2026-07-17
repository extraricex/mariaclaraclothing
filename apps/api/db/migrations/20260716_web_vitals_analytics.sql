ALTER TABLE storefront_analytics_events ADD COLUMN IF NOT EXISTS metric_name text NOT NULL DEFAULT '';
ALTER TABLE storefront_analytics_events ADD COLUMN IF NOT EXISTS metric_value double precision;

ALTER TABLE storefront_analytics_events DROP CONSTRAINT IF EXISTS storefront_analytics_events_event_name_check;
ALTER TABLE storefront_analytics_events DROP CONSTRAINT IF EXISTS storefront_analytics_event_name_check;
ALTER TABLE storefront_analytics_events ADD CONSTRAINT storefront_analytics_event_name_check CHECK (event_name IN (
  'page_view', 'product_view', 'add_to_cart', 'initiate_checkout', 'add_payment_info',
  'payment_failed', 'payment_cancelled', 'web_vital'
));

ALTER TABLE storefront_analytics_events DROP CONSTRAINT IF EXISTS storefront_analytics_metric_value_check;
ALTER TABLE storefront_analytics_events ADD CONSTRAINT storefront_analytics_metric_value_check CHECK (
  metric_value IS NULL OR (metric_value >= 0 AND metric_value <= 600000)
);

CREATE INDEX IF NOT EXISTS storefront_analytics_events_metric_time_idx
  ON storefront_analytics_events(metric_name, occurred_at DESC) WHERE metric_name <> '';
