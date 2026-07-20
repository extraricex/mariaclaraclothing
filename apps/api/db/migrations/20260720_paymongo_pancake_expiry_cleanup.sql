ALTER TABLE pancake_sync_events
  DROP CONSTRAINT IF EXISTS pancake_sync_events_status_check;

ALTER TABLE pancake_sync_events
  ADD CONSTRAINT pancake_sync_events_status_check
  CHECK (status IN ('pending','processing','succeeded','failed_retryable','blocked','duplicate','skipped'));

UPDATE pancake_order_exports export
SET status='skipped',
    safe_error_code='paymongo_payment_expired',
    updated_at=now()
FROM orders website_order
WHERE export.order_number=website_order.order_number
  AND export.status='waiting_payment'
  AND export.pancake_order_id=''
  AND website_order.payment_provider='paymongo'
  AND website_order.payment_status='expired'
  AND website_order.status='cancelled';

UPDATE pancake_order_exports export
SET status='skipped',
    safe_error_code='paymongo_payment_cancelled',
    updated_at=now()
FROM orders website_order
WHERE export.order_number=website_order.order_number
  AND export.status='waiting_payment'
  AND export.pancake_order_id=''
  AND website_order.payment_provider='paymongo'
  AND website_order.payment_status='cancelled'
  AND website_order.status='cancelled';

UPDATE pancake_sync_events event
SET status='skipped',
    safe_error_code='paymongo_payment_expired_no_export',
    processed_at=COALESCE(event.processed_at,now()),
    updated_at=now()
FROM orders website_order
WHERE event.order_number=website_order.order_number
  AND event.direction='outbound'
  AND event.entity_type='order'
  AND event.pancake_order_id=''
  AND event.status='blocked'
  AND event.safe_error_code='pancake_order_link_missing'
  AND event.event_key LIKE 'paymongo-expired:%'
  AND website_order.payment_provider='paymongo'
  AND website_order.payment_status='expired'
  AND website_order.status='cancelled';
