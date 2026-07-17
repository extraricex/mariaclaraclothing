-- Generalize Meta's durable dispatch ledger to the complete storefront funnel
-- and make admin order notifications durable per recipient.

ALTER TABLE marketing_event_outbox
  DROP CONSTRAINT IF EXISTS marketing_event_outbox_event_name_check;
ALTER TABLE marketing_event_outbox
  ADD CONSTRAINT marketing_event_outbox_event_name_check
  CHECK (event_name IN ('PageView','ViewContent','AddToCart','InitiateCheckout','AddPaymentInfo','Purchase'));

DROP INDEX IF EXISTS marketing_event_outbox_order_event_idx;
CREATE UNIQUE INDEX marketing_event_outbox_order_event_idx
  ON marketing_event_outbox(aggregate_id, event_name)
  WHERE event_name = 'Purchase';

ALTER TABLE meta_event_dispatches
  DROP CONSTRAINT IF EXISTS meta_event_dispatches_event_name_check;
ALTER TABLE meta_event_dispatches
  ADD CONSTRAINT meta_event_dispatches_event_name_check
  CHECK (event_name IN ('PageView','ViewContent','AddToCart','InitiateCheckout','AddPaymentInfo','Purchase'));
ALTER TABLE meta_event_dispatches ALTER COLUMN order_number DROP NOT NULL;
ALTER TABLE meta_event_dispatches ALTER COLUMN value DROP NOT NULL;
ALTER TABLE meta_event_dispatches
  DROP CONSTRAINT IF EXISTS meta_event_dispatches_value_check;
ALTER TABLE meta_event_dispatches
  ADD CONSTRAINT meta_event_dispatches_value_check CHECK (value IS NULL OR value > 0);

ALTER TABLE order_notification_outbox
  DROP CONSTRAINT IF EXISTS order_notification_outbox_status_check;
ALTER TABLE order_notification_outbox
  ADD CONSTRAINT order_notification_outbox_status_check
  CHECK (status IN ('pending','sending','retrying','sent','failed','skipped','cancelled'));
ALTER TABLE order_notification_outbox
  DROP CONSTRAINT IF EXISTS order_notification_outbox_order_number_event_name_channel_key;
ALTER TABLE order_notification_outbox
  ADD CONSTRAINT order_notification_outbox_order_event_channel_recipient_key
  UNIQUE (order_number, event_name, channel, recipient);

CREATE INDEX IF NOT EXISTS order_notification_outbox_order_event_idx
  ON order_notification_outbox(order_number, event_name, created_at DESC);
