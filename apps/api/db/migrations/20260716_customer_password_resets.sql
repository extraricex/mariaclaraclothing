CREATE TABLE IF NOT EXISTS customer_password_resets (
  id text PRIMARY KEY,
  customer_account_id text NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_password_resets_active_idx
  ON customer_password_resets(customer_account_id, expires_at DESC) WHERE used_at IS NULL;
