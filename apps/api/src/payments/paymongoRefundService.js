const crypto = require('node:crypto');
const { hasDatabaseUrl, query, transaction } = require('../db/postgres');
const { appendOrderStatusEvent, findOrderByNumber, updateOrder } = require('../orders/orderRepository');
const pancakeOrderSyncRepository = require('../integrations/pancake/pancakeOrderSyncRepository');
const refundRepository = require('./paymongoRefundRepository');

const REFUND_REASONS = new Set(['duplicate', 'fraudulent', 'others']);
const REFUND_STATUSES = new Set(['pending', 'processing', 'succeeded', 'failed']);

function serviceError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function timestamp(value) {
  if (!value) return '';
  if (Number.isFinite(Number(value))) return new Date(Number(value) * 1000).toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? '' : parsed.toISOString();
}

function normalizeRefundStatus(value, eventType = '') {
  const status = String(value || '').toLowerCase();
  if (REFUND_STATUSES.has(status)) return status;
  return eventType === 'payment.refunded' ? 'succeeded' : 'pending';
}

function parseRefundEvent(payload) {
  const envelope = payload?.data || {};
  const envelopeAttributes = envelope.attributes || {};
  const eventType = String(envelopeAttributes.type || envelope.type || payload?.type || '');
  const resource = envelopeAttributes.data || envelope.data || {};
  const resourceAttributes = resource.attributes || {};
  const refunds = resourceAttributes.refunds?.data || resourceAttributes.refunds || [];
  const nestedRefund = Array.isArray(refunds) ? refunds[0] || {} : {};
  const refund = resource.type === 'refund' ? resource : nestedRefund;
  const attributes = refund.attributes || resourceAttributes;
  const digest = sha256(JSON.stringify(payload));
  return {
    eventId: String(envelope.id || payload?.id || `${eventType}:${refund.id || digest}`),
    eventType,
    refundId: String(refund.id || ''),
    paymentId: String(attributes.payment_id || resourceAttributes.payment_id || (resource.type === 'payment' ? resource.id : '')),
    amountCents: Number(attributes.amount),
    currency: String(attributes.currency || 'PHP').toUpperCase(),
    reason: REFUND_REASONS.has(String(attributes.reason || '')) ? String(attributes.reason) : 'others',
    notes: String(attributes.notes || '').slice(0, 255),
    status: normalizeRefundStatus(attributes.status, eventType),
    livemode: Boolean(envelopeAttributes.livemode ?? resourceAttributes.livemode),
    providerCreatedAt: timestamp(attributes.created_at),
    providerUpdatedAt: timestamp(attributes.updated_at),
    digest
  };
}

function refundResult(resource) {
  const attributes = resource?.attributes || {};
  return {
    paymongoRefundId: String(resource?.id || ''),
    status: normalizeRefundStatus(attributes.status),
    providerCreatedAt: timestamp(attributes.created_at),
    providerUpdatedAt: timestamp(attributes.updated_at),
    lastErrorCode: ''
  };
}

async function refundedTotals(orderNumber, client) {
  const result = await client.query(
    `SELECT COALESCE(sum(amount_cents) FILTER (WHERE status='succeeded'),0)::integer AS succeeded,
       COALESCE(sum(amount_cents) FILTER (WHERE status IN ('requesting','pending','processing')),0)::integer AS inflight
     FROM paymongo_refunds WHERE order_number=$1`,
    [orderNumber]
  );
  return { succeeded: Number(result.rows[0]?.succeeded || 0), inflight: Number(result.rows[0]?.inflight || 0) };
}

