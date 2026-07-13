const crypto = require('node:crypto');
const { hasDatabaseUrl, query } = require('../db/postgres');
const { listOrders } = require('../orders/orderRepository');

function iso(value) {
  return value ? new Date(value).toISOString() : '';
}

function rowRefund(row) {
  if (!row) return null;
  return {
    id: row.id,
    orderNumber: row.order_number,
    paymongoRefundId: row.paymongo_refund_id || '',
    paymentId: row.payment_id,
    providerIdempotencyKey: row.provider_idempotency_key,
    amountCents: Number(row.amount_cents || 0),
    currency: row.currency || 'PHP',
    reason: row.reason,
    notes: row.notes || '',
    status: row.status,
    livemode: Boolean(row.livemode),
    providerCreatedAt: iso(row.provider_created_at),
    providerUpdatedAt: iso(row.provider_updated_at),
    lastErrorCode: row.last_error_code || '',
    attemptCount: Number(row.attempt_count || 0),
    requestedBy: row.requested_by || 'admin',
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

function executor(options = {}) {
  return options.client || { query };
}

async function listOrderRefunds(orderNumber, options = {}) {
  if (!hasDatabaseUrl()) return [];
  const result = await executor(options).query(
    'SELECT * FROM paymongo_refunds WHERE order_number=$1 ORDER BY created_at DESC',
    [String(orderNumber || '').trim()]
  );
  return result.rows.map(rowRefund);
}

async function findRefundById(id, options = {}) {
  if (!hasDatabaseUrl()) return null;
  const lock = options.forUpdate ? ' FOR UPDATE' : '';
  const result = await executor(options).query(`SELECT * FROM paymongo_refunds WHERE id=$1${lock}`, [id]);
  return rowRefund(result.rows[0]);
}

async function createRefundAttempt(input, options = {}) {
  const result = await executor(options).query(
    `INSERT INTO paymongo_refunds (
       id,order_number,payment_id,request_key_hash,provider_idempotency_key,amount_cents,
       currency,reason,notes,status,livemode,requested_by,attempt_count
     ) VALUES ($1,$2,$3,$4,$5,$6,'PHP',$7,$8,'requesting',$9,$10,1)
     ON CONFLICT (request_key_hash) DO NOTHING RETURNING *`,
    [
      input.id, input.orderNumber, input.paymentId, input.requestKeyHash,
      input.providerIdempotencyKey, input.amountCents, input.reason, input.notes,
      Boolean(input.livemode), input.requestedBy || 'admin'
    ]
  );
  if (result.rows[0]) return { refund: rowRefund(result.rows[0]), created: true };
  const existing = await executor(options).query('SELECT * FROM paymongo_refunds WHERE request_key_hash=$1', [input.requestKeyHash]);
  return { refund: rowRefund(existing.rows[0]), created: false };
}

async function updateRefund(id, changes, options = {}) {
  const fields = [];
  const values = [];
  const columns = {
    paymongoRefundId: 'paymongo_refund_id', status: 'status', providerCreatedAt: 'provider_created_at',
    providerUpdatedAt: 'provider_updated_at', lastErrorCode: 'last_error_code', attemptCount: 'attempt_count'
  };
  for (const [key, column] of Object.entries(columns)) {
    if (changes[key] === undefined) continue;
    values.push(key.includes('At') && !changes[key] ? null : changes[key]);
    fields.push(`${column}=$${values.length}`);
  }
  if (!fields.length) return findRefundById(id, options);
  values.push(id);
  const result = await executor(options).query(
    `UPDATE paymongo_refunds SET ${fields.join(',')},updated_at=now() WHERE id=$${values.length} RETURNING *`,
    values
  );
  return rowRefund(result.rows[0]);
}

async function upsertWebhookRefund(input, options = {}) {
  const result = await executor(options).query(
    `INSERT INTO paymongo_refunds (
       id,order_number,paymongo_refund_id,payment_id,request_key_hash,provider_idempotency_key,
       amount_cents,currency,reason,notes,status,livemode,provider_created_at,provider_updated_at,
       requested_by,attempt_count
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'paymongo_webhook',0)
     ON CONFLICT (paymongo_refund_id) WHERE paymongo_refund_id <> '' DO UPDATE SET
       status=CASE WHEN paymongo_refunds.status='succeeded' THEN 'succeeded' ELSE EXCLUDED.status END,
       amount_cents=EXCLUDED.amount_cents,currency=EXCLUDED.currency,
       provider_created_at=COALESCE(paymongo_refunds.provider_created_at,EXCLUDED.provider_created_at),
       provider_updated_at=COALESCE(EXCLUDED.provider_updated_at,now()),last_error_code='',updated_at=now()
     RETURNING *`,
    [
      input.id, input.orderNumber, input.paymongoRefundId, input.paymentId,
      input.requestKeyHash, input.providerIdempotencyKey, input.amountCents, input.currency,
      input.reason, input.notes, input.status, Boolean(input.livemode),
      input.providerCreatedAt || null, input.providerUpdatedAt || null
    ]
  );
  return rowRefund(result.rows[0]);
}

async function appendPaymentOperationEvent(input, options = {}) {
  if (!hasDatabaseUrl()) return null;
  const record = {
    id: crypto.randomUUID(), provider: input.provider || 'paymongo', eventType: input.eventType,
    level: input.level || 'info', orderNumber: input.orderNumber || '', code: input.code || '',
    message: String(input.message || '').slice(0, 500)
  };
  await executor(options).query(
    `INSERT INTO payment_operation_events (id,provider,event_type,level,order_number,code,message)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [record.id, record.provider, record.eventType, record.level, record.orderNumber, record.code, record.message]
  );
  return record;
}

function paymentOperationRow(row) {
  return {
    orderNumber: row.order_number,
    placedAt: iso(row.placed_at),
    updatedAt: iso(row.updated_at),
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    totalCents: Number(row.total_cents || 0),
    paidAmountCents: row.paid_amount_cents === null ? null : Number(row.paid_amount_cents),
    paidAt: iso(row.paid_at),
    paymentExpiresAt: iso(row.payment_expires_at),
    checkoutSessionId: row.provider_checkout_session_id || '',
    paymentId: row.provider_payment_id || '',
    refundedAmountCents: Number(row.refunded_amount_cents || 0),
    refundPendingAmountCents: Number(row.refund_pending_amount_cents || 0),
    latestRefundStatus: row.latest_refund_status || '',
    pancakeOrderId: row.pancake_order_id || '',
    pancakeSyncStatus: row.pancake_sync_status || 'not_linked'
  };
}

async function listPaymentOperations({ status = '', search = '', limit = 500 } = {}) {
  if (!hasDatabaseUrl()) {
    const orders = await listOrders();
    return orders.filter((order) => order.paymentMethod === 'paymongo').map((order) => ({
      orderNumber: order.orderNumber, placedAt: order.placedAt, updatedAt: order.updatedAt,
      paymentMethod: order.paymentMethod, paymentStatus: order.paymentStatus,
      totalCents: Number(order.totalCents || 0), paidAmountCents: order.paidAmountCents,
      paidAt: order.paidAt || '', paymentExpiresAt: order.paymentExpiresAt || '',
      checkoutSessionId: order.providerCheckoutSessionId || '', paymentId: order.providerPaymentId || '',
      refundedAmountCents: 0, refundPendingAmountCents: 0, latestRefundStatus: '',
      pancakeOrderId: '', pancakeSyncStatus: 'not_linked'
    }));
  }
  const values = [];
  const where = ["o.payment_provider='paymongo'"];
  if (status) { values.push(status); where.push(`o.payment_status=$${values.length}`); }
  if (search) { values.push(`%${search}%`); where.push(`(o.order_number ILIKE $${values.length} OR o.provider_payment_id ILIKE $${values.length})`); }
  values.push(Math.max(1, Math.min(5000, Number(limit) || 500)));
  const result = await query(
    `SELECT o.order_number,o.placed_at,o.updated_at,o.payment_method,o.payment_status,o.total_cents,
       o.paid_amount_cents,o.paid_at,o.payment_expires_at,o.provider_checkout_session_id,o.provider_payment_id,
       COALESCE(r.refunded_amount_cents,0) AS refunded_amount_cents,
       COALESCE(r.refund_pending_amount_cents,0) AS refund_pending_amount_cents,
       COALESCE(r.latest_refund_status,'') AS latest_refund_status,
       COALESCE(l.pancake_order_id,'') AS pancake_order_id,
       COALESCE(l.sync_status,'not_linked') AS pancake_sync_status
     FROM orders o
     LEFT JOIN LATERAL (
       SELECT COALESCE(sum(amount_cents) FILTER (WHERE status='succeeded'),0) AS refunded_amount_cents,
         COALESCE(sum(amount_cents) FILTER (WHERE status IN ('requesting','pending','processing')),0) AS refund_pending_amount_cents,
         (array_agg(status ORDER BY created_at DESC))[1] AS latest_refund_status
       FROM paymongo_refunds WHERE order_number=o.order_number
     ) r ON true
     LEFT JOIN pancake_order_links l ON l.order_number=o.order_number
     WHERE ${where.join(' AND ')} ORDER BY o.placed_at DESC LIMIT $${values.length}`,
    values
  );
  return result.rows.map(paymentOperationRow);
}

async function listPaymentAlerts({ reservationMinutes = 30 } = {}) {
  if (!hasDatabaseUrl()) return [];
  const result = await query(
    `SELECT * FROM (
       SELECT 'stale_pending_payment' AS code,'warning' AS level,o.order_number,
         'PayMongo payment remains pending beyond its reservation window.' AS message,o.placed_at AS created_at
       FROM orders o WHERE o.payment_provider='paymongo' AND o.payment_status='pending_payment'
         AND o.placed_at < now() - ($1::integer * interval '1 minute')
       UNION ALL
       SELECT 'payment_failed','error',o.order_number,'PayMongo payment is failed or expired.',COALESCE(o.updated_at,o.placed_at)
       FROM orders o WHERE o.payment_provider='paymongo' AND o.payment_status IN ('failed','expired')
       UNION ALL
       SELECT 'payment_after_cancellation','error',o.order_number,
         'A paid PayMongo order is cancelled and requires refund review.',COALESCE(o.paid_at,o.updated_at)
       FROM orders o WHERE o.payment_provider='paymongo'
         AND o.payment_status IN ('paid','partially_refunded')
         AND (o.status='cancelled' OR o.payment_metadata->>'paymentAfterCancellation'='true')
       UNION ALL
       SELECT CASE WHEN r.status='failed' THEN 'refund_failed' ELSE 'refund_pending' END,
         CASE WHEN r.status='failed' THEN 'error' ELSE 'warning' END,r.order_number,
         CASE
           WHEN r.last_error_code='paymongo_refund_method_not_supported'
             THEN 'This payment channel requires an external customer refund; record the resolution in the order notes.'
           WHEN r.status='failed' THEN 'PayMongo refund failed and needs review.'
           ELSE 'PayMongo refund is still pending.'
         END,r.updated_at
       FROM paymongo_refunds r WHERE r.status='failed' OR (r.status IN ('requesting','pending','processing') AND r.updated_at < now() - interval '15 minutes')
       UNION ALL
       SELECT e.code,e.level,e.order_number,e.message,e.created_at FROM payment_operation_events e WHERE e.level IN ('warning','error')
     ) alerts ORDER BY created_at DESC LIMIT 100`,
    [Math.max(1, Number(reservationMinutes) || 30)]
  );
  return result.rows.map((row) => ({
    code: row.code, level: row.level, orderNumber: row.order_number || '',
    message: row.message, createdAt: iso(row.created_at)
  }));
}

module.exports = {
  appendPaymentOperationEvent,
  createRefundAttempt,
  findRefundById,
  listOrderRefunds,
  listPaymentAlerts,
  listPaymentOperations,
  rowRefund,
  updateRefund,
  upsertWebhookRefund
};
