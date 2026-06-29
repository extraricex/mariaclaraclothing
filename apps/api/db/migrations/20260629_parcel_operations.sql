ALTER TABLE products ADD COLUMN IF NOT EXISTS parcel_weight_grams integer NOT NULL DEFAULT 250
  CHECK (parcel_weight_grams > 0 AND parcel_weight_grams <= 100000);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS parcel_weight_grams integer NOT NULL DEFAULT 0
  CHECK (parcel_weight_grams >= 0);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS parcel_weight_override_grams integer
  CHECK (parcel_weight_override_grams IS NULL OR (parcel_weight_override_grams > 0 AND parcel_weight_override_grams <= 1000000));

CREATE TABLE IF NOT EXISTS order_notification_outbox (
  id text PRIMARY KEY,
  order_number text NOT NULL REFERENCES orders(order_number) ON DELETE CASCADE,
  event_name text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('sms', 'email')),
  recipient text NOT NULL DEFAULT '', payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempt_count integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz, sent_at timestamptz, provider_message_id text NOT NULL DEFAULT '',
  last_error text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_number, event_name, channel)
);
CREATE INDEX IF NOT EXISTS order_notification_outbox_due_idx ON order_notification_outbox(status, next_attempt_at);
