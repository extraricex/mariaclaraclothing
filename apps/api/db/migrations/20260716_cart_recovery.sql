ALTER TABLE cart_sessions ADD COLUMN IF NOT EXISTS recovery_consent boolean NOT NULL DEFAULT false;
ALTER TABLE cart_sessions ADD COLUMN IF NOT EXISTS recovery_status text NOT NULL DEFAULT 'not_requested';
ALTER TABLE cart_sessions ADD COLUMN IF NOT EXISTS recovery_email_sent_at timestamptz;
ALTER TABLE cart_sessions ADD COLUMN IF NOT EXISTS recovery_error text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS cart_sessions_recovery_idx
  ON cart_sessions(recovery_status, last_activity_at DESC)
  WHERE recovery_consent = true AND converted_order_number = '';
