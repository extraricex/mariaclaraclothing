ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_idempotency_key text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS orders_checkout_idempotency_key_idx
  ON orders(checkout_idempotency_key) WHERE checkout_idempotency_key <> '';

CREATE TABLE IF NOT EXISTS marketing_event_outbox (
  id text PRIMARY KEY,
  provider text NOT NULL CHECK (provider = 'meta'),
  event_name text NOT NULL CHECK (event_name = 'Purchase'),
  event_id text NOT NULL UNIQUE,
  aggregate_id text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  sent_at timestamptz,
  provider_trace_id text NOT NULL DEFAULT '',
  last_error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_event_outbox_pending_idx
  ON marketing_event_outbox(status, next_attempt_at, created_at);
