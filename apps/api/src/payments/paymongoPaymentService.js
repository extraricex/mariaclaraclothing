const crypto = require('node:crypto');
const { transaction, query } = require('../db/postgres');
const { findOrderByNumber, updateOrder } = require('../orders/orderRepository');
const { restockVariantStock } = require('../products/catalogRepository');
const { appendInventoryMovements } = require('../inventory/inventoryMovementRepository');
const pancakeInventoryOutboxRepository = require('../integrations/pancake/pancakeInventoryOutboxRepository');
const pancakeOrderSyncRepository = require('../integrations/pancake/pancakeOrderSyncRepository');
const { buildMetaPurchaseEvent } = require('../marketing/metaEvent');
const { insertMetaPurchaseOutbox } = require('../marketing/marketingEventOutboxRepository');

function withOrderParam(base, orderNumber, extra = {}) {
  const url = new URL(base);
  url.searchParams.set('order', orderNumber);
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
  return url.toString();
}

function checkoutSessionPayload(order, config) {
  return {
    data: {
      attributes: {
        line_items: [{
          name: `Maria Clara Clothing order ${order.orderNumber}`,
          description: (order.items || []).map((item) => `${item.productName} (${item.size}) x${item.quantity}`).join(', ').slice(0, 500),
          amount: Number(order.totalCents), currency: 'PHP', quantity: 1
        }],
        payment_method_types: config.paymentMethodTypes,
        success_url: withOrderParam(config.successUrl, order.orderNumber, { payment: 'success' }),
        cancel_url: withOrderParam(config.cancelUrl, order.orderNumber, { payment: 'cancelled' }),
        reference_number: order.orderNumber,
        send_email_receipt: Boolean(order.customer?.email),
        show_line_items: true,
        show_description: true,
        metadata: { order_number: order.orderNumber }
      }
    }
  };
}

async function attachCheckoutSession(order, session, config) {
  const expiresAt = order.paymentExpiresAt || new Date(Date.now() + config.reservationMinutes * 60_000).toISOString();
  return updateOrder(order.orderNumber, {
    paymentMethod: 'paymongo', paymentStatus: 'pending_payment', status: 'pending_payment',
    paymentProvider: 'paymongo', providerCheckoutSessionId: session.id,
    paymentExpiresAt: expiresAt, inventoryReservationStatus: 'reserved',
    paymentMetadata: { ...(order.paymentMetadata || {}), checkoutUrl: session.checkoutUrl, livemode: config.livemode }
  });
}

function parsePaidEvent(payload) {
  const envelope = payload?.data || {};
  const eventType = String(envelope?.attributes?.type || envelope?.type || payload?.type || '');
  const session = envelope?.attributes?.data || envelope?.data || {};
  const attributes = session.attributes || {};
  const payment = (attributes.payments || []).find((item) => item?.attributes?.status === 'paid') || (attributes.payments || [])[0] || {};
  const paymentAttributes = payment.attributes || {};
  const digest = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return {
    eventId: String(envelope?.id || payload?.id || payload?.event_id || `${eventType}:${session.id || digest}`),
    eventType,
    checkoutSessionId: String(session.id || ''),
    orderNumber: String(attributes.reference_number || attributes.metadata?.order_number || ''),
    paymentId: String(payment.id || ''),
    amountCents: Number(paymentAttributes.amount),
    currency: String(paymentAttributes.currency || '').toUpperCase(),
    paidAt: paymentAttributes.paid_at ? new Date(Number(paymentAttributes.paid_at) * 1000).toISOString() : new Date().toISOString(),
    digest
  };
}

function restockItems(order) {
  return (order.items || []).map((item) => ({
    slug: String(item.productId || '').replace(/^catalog-/, ''), sku: item.sku,
    size: item.size, productName: item.productName, quantity: Number(item.quantity || 0)
  })).filter((item) => item.slug && item.sku && item.quantity > 0);
}