async function finalizeRefundedOrder(orderNumber, { client, refundId, source = 'paymongo' }) {
  const order = await findOrderByNumber(orderNumber, { client, forUpdate: true, includeRelated: false });
  if (!order) throw serviceError('paymongo_order_not_found', 'Order not found.', 404);
  const totals = await refundedTotals(orderNumber, client);
  const paidAmount = Number(order.paidAmountCents || order.totalCents || 0);
  const paymentStatus = totals.succeeded >= paidAmount ? 'refunded' : 'partially_refunded';
  if (order.paymentStatus !== paymentStatus) {
    await updateOrder(orderNumber, { paymentStatus }, { client, existingOrder: order });
    await appendOrderStatusEvent(orderNumber, {
      source,
      changes: { paymentStatus: { from: order.paymentStatus, to: paymentStatus } },
      note: `PayMongo refund ${refundId} succeeded. Stock was not changed automatically.`
    }, { client });
  }
  return { paymentStatus, refundedAmountCents: totals.succeeded };
}

async function queuePancakePaymentUpdate(orderNumber, refundId, paymentStatus) {
  const link = await pancakeOrderSyncRepository.getOrderSyncDetail(orderNumber);
  const event = await pancakeOrderSyncRepository.enqueueSyncEvent({
    direction: 'outbound', entityType: 'order', entityId: orderNumber, orderNumber,
    pancakeOrderId: link.pancakeOrderId || '', eventKey: `paymongo-refund:${refundId}:${paymentStatus}`,
    payload: { changedFields: ['paymentStatus'], source: 'paymongo_refund' }
  });
  if (event?.status === 'pending' && link.pancakeOrderId) {
    await pancakeOrderSyncRepository.upsertOrderLink({
      ...link, orderNumber, pancakeOrderId: link.pancakeOrderId, syncStatus: 'pending_sync',
      lastLocalUpdatedAt: new Date().toISOString()
    });
  }
  return event;
}

async function recordOperation(input) {
  try {
    return await refundRepository.appendPaymentOperationEvent(input);
  } catch (error) {
    console.error('Payment operation audit write failed:', error?.message || error);
    return null;
  }
}

function validateRefundConfig(config) {
  if (!config?.configured) throw serviceError('paymongo_not_configured', 'PayMongo is not configured.', 503);
  if (!config.livemode) {
    throw serviceError('paymongo_live_refunds_required', 'Refunds can only be submitted after PayMongo live mode is enabled.', 409);
  }
  if (!hasDatabaseUrl()) throw serviceError('payment_database_required', 'Refund operations require PostgreSQL.', 503);
}

