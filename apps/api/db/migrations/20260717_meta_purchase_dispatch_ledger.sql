-- Durable one-shot Meta Purchase dispatch history for browser/server reconciliation.
-- Keep this migration independently runnable even when a migration-only runner
-- has not applied the same-day value/currency migration yet.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS meta_purchase_value numeric(14,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM marketing_event_outbox
     GROUP BY aggregate_id, event_name
    HAVING count(*) > 1
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS marketing_event_outbox_order_event_idx
      ON marketing_event_outbox(aggregate_id, event_name)';
  ELSE
    RAISE WARNING 'Historical duplicate Meta outbox rows found; order-level uniqueness will be added after reconciliation cleanup.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS meta_event_dispatches (
  id text PRIMARY KEY,
  order_number text NOT NULL REFERENCES orders(order_number) ON DELETE CASCADE,
  event_name text NOT NULL CHECK (event_name = 'Purchase'),
  event_id text NOT NULL,
  source text NOT NULL CHECK (source IN ('browser', 'server')),
  value numeric(14,2) NOT NULL CHECK (value > 0),
  currency text NOT NULL DEFAULT 'PHP' CHECK (currency = 'PHP'),
  status text NOT NULL CHECK (status IN ('pending', 'claimed', 'sending', 'sent', 'failed', 'skipped')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  claim_id text NOT NULL DEFAULT '',
  provider_response_id text NOT NULL DEFAULT '',
  error_code text NOT NULL DEFAULT '',
  error_message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_number, event_name, source),
  UNIQUE (event_id, event_name, source)
);

CREATE INDEX IF NOT EXISTS meta_event_dispatches_order_idx
  ON meta_event_dispatches(order_number, event_name, source);
CREATE INDEX IF NOT EXISTS meta_event_dispatches_status_idx
  ON meta_event_dispatches(status, created_at DESC);

-- Preserve existing accepted CAPI plus completed or uncertain in-flight browser
-- history without resending it. An in-flight browser claim may have reached Meta
-- even when its completion request never reached this API, so it fails closed.
WITH server_events AS (
  SELECT event.*,
         CASE
           WHEN jsonb_typeof(event.payload->'custom_data'->'value') = 'number'
             THEN (event.payload->'custom_data'->>'value')::numeric
           ELSE NULL
         END AS purchase_value
    FROM marketing_event_outbox AS event
   WHERE event.event_name = 'Purchase'
), ranked_server_events AS (
  SELECT event.*,
         row_number() OVER (
           PARTITION BY event.aggregate_id, event.event_name
           ORDER BY
             CASE event.status WHEN 'sent' THEN 0 WHEN 'sending' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END,
             event.sent_at DESC NULLS LAST,
             event.created_at ASC,
             event.id ASC
         ) AS dispatch_rank
    FROM server_events AS event
   WHERE event.purchase_value > 0
     AND event.payload->'custom_data'->>'currency' = 'PHP'
)
INSERT INTO meta_event_dispatches (
  id, order_number, event_name, event_id, source, value, currency, status,
  attempt_count, provider_response_id, error_message, created_at, sent_at, updated_at
)
SELECT
  'server_' || md5(event.event_id),
  event.aggregate_id,
  'Purchase',
  event.event_id,
  'server',
  event.purchase_value,
  'PHP',
  event.status,
  event.attempt_count,
  event.provider_trace_id,
  event.last_error,
  event.created_at,
  event.sent_at,
  event.updated_at
FROM ranked_server_events AS event
JOIN orders AS order_record ON order_record.order_number = event.aggregate_id
WHERE event.dispatch_rank = 1
ON CONFLICT DO NOTHING;

INSERT INTO meta_event_dispatches (
  id, order_number, event_name, event_id, source, value, currency, status,
  attempt_count, claim_id, created_at, sent_at, updated_at
)
SELECT
  'browser_' || md5(order_record.meta_purchase_event_id),
  order_record.order_number,
  'Purchase',
  order_record.meta_purchase_event_id,
  'browser',
  COALESCE(order_record.meta_purchase_value, ROUND(order_record.total_cents::numeric / 100, 2)),
  'PHP',
  CASE WHEN order_record.meta_browser_purchase_sent_at IS NOT NULL THEN 'sent' ELSE 'claimed' END,
  1,
  order_record.meta_browser_purchase_claim_id,
  COALESCE(
    order_record.meta_browser_purchase_claimed_at,
    order_record.meta_browser_purchase_sent_at,
    order_record.placed_at
  ),
  order_record.meta_browser_purchase_sent_at,
  COALESCE(
    order_record.meta_browser_purchase_sent_at,
    order_record.meta_browser_purchase_claimed_at,
    order_record.updated_at,
    order_record.placed_at
  )
FROM orders AS order_record
WHERE (order_record.meta_browser_purchase_sent_at IS NOT NULL
    OR order_record.meta_browser_purchase_claimed_at IS NOT NULL)
  AND order_record.meta_purchase_event_id <> ''
  AND order_record.total_cents > 0
ON CONFLICT DO NOTHING;
