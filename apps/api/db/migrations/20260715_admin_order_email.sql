ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_email_sent_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_email_status text NOT NULL DEFAULT 'not_queued';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_email_error text NOT NULL DEFAULT '';
