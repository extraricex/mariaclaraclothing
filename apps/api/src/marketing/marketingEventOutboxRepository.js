const crypto = require('node:crypto');
const { validateMetaPurchaseEvent } = require('./metaMoney');

// Purchase must only enter the durable queue through insertMetaPurchaseOutbox,
// where its value, currency, permanent order ID and order row are validated.
const META_EVENT_NAMES = new Set(['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'AddPaymentInfo']);

async function insertMetaEventOutbox(client, event, {
  aggregateId = '',
  orderNumber = null,
  browserSent = false
} = {}) {
  const eventName = String(event?.event_name || '');
  const eventId = String(event?.event_id || '').trim();
  if (!META_EVENT_NAMES.has(eventName) || !eventId || typeof client?.query !== 'function') return null;
  const value = typeof event?.custom_data?.value === 'number' && Number.isFinite(event.custom_data.value)
    ? event.custom_data.value
    : null;
  const currency = String(event?.custom_data?.currency || 'PHP');
  if (eventName !== 'PageView' && (value === null || value <= 0 || currency !== 'PHP')) return null;
  const id = crypto.randomUUID();
  const result = await client.query(
    `WITH inserted AS (
       INSERT INTO marketing_event_outbox (
         id, provider, event_name, event_id, aggregate_id, payload
       ) VALUES ($1, 'meta', $2, $3, $4, $5::jsonb)
       ON CONFLICT DO NOTHING
       RETURNING *
     ), server_dispatch AS (
       INSERT INTO meta_event_dispatches (
         id, order_number, event_name, event_id, source, value, currency, status, attempt_count
       )
       SELECT 'server_' || inserted.id, $6, inserted.event_name, inserted.event_id,
              'server', $7::numeric, $8, 'pending', 0
         FROM inserted
       ON CONFLICT DO NOTHING
       RETURNING id
     ), browser_dispatch AS (
       INSERT INTO meta_event_dispatches (
         id, order_number, event_name, event_id, source, value, currency, status,
         attempt_count, sent_at
       )
       SELECT 'browser_' || inserted.id, $6, inserted.event_name, inserted.event_id,
              'browser', $7::numeric, $8, 'sent', 1, now()
         FROM inserted
        WHERE $9::boolean
       ON CONFLICT DO NOTHING
       RETURNING id
     )
     SELECT * FROM inserted`,
    [
      id, eventName, eventId, String(aggregateId || eventId), JSON.stringify(event),
      orderNumber || null, value, currency, Boolean(browserSent)
    ]
  );
  return result.rows[0] || null;
}

async function insertMetaPurchaseOutbox(client, event) {
  if (!validateMetaPurchaseEvent(event).valid) {
    return null;
  }
  const id = crypto.randomUUID();
  const result = await client.query(
    `WITH inserted AS (
       INSERT INTO marketing_event_outbox (
         id, provider, event_name, event_id, aggregate_id, payload
       ) VALUES ($1, 'meta', 'Purchase', $2, $3, $4::jsonb)
       ON CONFLICT DO NOTHING
       RETURNING *
     ), dispatch_state AS (
       INSERT INTO meta_event_dispatches (
         id, order_number, event_name, event_id, source, value, currency, status, attempt_count
       )
       SELECT 'server_' || inserted.id, inserted.aggregate_id, 'Purchase', inserted.event_id,
              'server', (inserted.payload->'custom_data'->>'value')::numeric,
              inserted.payload->'custom_data'->>'currency', 'pending', 0
         FROM inserted
         JOIN orders AS dispatch_order ON dispatch_order.order_number = inserted.aggregate_id
       ON CONFLICT DO NOTHING
       RETURNING order_number
     ), order_state AS (
       UPDATE orders AS order_record
          SET meta_purchase_event_id = inserted.event_id,
              meta_purchase_value = (inserted.payload->'custom_data'->>'value')::numeric,
              meta_purchase_currency = inserted.payload->'custom_data'->>'currency',
              meta_capi_purchase_queued_at = COALESCE(order_record.meta_capi_purchase_queued_at, now()),
              meta_purchase_status = CASE
                WHEN order_record.meta_browser_purchase_sent_at IS NOT NULL THEN 'browser_sent_capi_queued'
                ELSE 'capi_queued'
              END,
              meta_purchase_last_error = '',
              updated_at = now()
         FROM inserted
        WHERE order_record.order_number = inserted.aggregate_id
       RETURNING order_record.order_number
     )
     SELECT * FROM inserted`,
    [id, event.event_id, event.custom_data?.order_id || '', JSON.stringify(event)]
  );
  return result.rows[0] || null;
}

async function recordMetaPurchaseValidationFailure(client, orderNumber, error = 'Meta Purchase payload validation failed.') {
  if (typeof client?.query !== 'function' || !String(orderNumber || '').trim()) return null;
  const result = await client.query(
    `UPDATE orders
        SET meta_purchase_status = 'validation_failed',
            meta_purchase_last_error = $2,
            updated_at = now()
      WHERE order_number = $1
        AND meta_capi_purchase_sent_at IS NULL
      RETURNING order_number`,
    [String(orderNumber).trim(), String(error || 'Meta Purchase payload validation failed.').slice(0, 1000)]
  );
  return result.rows[0] || null;
}

async function claimDueMetaEvents(client, { now = new Date(), limit = 10 } = {}) {
  const result = await client.query(
    `WITH due AS (
       SELECT id FROM marketing_event_outbox
       WHERE status = 'pending' AND next_attempt_at <= $1
       ORDER BY next_attempt_at ASC, created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT $2
     ), claimed AS (
       UPDATE marketing_event_outbox AS event
          SET status = 'sending', locked_at = $1, attempt_count = attempt_count + 1, updated_at = $1
         FROM due
        WHERE event.id = due.id
       RETURNING event.*
     ), dispatch_state AS (
       UPDATE meta_event_dispatches AS dispatch
          SET status = 'sending', attempt_count = claimed.attempt_count, updated_at = $1
         FROM claimed
        WHERE dispatch.event_id = claimed.event_id
          AND dispatch.event_name = claimed.event_name
          AND dispatch.source = 'server'
       RETURNING dispatch.id
     )
     SELECT * FROM claimed`,
    [now, Math.max(1, Math.min(100, Number(limit) || 10))]
  );
  return result.rows;
}

async function markMetaEventSent(client, id, { traceId = '' } = {}) {
  await client.query(
    `WITH sent_event AS (
       UPDATE marketing_event_outbox
          SET status = 'sent', sent_at = now(), locked_at = NULL,
              provider_trace_id = $2, last_error = '',
              payload = jsonb_set(payload, '{user_data}', '{}'::jsonb) - '_meta_test_event_code', updated_at = now()
        WHERE id = $1
       RETURNING aggregate_id, event_name, event_id, sent_at
     ), dispatch_state AS (
       UPDATE meta_event_dispatches AS dispatch
          SET status = 'sent', sent_at = COALESCE(dispatch.sent_at, sent_event.sent_at),
              provider_response_id = $2, error_code = '', error_message = '', updated_at = now()
         FROM sent_event
        WHERE dispatch.event_id = sent_event.event_id
          AND dispatch.event_name = sent_event.event_name
          AND dispatch.source = 'server'
       RETURNING dispatch.id
     )
     UPDATE orders AS order_record
        SET meta_purchase_event_id = sent_event.event_id,
            meta_capi_purchase_sent_at = COALESCE(order_record.meta_capi_purchase_sent_at, sent_event.sent_at),
            meta_purchase_status = CASE
              WHEN order_record.meta_browser_purchase_sent_at IS NOT NULL THEN 'complete'
              ELSE 'capi_sent'
            END,
            meta_purchase_last_error = '',
            updated_at = now()
       FROM sent_event
      WHERE sent_event.event_name = 'Purchase'
        AND order_record.order_number = sent_event.aggregate_id`,
    [id, String(traceId || '').slice(0, 255)]
  );
}

async function scheduleMetaEventRetry(client, id, { nextAttemptAt, error = '' }) {
  await client.query(
    `WITH retry_event AS (
       UPDATE marketing_event_outbox
          SET status = 'pending', next_attempt_at = $2, locked_at = NULL,
              last_error = $3, updated_at = now()
        WHERE id = $1
       RETURNING aggregate_id, event_name, event_id, last_error
     ), dispatch_state AS (
       UPDATE meta_event_dispatches AS dispatch
          SET status = 'pending', error_code = 'retry_scheduled',
              error_message = retry_event.last_error, updated_at = now()
         FROM retry_event
        WHERE dispatch.event_id = retry_event.event_id
          AND dispatch.event_name = retry_event.event_name
          AND dispatch.source = 'server'
       RETURNING dispatch.id
     )
     UPDATE orders AS order_record
        SET meta_purchase_event_id = retry_event.event_id,
            meta_purchase_status = 'capi_retrying',
            meta_purchase_last_error = retry_event.last_error,
            updated_at = now()
       FROM retry_event
      WHERE retry_event.event_name = 'Purchase'
        AND order_record.order_number = retry_event.aggregate_id`,
    [id, nextAttemptAt, String(error || '').slice(0, 1000)]
  );
}

async function markMetaEventFailed(client, id, error = '') {
  await client.query(
    `WITH failed_event AS (
       UPDATE marketing_event_outbox
          SET status = 'failed', locked_at = NULL, last_error = $2, updated_at = now()
        WHERE id = $1
       RETURNING aggregate_id, event_name, event_id, last_error
     ), dispatch_state AS (
       UPDATE meta_event_dispatches AS dispatch
          SET status = 'failed', error_code = 'meta_api_failed',
              error_message = failed_event.last_error, updated_at = now()
         FROM failed_event
        WHERE dispatch.event_id = failed_event.event_id
          AND dispatch.event_name = failed_event.event_name
          AND dispatch.source = 'server'
       RETURNING dispatch.id
     )
     UPDATE orders AS order_record
        SET meta_purchase_event_id = failed_event.event_id,
            meta_purchase_status = CASE
              WHEN order_record.meta_browser_purchase_sent_at IS NOT NULL THEN 'browser_sent_capi_failed'
              ELSE 'capi_failed'
            END,
            meta_purchase_last_error = failed_event.last_error,
            updated_at = now()
       FROM failed_event
      WHERE failed_event.event_name = 'Purchase'
        AND order_record.order_number = failed_event.aggregate_id`,
    [id, String(error || '').slice(0, 1000)]
  );
}

async function recoverStaleMetaEventClaims(client, cutoff) {
  const result = await client.query(
    `WITH recovered AS (
       UPDATE marketing_event_outbox
          SET status = 'pending', locked_at = NULL, updated_at = now()
        WHERE status = 'sending' AND locked_at < $1
       RETURNING event_id, event_name
     )
     UPDATE meta_event_dispatches AS dispatch
        SET status = 'pending', error_code = 'stale_claim_recovered', updated_at = now()
       FROM recovered
      WHERE dispatch.event_id = recovered.event_id
        AND dispatch.event_name = recovered.event_name
        AND dispatch.source = 'server'`,
    [cutoff]
  );
  return result.rowCount;
}

module.exports = {
  claimDueMetaEvents,
  insertMetaEventOutbox,
  insertMetaPurchaseOutbox,
  markMetaEventFailed,
  markMetaEventSent,
  recordMetaPurchaseValidationFailure,
  recoverStaleMetaEventClaims,
  scheduleMetaEventRetry
};