async function requestRefund(input, { config, client }) {
  validateRefundConfig(config);
  const orderNumber = String(input.orderNumber || '').trim();
  const requestKey = String(input.requestKey || '').trim();
  const reason = String(input.reason || 'others').trim();
  const notes = String(input.notes || '').trim().slice(0, 255);
  const amountCents = Number(input.amountCents);
  if (!requestKey || requestKey.length > 255) throw serviceError('refund_idempotency_key_required', 'A valid refund request key is required.');
  if (!REFUND_REASONS.has(reason)) throw serviceError('refund_reason_invalid', 'Refund reason is invalid.');
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw serviceError('refund_amount_invalid', 'Refund amount must be greater than zero.');

  const created = await transaction(async (db) => {
    const order = await findOrderByNumber(orderNumber, { client: db, forUpdate: true, includeRelated: false });
    if (!order) throw serviceError('paymongo_order_not_found', 'Order not found.', 404);
    if (order.paymentProvider !== 'paymongo' || !order.providerPaymentId || !['paid', 'partially_refunded'].includes(order.paymentStatus)) {
      throw serviceError('paymongo_order_not_refundable', 'Only verified paid PayMongo orders can be refunded.', 409);
    }
    const totals = await refundedTotals(orderNumber, db);
    const paidAmount = Number(order.paidAmountCents || order.totalCents || 0);
    if (amountCents > paidAmount - totals.succeeded - totals.inflight) {
      throw serviceError('refund_amount_exceeds_available', 'Refund amount exceeds the remaining refundable payment.', 409);
    }
    return refundRepository.createRefundAttempt({
      id: `refund-${crypto.randomUUID()}`, orderNumber, paymentId: order.providerPaymentId,
      requestKeyHash: sha256(`${orderNumber}:${requestKey}`),
      providerIdempotencyKey: `mcc-refund-${crypto.randomUUID()}`,
      amountCents, reason, notes, livemode: true, requestedBy: 'admin'
    }, { client: db });
  });
  if (!created.created) return { status: 'duplicate', refund: created.refund };

  let provider;
  try {
    provider = await client.createRefund({
      amountCents: created.refund.amountCents,
      paymentId: created.refund.paymentId,
      reason: created.refund.reason,
      notes: created.refund.notes
    }, { idempotencyKey: created.refund.providerIdempotencyKey });
  } catch (error) {
    await refundRepository.updateRefund(created.refund.id, { status: 'failed', lastErrorCode: error.code || 'paymongo_refund_failed' });
    await recordOperation({
      eventType: 'refund_request_failed', level: 'error', orderNumber,
      code: error.code || 'paymongo_refund_failed', message: 'PayMongo refund request failed and needs review.'
    });
    throw error;
  }

  const updated = await refundRepository.updateRefund(created.refund.id, refundResult(provider));
  let orderPaymentStatus = '';
  let warning = '';
  if (updated.status === 'succeeded') {
    try {
      const finalized = await transaction((db) => finalizeRefundedOrder(orderNumber, {
        client: db, refundId: updated.paymongoRefundId, source: 'admin_refund'
      }));
      orderPaymentStatus = finalized.paymentStatus;
      await queuePancakePaymentUpdate(orderNumber, updated.paymongoRefundId, finalized.paymentStatus);
    } catch (error) {
      warning = 'Refund succeeded at PayMongo, but local follow-up needs reconciliation.';
      await recordOperation({
        eventType: 'refund_followup_failed', level: 'error', orderNumber,
        code: error.code || 'refund_followup_failed', message: warning
      });
    }
  }
  await recordOperation({
    eventType: 'refund_requested', level: 'info', orderNumber,
    code: updated.status, message: `PayMongo refund request recorded with status ${updated.status}.`
  });
  return { status: updated.status, refund: updated, orderPaymentStatus, warning };
}

async function retryRefund(refundId, { config, client }) {
  validateRefundConfig(config);
  const refund = await refundRepository.findRefundById(refundId);
  if (!refund) throw serviceError('paymongo_refund_not_found', 'Refund record not found.', 404);
  if (refund.status !== 'failed') throw serviceError('paymongo_refund_not_retryable', 'Only failed refund requests can be retried.', 409);
  if (Date.now() - new Date(refund.createdAt).valueOf() > 23 * 60 * 60 * 1000) {
    throw serviceError('paymongo_refund_reconcile_required', 'This refund is too old for a safe retry. Reconcile it in PayMongo first.', 409);
  }
  await refundRepository.updateRefund(refund.id, {
    status: 'requesting', attemptCount: refund.attemptCount + 1, lastErrorCode: ''
  });
  let provider;
  try {
    provider = await client.createRefund({
      amountCents: refund.amountCents, paymentId: refund.paymentId,
      reason: refund.reason, notes: refund.notes
    }, { idempotencyKey: refund.providerIdempotencyKey });
  } catch (error) {
    await refundRepository.updateRefund(refund.id, { status: 'failed', lastErrorCode: error.code || 'paymongo_refund_failed' });
    throw error;
  }
  const updated = await refundRepository.updateRefund(refund.id, refundResult(provider));
  let warning = '';
  if (updated.status === 'succeeded') {
    try {
      const finalized = await transaction((db) => finalizeRefundedOrder(refund.orderNumber, {
        client: db, refundId: updated.paymongoRefundId, source: 'admin_refund_retry'
      }));
      await queuePancakePaymentUpdate(refund.orderNumber, updated.paymongoRefundId, finalized.paymentStatus);
    } catch (error) {
      warning = 'Refund succeeded at PayMongo, but local follow-up needs reconciliation.';
      await recordOperation({
        eventType: 'refund_followup_failed', level: 'error', orderNumber: refund.orderNumber,
        code: error.code || 'refund_followup_failed', message: warning
      });
    }
  }
  return { status: updated.status, refund: updated, warning };
}