async function processPaidWebhook(payload, { metaEnabled = false } = {}) {
  const event = parsePaidEvent(payload);
  if (event.eventType !== 'checkout_session.payment.paid') return { status: 'ignored', eventType: event.eventType };
  if (!event.orderNumber || !event.checkoutSessionId || !event.paymentId) {
    const error = new Error('PayMongo paid webhook is incomplete.'); error.status = 400; error.code = 'paymongo_webhook_invalid'; throw error;
  }
  const result = await transaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO paymongo_webhook_events (event_id,event_type,order_number,payload_digest)
       VALUES ($1,$2,$3,$4) ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
      [event.eventId,event.eventType,event.orderNumber,event.digest]
    );
    if (!inserted.rowCount) return { status: 'duplicate', orderNumber: event.orderNumber };
    const order = await findOrderByNumber(event.orderNumber, { client, forUpdate: true, includeRelated: false });
    if (!order || order.paymentProvider !== 'paymongo' || order.providerCheckoutSessionId !== event.checkoutSessionId) {
      const error = new Error('PayMongo order reference does not match.'); error.status = 409; error.code = 'paymongo_order_mismatch'; throw error;
    }
    if (event.currency !== 'PHP' || !Number.isInteger(event.amountCents) || event.amountCents !== Number(order.totalCents)) {
      const error = new Error('PayMongo paid amount does not match the order total.'); error.status = 409; error.code = 'paymongo_amount_mismatch'; throw error;
    }
    if (order.paymentStatus === 'paid') return { status: 'duplicate', orderNumber: order.orderNumber, order };
    const updated = await updateOrder(order.orderNumber, {
      status: 'confirmed', paymentMethod: 'paymongo', paymentStatus: 'paid', providerPaymentId: event.paymentId,
      paidAmountCents: event.amountCents, paidAt: event.paidAt, inventoryReservationStatus: 'committed'
    }, { client, existingOrder: order });
    if (metaEnabled) {
      await insertMetaPurchaseOutbox(client, buildMetaPurchaseEvent({
        order: updated, requestContext: order.paymentMetadata?.metaRequestContext || {}
      }));
    }
    return { status: 'paid', orderNumber: updated.orderNumber, order: updated };
  });
  if (result.status === 'paid') {
    const link = await pancakeOrderSyncRepository.getOrderSyncDetail(result.orderNumber);
    await pancakeOrderSyncRepository.enqueueSyncEvent({
      direction: 'outbound', entityType: 'order', entityId: result.orderNumber,
      orderNumber: result.orderNumber, eventKey: `paymongo-paid:${event.paymentId}`,
      pancakeOrderId: link.pancakeOrderId || '',
      payload: { changedFields: ['paymentStatus'], source: 'paymongo' }
    });
  }
  return result;
}

function paidSessionPayload(session) {
  const payment = (session?.attributes?.payments || []).find((item) => item?.attributes?.status === 'paid');
  if (!payment) return null;
  return {
    data: {
      id: `reconcile_${session.id}_${payment.id}`,
      type: 'event',
      attributes: { type: 'checkout_session.payment.paid', data: session }
    }
  };
}

async function reconcilePendingPayments({ client, limit = 50, metaEnabled = false } = {}) {
  if (!client?.retrieveCheckoutSession) return { checkedCount: 0, paidCount: 0, failedCount: 0 };
  const pending = await query(
    `SELECT order_number,provider_checkout_session_id FROM orders
      WHERE payment_provider='paymongo' AND payment_status='pending_payment'
        AND provider_checkout_session_id<>'' ORDER BY placed_at LIMIT $1`,
    [limit]
  );
  const summary = { checkedCount: 0, paidCount: 0, failedCount: 0 };
  for (const row of pending.rows) {
    summary.checkedCount += 1;
    try {
      const session = await client.retrieveCheckoutSession(row.provider_checkout_session_id);
      const payload = paidSessionPayload(session);
      if (!payload) continue;
      const result = await processPaidWebhook(payload, { metaEnabled });
      if (['paid', 'duplicate'].includes(result.status)) summary.paidCount += 1;
    } catch (_error) {
      summary.failedCount += 1;
    }
  }
  return summary;
}

async function releaseExpiredReservations({ now = new Date(), limit = 50, client } = {}) {
  const due = await query(
    `SELECT order_number FROM orders WHERE payment_method='paymongo' AND payment_status='pending_payment'
      AND inventory_reservation_status='reserved' AND payment_expires_at<= $1
      ORDER BY payment_expires_at LIMIT $2`,
    [now.toISOString(), limit]
  );
  const released = [];
  for (const row of due.rows) {
    if (!client?.retrieveCheckoutSession) continue;
    let session;
    try {
      session = await client.retrieveCheckoutSession(row.provider_checkout_session_id);
      const paidPayload = paidSessionPayload(session);
      if (paidPayload) {
        await processPaidWebhook(paidPayload);
        continue;
      }
    } catch (_error) {
      continue;
    }
    if (session.attributes?.status !== 'expired') continue;
    const outcome = await transaction(async (client) => {
      const order = await findOrderByNumber(row.order_number, { client, forUpdate: true, includeRelated: false });
      if (!order || order.paymentStatus !== 'pending_payment' || order.inventoryReservationStatus !== 'reserved') return null;
      const items = restockItems(order);
      await restockVariantStock(items, { client });
      await appendInventoryMovements(items.map((item) => ({
        orderNumber: order.orderNumber, source: 'paymongo', reason: 'payment_expired',
        productSlug: item.slug, productName: item.productName, sku: item.sku, size: item.size,
        quantityChange: item.quantity
      })), { client });
      await pancakeInventoryOutboxRepository.enqueueInventorySync([...new Set(items.map((item) => item.slug))], 'website_order', { client });
      return updateOrder(order.orderNumber, {
        status: 'cancelled', paymentStatus: 'expired', inventoryReservationStatus: 'released'
      }, { client, existingOrder: order });
    });
    if (outcome) released.push(outcome.orderNumber);
  }
  return { releasedCount: released.length, orderNumbers: released };
}

module.exports = {
  attachCheckoutSession, checkoutSessionPayload, parsePaidEvent, processPaidWebhook,
  paidSessionPayload, reconcilePendingPayments, releaseExpiredReservations, restockItems, withOrderParam
};
