ALTER TABLE orders ADD COLUMN IF NOT EXISTS meta_purchase_event_id text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS meta_purchase_tracking_version integer NOT NULL DEFAULT 1;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS meta_browser_purchase_claim_id text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS meta_browser_purchase_claimed_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS meta_browser_purchase_sent_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS meta_capi_purchase_queued_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS meta_capi_purchase_sent_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS meta_purchase_status text NOT NULL DEFAULT 'legacy';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS meta_purchase_last_error text NOT NULL DEFAULT '';

UPDATE orders
SET meta_purchase_event_id = 'purchase_' || order_number
WHERE meta_purchase_event_id = '';

UPDATE orders AS order_record
SET meta_capi_purchase_queued_at = COALESCE(order_record.meta_capi_purchase_queued_at, event.created_at),
    meta_capi_purchase_sent_at = COALESCE(order_record.meta_capi_purchase_sent_at, event.sent_at),
    meta_purchase_status = CASE
      WHEN event.sent_at IS NOT NULL AND order_record.meta_browser_purchase_sent_at IS NOT NULL THEN 'complete'
      WHEN event.sent_at IS NOT NULL THEN 'capi_sent'
      WHEN order_record.meta_purchase_tracking_version >= 2 THEN order_record.meta_purchase_status
      ELSE 'legacy'
    END,
    meta_purchase_last_error = CASE
      WHEN order_record.meta_purchase_tracking_version >= 2 THEN order_record.meta_purchase_last_error
      ELSE COALESCE(event.last_error, '')
    END
FROM marketing_event_outbox AS event
WHERE event.event_name = 'Purchase'
  AND event.event_id = order_record.meta_purchase_event_id;

CREATE UNIQUE INDEX IF NOT EXISTS orders_meta_purchase_event_id_idx
  ON orders(meta_purchase_event_id)
  WHERE meta_purchase_event_id <> '';

CREATE INDEX IF NOT EXISTS orders_meta_purchase_status_idx
  ON orders(meta_purchase_status, placed_at DESC);
