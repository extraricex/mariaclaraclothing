CREATE TABLE IF NOT EXISTS paymongo_refunds (
  id text PRIMARY KEY,
  order_number text NOT NULL REFERENCES orders(order_number) ON DELETE CASCADE,
  paymongo_refund_id text NOT NULL DEFAULT '',
  payment_id text NOT NULL,
  request_key_hash text NOT NULL UNIQUE,
  provider_idempotency_key text NOT NULL UNIQUE,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'PHP',
  reason text NOT NULL CHECK (reason IN ('duplicate','fraudulent','others')),
  notes text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('requesting','pending','processing','succeeded','failed')),
  livemode boolean NOT NULL DEFAULT false,
  provider_created_at timestamptz,
  provider_updated_at timestamptz,
  last_error_code text NOT NULL DEFAULT '',
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  requested_by text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS paymongo_refunds_provider_id_idx
  ON paymongo_refunds(paymongo_refund_id) WHERE paymongo_refund_id <> '';
CREATE INDEX IF NOT EXISTS paymongo_refunds_order_idx
  ON paymongo_refunds(order_number, created_at DESC);
CREATE INDEX IF NOT EXISTS paymongo_refunds_status_idx
  ON paymongo_refunds(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS payment_operation_events (
  id text PRIMARY KEY,
  provider text NOT NULL DEFAULT 'paymongo',
  event_type text NOT NULL,
  level text NOT NULL CHECK (level IN ('info','warning','error')),
  order_number text NOT NULL DEFAULT '',
  code text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_operation_events_created_idx
  ON payment_operation_events(created_at DESC);
CREATE INDEX IF NOT EXISTS payment_operation_events_order_idx
  ON payment_operation_events(order_number, created_at DESC);
