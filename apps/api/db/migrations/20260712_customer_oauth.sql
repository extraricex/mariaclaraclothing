ALTER TABLE customer_accounts ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE customer_accounts ALTER COLUMN password_salt DROP NOT NULL;

CREATE TABLE IF NOT EXISTS customer_auth_identities (
  id text PRIMARY KEY,
  customer_account_id text NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google', 'facebook')),
  provider_user_id text NOT NULL,
  provider_email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_user_id),
  UNIQUE (customer_account_id, provider)
);

CREATE INDEX IF NOT EXISTS customer_auth_identities_account_idx
  ON customer_auth_identities(customer_account_id);
