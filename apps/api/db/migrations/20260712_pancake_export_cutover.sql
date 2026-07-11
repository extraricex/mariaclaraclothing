ALTER TABLE pancake_order_exports
  DROP CONSTRAINT IF EXISTS pancake_order_exports_status_check;

ALTER TABLE pancake_order_exports
  ADD CONSTRAINT pancake_order_exports_status_check
  CHECK (status IN ('queued', 'shadow_built', 'blocked', 'failed', 'sent', 'skipped'));
