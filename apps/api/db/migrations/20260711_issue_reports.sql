CREATE TABLE IF NOT EXISTS issue_reports (
  id text PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  issue_type text NOT NULL,
  message text NOT NULL,
  page_url text NOT NULL DEFAULT '',
  device_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  browser_info text NOT NULL DEFAULT '',
  screen_size text NOT NULL DEFAULT '',
  user_agent text NOT NULL DEFAULT '',
  customer_id text NOT NULL DEFAULT '',
  cart_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  order_number text NOT NULL DEFAULT '',
  error_message text NOT NULL DEFAULT '',
  screenshot_url text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'new',
  admin_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS issue_reports_status_created_idx ON issue_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS issue_reports_issue_type_created_idx ON issue_reports (issue_type, created_at DESC);
