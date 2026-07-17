const crypto = require('node:crypto');

const PURCHASE_EVENT_NAME = 'Purchase';

function dispatchId(source, eventId) {
  return `${source}_${crypto.createHash('sha256').update(String(eventId)).digest('hex').slice(0, 32)}`;
}

async function findMetaPurchaseOutboxSnapshot(client, eventId) {
  if (typeof client?.query !== 'function' || !String(eventId || '').trim()) return null;
  const result = await client.query(
    `SELECT event_id, aggregate_id, payload, status, sent_at
       FROM marketing_event_outbox
      WHERE event_name = 'Purchase'
        AND event_id = $1
      LIMIT 1`,
    [String(eventId).trim()]
  );
  return result.rows[0] || null;
}

async function claimBrowserMetaPurchaseDispatch(client, {
  orderNumber,
  eventId,
  value,
  currency,
  claimId
}) {
  if (typeof client?.query !== 'function') return null;
  const result = await client.query(
    `INSERT INTO meta_event_dispatches (
       id, order_number, event_name, event_id, source, value, currency,
       status, attempt_count, claim_id
     ) VALUES ($1, $2, 'Purchase', $3, 'browser', $4, $5, 'claimed', 1, $6)
     ON CONFLICT (order_number, event_name, source) DO UPDATE
       SET status='claimed', claim_id=EXCLUDED.claim_id,
           attempt_count=meta_event_dispatches.attempt_count+1,
           error_code='', error_message='', updated_at=now()
       WHERE meta_event_dispatches.status IN ('failed','skipped')
     RETURNING *`,
    [
      dispatchId('browser', eventId),
      String(orderNumber || '').trim(),
      String(eventId || '').trim(),
      value,
      String(currency || '').trim(),
      String(claimId || '').trim()
    ]
  );
  return result.rows[0] || null;
}

async function findMetaPurchaseDispatch(client, { orderNumber, source = 'browser' }) {
  if (typeof client?.query !== 'function') return null;
  const result = await client.query(
    `SELECT *
       FROM meta_event_dispatches
      WHERE order_number = $1
        AND event_name = 'Purchase'
        AND source = $2
      LIMIT 1`,
    [String(orderNumber || '').trim(), String(source || '').trim()]
  );
  return result.rows[0] || null;
}

async function completeBrowserMetaPurchaseDispatch(client, {
  orderNumber,
  claimId,
  sent,
  completedAt = new Date()
}) {
  if (typeof client?.query !== 'function') return null;
  const result = await client.query(
    `UPDATE meta_event_dispatches
        SET status = CASE WHEN $3::boolean THEN 'sent' ELSE 'skipped' END,
            sent_at = CASE WHEN $3::boolean THEN COALESCE(sent_at, $4) ELSE sent_at END,
            error_code = CASE WHEN $3::boolean THEN '' ELSE 'browser_pixel_not_sent' END,
            error_message = CASE
              WHEN $3::boolean THEN ''
              ELSE 'The browser Pixel did not confirm the Purchase dispatch; server CAPI remains authoritative.'
            END,
            updated_at = $4
      WHERE order_number = $1
        AND event_name = 'Purchase'
        AND source = 'browser'
        AND claim_id = $2
        AND status = 'claimed'
      RETURNING *`,
    [String(orderNumber || '').trim(), String(claimId || '').trim(), Boolean(sent), completedAt]
  );
  return result.rows[0] || null;
}

module.exports = {
  PURCHASE_EVENT_NAME,
  claimBrowserMetaPurchaseDispatch,
  completeBrowserMetaPurchaseDispatch,
  dispatchId,
  findMetaPurchaseDispatch,
  findMetaPurchaseOutboxSnapshot
};
