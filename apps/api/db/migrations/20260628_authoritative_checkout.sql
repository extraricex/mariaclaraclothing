CREATE TABLE IF NOT EXISTS checkout_quotes (
  id text PRIMARY KEY,
  cart_session_id text NOT NULL,
  request_hash text NOT NULL,
  snapshot jsonb NOT NULL,
  finalizable boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  consumed_order_number text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS checkout_quotes_expiry_idx ON checkout_quotes(expires_at);
CREATE INDEX IF NOT EXISTS checkout_quotes_cart_idx ON checkout_quotes(cart_session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS checkout_idempotency (
  key_hash text PRIMARY KEY,
  request_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('in_progress', 'completed')),
  order_number text NOT NULL DEFAULT '',
  response jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS checkout_idempotency_expiry_idx ON checkout_idempotency(expires_at);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_token_hash text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_token_created_at timestamptz;