async function processRefundWebhook(payload, { livemode = false } = {}) {
  const event = parseRefundEvent(payload);
  if (!['payment.refunded', 'payment.refund.updated'].includes(event.eventType)) {
    return { status: 'ignored', eventType: event.eventType };
  }
  if (!event.eventId || !event.refundId || !event.paymentId || !Number.isInteger(event.amountCents) || event.amountCents <= 0) {
    throw serviceError('paymongo_refund_webhook_invalid', 'PayMongo refund webhook is incomplete.');
  }
  if (event.currency !== 'PHP' || event.livemode !== Boolean(livemode)) {
    throw serviceError('paymongo_refund_webhook_mismatch', 'PayMongo refund webhook mode or currency does not match.', 409);
  }

  const result = await transaction(async (db) => {
    const inserted = await db.query(
      `INSERT INTO paymongo_webhook_events (event_id,event_type,order_number,payload_digest)
       VALUES ($1,$2,'',$3) ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
      [event.eventId, event.eventType, event.digest]
    );
    if (!inserted.rowCount) return { status: 'duplicate', orderNumber: '', refund: null };
    const orderRow = await db.query('SELECT order_number FROM orders WHERE provider_payment_id=$1 FOR UPDATE', [event.paymentId]);
    const orderNumber = String(orderRow.rows[0]?.order_number || '');
    if (!orderNumber) throw serviceError('paymongo_refund_order_mismatch', 'PayMongo refund payment does not match an order.', 409);
    await db.query('UPDATE paymongo_webhook_events SET order_number=$1 WHERE event_id=$2', [orderNumber, event.eventId]);
    const refund = await refundRepository.upsertWebhookRefund({
      id: `refund-${crypto.randomUUID()}`, orderNumber, paymongoRefundId: event.refundId,
      paymentId: event.paymentId, requestKeyHash: sha256(`webhook:${event.refundId}`),
      providerIdempotencyKey: `webhook-${event.refundId}`,
      amountCents: event.amountCents, currency: event.currency, reason: event.reason,
      notes: event.notes, status: event.status, livemode: event.livemode,
      providerCreatedAt: event.providerCreatedAt, providerUpdatedAt: event.providerUpdatedAt
    }, { client: db });
    let orderPaymentStatus = '';
    if (refund.status === 'succeeded') {
      const finalized = await finalizeRefundedOrder(orderNumber, {
        client: db, refundId: refund.paymongoRefundId, source: 'paymongo_webhook'
      });
      orderPaymentStatus = finalized.paymentStatus;
    }
    return { status: refund.status, orderNumber, refund, orderPaymentStatus };
  });
  await recordOperation({
    eventType: 'refund_webhook_processed', level: 'info', orderNumber: result.orderNumber,
    code: result.status, message: `PayMongo refund webhook processed with status ${result.status}.`
  });
  if (result.refund?.status === 'succeeded') {
    try {
      await queuePancakePaymentUpdate(result.orderNumber, result.refund.paymongoRefundId, result.orderPaymentStatus);
    } catch (error) {
      await recordOperation({
        eventType: 'refund_pancake_queue_failed', level: 'error', orderNumber: result.orderNumber,
        code: error.code || 'refund_pancake_queue_failed',
        message: 'Refund succeeded, but the Pancake payment update could not be queued.'
      });
    }
  }
  return result;
}

module.exports = {
  normalizeRefundStatus,
  parseRefundEvent,
  processRefundWebhook,
  requestRefund,
  retryRefund
};
