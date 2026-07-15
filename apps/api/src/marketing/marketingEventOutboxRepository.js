const crypto = require('node:crypto');

async function insertMetaPurchaseOutbox(client, event) {
  if (!event?.event_id || event?.custom_data?.currency !== 'PHP' || !Number.isFinite(event?.custom_data?.value) || event.custom_data.value <= 0) {
    return null;
  }
  const id = crypto.randomUUID();
  const result = await client.query(
    `INSERT INTO marketing_event_outbox (
       id, provider, event_name, event_id, aggregate_id, payload
     ) VALUES ($1, 'meta', 'Purchase', $2, $3, $4::jsonb)
     ON CONFLICT (event_id) DO NOTHING
     RETURNING *`,
    [id, event.event_id, event.custom_data?.order_id || '', JSON.stringify(event)]
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
     )
     UPDATE marketing_event_outbox AS event
     SET status = 'sending', locked_at = $1, attempt_count = attempt_count + 1, updated_at = $1
     FROM due
     WHERE event.id = due.id
     RETURNING event.*`,
    [now, Math.max(1, Math.min(100, Number(limit) || 10))]
  );
  return result.rows;
}

async function markMetaEventSent(client, id, { traceId = '' } = {}) {
  await client.query(
    `UPDATE marketing_event_outbox
     SET status = 'sent', sent_at = now(), locked_at = NULL,
         provider_trace_id = $2, last_error = '',
         payload = jsonb_set(payload, '{user_data}', '{}'::jsonb), updated_at = now()
     WHERE id = $1`,
    [id, String(traceId || '').slice(0, 255)]
  );
}

async function scheduleMetaEventRetry(client, id, { nextAttemptAt, error = '' }) {
  await client.query(
    `UPDATE marketing_event_outbox
     SET status = 'pending', next_attempt_at = $2, locked_at = NULL,
         last_error = $3, updated_at = now()
     WHERE id = $1`,
    [id, nextAttemptAt, String(error || '').slice(0, 1000)]
  );
}

async function markMetaEventFailed(client, id, error = '') {
  await client.query(
    `UPDATE marketing_event_outbox
     SET status = 'failed', locked_at = NULL, last_error = $2, updated_at = now()
     WHERE id = $1`,
    [id, String(error || '').slice(0, 1000)]
  );
}

async function recoverStaleMetaEventClaims(client, cutoff) {
  const result = await client.query(
    `UPDATE marketing_event_outbox
     SET status = 'pending', locked_at = NULL, updated_at = now()
     WHERE status = 'sending' AND locked_at < $1`,
    [cutoff]
  );
  return result.rowCount;
}

module.exports = {
  claimDueMetaEvents,
  insertMetaPurchaseOutbox,
  markMetaEventFailed,
  markMetaEventSent,
  recoverStaleMetaEventClaims,
  scheduleMetaEventRetry
};
