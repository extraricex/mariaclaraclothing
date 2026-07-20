const crypto = require('node:crypto');
const { transaction, query } = require('../db/postgres');
const { findOrderByNumber, updateOrder } = require('../orders/orderRepository');
const { restockVariantStock } = require('../products/catalogRepository');
const { appendInventoryMovements } = require('../inventory/inventoryMovementRepository');
const pancakeInventoryOutboxRepository = require('../integrations/pancake/pancakeInventoryOutboxRepository');
const pancakeOrderSyncRepository = require('../integrations/pancake/pancakeOrderSyncRepository');
const pancakeOrderExportRepository = require('../integrations/pancake/pancakeOrderExportRepository');
const { buildMetaPurchaseEvent } = require('../marketing/metaEvent');
const { insertMetaPurchaseOutbox } = require('../marketing/marketingEventOutboxRepository');
const { queueMetaPurchase } = require('../marketing/metaPurchaseService');
const { enqueueAdminPaymentConfirmationEmail } = require('../notifications/adminOrderEmailNotificationService');
const { enqueueOrderConfirmationNotifications } = require('../notifications/orderNotificationService');
const {
  deliveryInformationIssues,
  requireCompleteDeliveryInformation
} = require('../checkout/deliveryDetails');

function withOrderParam(base, orderNumber, extra = {}) {
  const url = new URL(base);
  url.searchParams.set('order', orderNumber);
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
  return url.toString();
}

function checkoutSessionPayload(order, config) {
  // Defensive boundary: never contact PayMongo for an order whose delivery
  // data is incomplete, even if a caller bypasses the normal checkout route.
  requireCompleteDeliveryInformation({ customer: order.customer, address: order.address });
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

async function attachCheckoutSession(order, session, config, options = {}) {
  const expiresAt = order.paymentExpiresAt || new Date(Date.now() + config.reservationMinutes * 60_000).toISOString();
  return updateOrder(order.orderNumber, {
    paymentMethod: 'paymongo', paymentStatus: 'pending_payment', status: 'pending_payment',
    paymentProvider: 'paymongo', providerCheckoutSessionId: session.id,
    paymentExpiresAt: expiresAt, inventoryReservationStatus: 'reserved',
    paymentMetadata: { ...(order.paymentMetadata || {}), checkoutUrl: session.checkoutUrl, livemode: config.livemode }
  }, options);
}

async function ensureCheckoutSession(orderNumber, {
  client,
  config,
  transactionFn = transaction,
  findOrder = findOrderByNumber,
  attachSession = attachCheckoutSession,
  updateOrderRecord = updateOrder,
  now = () => new Date()
} = {}) {
  if (!client || !config) throw new Error('PayMongo client and configuration are required.');
  return transactionFn(async (databaseClient) => {
    const order = await findOrder(orderNumber, {
      client: databaseClient,
      forUpdate: true,
      includeRelated: false
    });
    if (!order) {
      const error = new Error('PayMongo order was not found.');
      error.status = 404;
      error.code = 'order_not_found';
      throw error;
    }
    const currentTime = now();
    const expiresAt = new Date(order.paymentExpiresAt || 0);
    const awaitingPayment = (order.paymentMethod === 'paymongo' || order.paymentProvider === 'paymongo')
      && order.paymentStatus === 'pending_payment'
      && order.status === 'pending_payment'
      && order.inventoryReservationStatus === 'reserved';
    const reservationExpired = Number.isFinite(expiresAt.getTime()) && expiresAt <= currentTime;
    if (!awaitingPayment || reservationExpired) {
      const error = new Error('This PayMongo checkout is no longer active. Start a new checkout.');
      error.status = 409;
      error.code = reservationExpired ? 'paymongo_checkout_expired' : 'paymongo_checkout_not_active';
      throw error;
    }
    const existingUrl = String(order.paymentMetadata?.checkoutUrl || '').trim();
    if (order.providerCheckoutSessionId && existingUrl) {
      return { order, checkoutUrl: existingUrl, reused: true };
    }
    if (order.providerCheckoutSessionId && !existingUrl) {
      const existingSession = await client.retrieveCheckoutSession(order.providerCheckoutSessionId);
      const providerStatus = String(existingSession?.attributes?.status || '').trim().toLowerCase();
      if (providerStatus && providerStatus !== 'active') {
        const error = new Error('The existing PayMongo checkout needs reconciliation before it can be reused.');
        error.status = 409;
        error.code = 'paymongo_checkout_reconciliation_required';
        throw error;
      }
      const recoveredUrl = String(existingSession?.attributes?.checkout_url || '').trim();
      if (recoveredUrl.startsWith('https://')) {
        const updated = await updateOrderRecord(order.orderNumber, {
          paymentMetadata: {
            ...(order.paymentMetadata || {}),
            checkoutUrl: recoveredUrl,
            livemode: config.livemode
          }
        }, { client: databaseClient, existingOrder: order });
        return { order: updated, checkoutUrl: recoveredUrl, reused: true };
      }
      const error = new Error('PayMongo did not return the existing checkout URL.');
      error.status = 502;
      error.code = 'paymongo_checkout_url_unavailable';
      throw error;
    }

    // The database row lock prevents simultaneous API requests from creating
    // two provider sessions. The stable provider key also protects a retry if
    // PayMongo accepted the request before the local transaction completed.
    const session = await client.createCheckoutSession(
      checkoutSessionPayload(order, config),
      { idempotencyKey: `paymongo-checkout-${order.orderNumber}` }
    );
    const updated = await attachSession(order, session, config, {
      client: databaseClient,
      existingOrder: order
    });
    return { order: updated, checkoutUrl: session.checkoutUrl, reused: false };
  });
}

function parsePaidEvent(payload) {
  const envelope = payload?.data || {};
  const eventType = String(envelope?.attributes?.type || envelope?.type || payload?.type || '');
  const session = envelope?.attributes?.data || envelope?.data || {};
  const attributes = session.attributes || {};
  const payment = (attributes.payments || []).find((item) => item?.attributes?.status === 'paid') || (attributes.payments || [])[0] || {};
  const paymentAttributes = payment.attributes || {};
  const paymentMethodType = String(
    attributes.payment_method_used || paymentAttributes.source?.type || paymentAttributes.payment_method_type || ''
  ).trim().toLowerCase();
  const digest = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return {
    eventId: String(envelope?.id || payload?.id || payload?.event_id || `${eventType}:${session.id || digest}`),
    eventType,
    checkoutSessionId: String(session.id || ''),
    orderNumber: String(attributes.reference_number || attributes.metadata?.order_number || ''),
    paymentId: String(payment.id || ''),
    amountCents: Number(paymentAttributes.amount),
    currency: String(paymentAttributes.currency || '').toUpperCase(),
    paymentMethodType,
    livemode: Boolean(attributes.livemode ?? paymentAttributes.livemode),
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

async function processPaidWebhook(payload, {
  metaEnabled = false,
  enqueuePaymentConfirmation = enqueueAdminPaymentConfirmationEmail,
  enqueueAdminEmail,
  enqueueCustomerConfirmation = enqueueOrderConfirmationNotifications
} = {}) {
  const event = parsePaidEvent(payload);
  if (event.eventType !== 'checkout_session.payment.paid') return { status: 'ignored', eventType: event.eventType };
  if (!event.orderNumber || !event.checkoutSessionId || !event.paymentId) {
    const error = new Error('PayMongo paid webhook is incomplete.'); error.status = 400; error.code = 'paymongo_webhook_invalid'; throw error;
  }
  const result = await transaction((client) => applyPaidWebhookEvent(event, {
    client,
    metaEnabled,
    enqueuePaymentConfirmation: enqueueAdminEmail || enqueuePaymentConfirmation,
    enqueueCustomerConfirmation
  }));
  if (result.status === 'paid' || result.status === 'duplicate') {
    const paidOrder = result.order || await findOrderByNumber(result.orderNumber, { includeRelated: false });
    if (paidOrder) await pancakeOrderExportRepository.enqueueOrderExport(paidOrder);
    await pancakeOrderSyncRepository.backfillSentOrderExportLinks?.({ limit: 100 });
    const link = await pancakeOrderSyncRepository.getOrderSyncDetail(result.orderNumber);
    const syncEvent = await pancakeOrderSyncRepository.enqueueSyncEvent({
      direction: 'outbound', entityType: 'order', entityId: result.orderNumber,
      orderNumber: result.orderNumber, eventKey: `paymongo-paid:${event.paymentId}`,
      pancakeOrderId: link.pancakeOrderId || '',
      payload: { changedFields: ['paymentMethod', 'paymentStatus', 'status'], source: 'paymongo' }
    });
    if (syncEvent?.status === 'pending' && link.pancakeOrderId) {
      await pancakeOrderSyncRepository.upsertOrderLink({
        ...link,
        orderNumber: result.orderNumber,
        pancakeOrderId: link.pancakeOrderId,
        syncStatus: 'pending_sync',
        lastLocalUpdatedAt: result.order?.updatedAt || new Date().toISOString()
      });
      await pancakeOrderSyncRepository.appendSyncLog({
        direction: 'outbound', entityType: 'order', entityId: result.orderNumber,
        orderNumber: result.orderNumber, pancakeOrderId: link.pancakeOrderId,
        level: 'info', code: 'pancake_order_payment_update_queued',
        message: 'Verified PayMongo payment queued for Pancake POS.'
      });
    } else if (syncEvent?.status === 'pending') {
      await pancakeOrderSyncRepository.appendSyncLog({
        direction: 'outbound', entityType: 'order', entityId: result.orderNumber,
        orderNumber: result.orderNumber, level: 'warning', code: 'pancake_order_link_missing',
        message: 'PayMongo payment could not be linked to a Pancake order.'
      });
    }
  }
  return result;
}

async function applyPaidWebhookEvent(event, {
  client,
  metaEnabled = false,
  enqueuePaymentConfirmation = enqueueAdminPaymentConfirmationEmail,
  enqueueAdminEmail,
  enqueueCustomerConfirmation = enqueueOrderConfirmationNotifications,
  findOrder = findOrderByNumber,
  updateOrderRecord = updateOrder,
  buildMetaEvent = buildMetaPurchaseEvent,
  insertMetaEvent = insertMetaPurchaseOutbox,
  metaLogger = console
} = {}) {
  const inserted = await client.query(
    `INSERT INTO paymongo_webhook_events (event_id,event_type,order_number,payload_digest)
     VALUES ($1,$2,$3,$4) ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
    [event.eventId,event.eventType,event.orderNumber,event.digest]
  );
  if (!inserted.rowCount) return { status: 'duplicate', orderNumber: event.orderNumber };
  const order = await findOrder(event.orderNumber, { client, forUpdate: true, includeRelated: false });
  if (!order || order.paymentProvider !== 'paymongo' || order.providerCheckoutSessionId !== event.checkoutSessionId) {
    const error = new Error('PayMongo order reference does not match.'); error.status = 409; error.code = 'paymongo_order_mismatch'; throw error;
  }
  if (event.currency !== 'PHP' || !Number.isInteger(event.amountCents) || event.amountCents !== Number(order.totalCents)) {
    const error = new Error('PayMongo paid amount does not match the order total.'); error.status = 409; error.code = 'paymongo_amount_mismatch'; throw error;
  }
  if (order.paymentStatus === 'paid') {
    const paymentMetadata = event.paymentMethodType && order.paymentMetadata?.paymentMethodType !== event.paymentMethodType
      ? { ...(order.paymentMetadata || {}), paymentMethodType: event.paymentMethodType, providerLivemode: event.livemode }
      : order.paymentMetadata;
    const duplicateOrder = paymentMetadata !== order.paymentMetadata
      ? await updateOrderRecord(order.orderNumber, { paymentMetadata }, { client, existingOrder: order })
      : order;
    return { status: 'duplicate', orderNumber: order.orderNumber, order: duplicateOrder };
  }
  const paidAfterCancellation = order.status === 'cancelled'
    || order.paymentStatus === 'cancelled'
    || order.inventoryReservationStatus === 'released';
  const missingDeliveryFields = deliveryInformationIssues(order);
  const deliveryComplete = Object.keys(missingDeliveryFields).length === 0;
  const updated = await updateOrderRecord(order.orderNumber, {
    status: paidAfterCancellation ? 'cancelled' : (deliveryComplete ? 'confirmed' : 'received'),
    paymentMethod: 'paymongo', paymentStatus: 'paid', providerPaymentId: event.paymentId,
    paidAmountCents: event.amountCents, paidAt: event.paidAt,
    inventoryReservationStatus: paidAfterCancellation ? 'released' : 'committed',
    tags: deliveryComplete
      ? (order.tags || []).filter((tag) => tag !== 'missing_delivery_information')
      : [...new Set([...(order.tags || []), 'missing_delivery_information'])],
    paymentMetadata: {
      ...(order.paymentMetadata || {}),
      paymentMethodType: event.paymentMethodType,
      providerLivemode: event.livemode,
      ...(deliveryComplete ? {} : {
        deliveryInformationIncomplete: true,
        missingDeliveryFields: Object.keys(missingDeliveryFields)
      }),
      ...(paidAfterCancellation ? { paymentAfterCancellation: true } : {})
    }
  }, { client, existingOrder: order });
  if (metaEnabled && !paidAfterCancellation && deliveryComplete) {
    await queueMetaPurchase({
      client,
      order: updated,
      requestContext: order.paymentMetadata?.metaRequestContext || {},
      enabled: true
    }, {
      buildEvent: buildMetaEvent,
      insertEvent: insertMetaEvent,
      logger: metaLogger
    });
  }
  if (!paidAfterCancellation && deliveryComplete) {
    await (enqueueAdminEmail || enqueuePaymentConfirmation)(updated, { client });
    await enqueueCustomerConfirmation(updated, { client });
  }
  return { status: 'paid', orderNumber: updated.orderNumber, order: updated };
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
      WHERE payment_provider='paymongo' AND payment_status IN ('pending_payment','cod_pending')
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

async function closeCheckoutSessionForExpiry(client, checkoutSessionId) {
  if (!client?.retrieveCheckoutSession || !client?.expireCheckoutSession) return { status: 'retry' };
  let session = await client.retrieveCheckoutSession(checkoutSessionId);
  const paidPayload = paidSessionPayload(session);
  if (paidPayload) return { status: 'paid', paidPayload, session };
  if (String(session.attributes?.status || '') === 'active') {
    session = await client.expireCheckoutSession(checkoutSessionId);
  }
  return {
    status: String(session.attributes?.status || '') === 'expired' ? 'expired' : 'retry',
    session
  };
}

async function queueExpiredPancakeCancellation(order, {
  syncRepository = pancakeOrderSyncRepository
} = {}) {
  const orderNumber = String(order?.orderNumber || '').trim();
  if (!orderNumber) return { status: 'skipped', reason: 'order_number_missing' };
  const link = await syncRepository.getOrderSyncDetail(orderNumber);
  if (!String(link?.pancakeOrderId || '').trim()) {
    await syncRepository.appendSyncLog({
      direction: 'outbound', entityType: 'order', entityId: orderNumber,
      orderNumber, level: 'info', code: 'pancake_order_not_exported_unpaid',
      message: 'Expired unpaid PayMongo checkout was not exported to Pancake POS.'
    });
    return { status: 'skipped', reason: 'pancake_order_not_exported_unpaid' };
  }
  const syncEvent = await syncRepository.enqueueSyncEvent({
    direction: 'outbound', entityType: 'order', entityId: orderNumber,
    orderNumber, pancakeOrderId: link.pancakeOrderId,
    eventKey: `paymongo-expired:${orderNumber}`,
    payload: { changedFields: ['paymentStatus', 'status'], source: 'paymongo' }
  });
  if (syncEvent?.status === 'pending') {
    await syncRepository.upsertOrderLink({
      ...link,
      orderNumber,
      pancakeOrderId: link.pancakeOrderId,
      syncStatus: 'pending_sync',
      lastLocalUpdatedAt: order.updatedAt || new Date().toISOString()
    });
    await syncRepository.appendSyncLog({
      direction: 'outbound', entityType: 'order', entityId: orderNumber,
      orderNumber, pancakeOrderId: link.pancakeOrderId,
      level: 'info', code: 'pancake_order_expiration_queued',
      message: 'Expired PayMongo order cancellation queued for Pancake POS.'
    });
  }
  return { status: syncEvent?.status || 'duplicate', pancakeOrderId: link.pancakeOrderId };
}

async function releaseExpiredReservations({
  now = new Date(), limit = 50, client, orderNumbers = [],
  orderExportRepository = pancakeOrderExportRepository,
  orderSyncRepository = pancakeOrderSyncRepository
} = {}) {
  const selected = [...new Set((Array.isArray(orderNumbers) ? orderNumbers : [])
    .map((value) => String(value || '').trim()).filter(Boolean))];
  const due = await query(
    `SELECT order_number,provider_checkout_session_id FROM orders
      WHERE payment_method='paymongo' AND provider_checkout_session_id<>''
        AND (
          (payment_status='pending_payment' AND inventory_reservation_status='reserved' AND payment_expires_at<= $1)
          OR (status='cancelled' AND payment_status='cancelled'
            AND COALESCE(payment_metadata->>'checkoutSessionExpiredAt','')='')
        )
        AND ($2::text[]='{}'::text[] OR order_number=ANY($2::text[]))
      ORDER BY payment_expires_at NULLS FIRST LIMIT $3`,
    [now.toISOString(), selected, limit]
  );
  const released = [];
  const expiredSessions = [];
  for (const row of due.rows) {
    let disposition;
    try {
      disposition = await closeCheckoutSessionForExpiry(client, row.provider_checkout_session_id);
      if (disposition.status === 'paid') {
        await processPaidWebhook(disposition.paidPayload);
        continue;
      }
    } catch (_error) {
      continue;
    }
    if (disposition.status !== 'expired') continue;
    const outcome = await transaction(async (client) => {
      const order = await findOrderByNumber(row.order_number, { client, forUpdate: true, includeRelated: false });
      if (!order) return null;
      const paymentMetadata = {
        ...(order.paymentMetadata || {}),
        checkoutSessionExpiredAt: new Date().toISOString()
      };
      if (order.paymentStatus === 'pending_payment' && order.inventoryReservationStatus === 'reserved') {
        const items = restockItems(order);
        await restockVariantStock(items, { client });
        await appendInventoryMovements(items.map((item) => ({
          orderNumber: order.orderNumber, source: 'paymongo', reason: 'payment_expired',
          productSlug: item.slug, productName: item.productName, sku: item.sku, size: item.size,
          quantityChange: item.quantity
        })), { client });
        await pancakeInventoryOutboxRepository.enqueueInventorySync([...new Set(items.map((item) => item.slug))], 'website_order', { client });
        const updated = await updateOrder(order.orderNumber, {
          status: 'cancelled', paymentStatus: 'expired', inventoryReservationStatus: 'released', paymentMetadata
        }, { client, existingOrder: order });
        await orderExportRepository.markOrderExportSkipped(
          order.orderNumber, 'paymongo_payment_expired', { client }
        );
        return { order: updated, releasedInventory: true };
      }
      if (order.status === 'cancelled' && order.paymentStatus === 'cancelled') {
        const updated = await updateOrder(order.orderNumber, { paymentMetadata }, { client, existingOrder: order });
        await orderExportRepository.markOrderExportSkipped(
          order.orderNumber, 'paymongo_payment_cancelled', { client }
        );
        return { order: updated, releasedInventory: false };
      }
      return null;
    });
    if (outcome) {
      expiredSessions.push(outcome.order.orderNumber);
      if (outcome.releasedInventory) {
        released.push(outcome.order.orderNumber);
        await queueExpiredPancakeCancellation(outcome.order, { syncRepository: orderSyncRepository });
      }
    }
  }
  return {
    releasedCount: released.length,
    expiredSessionCount: expiredSessions.length,
    orderNumbers: released
  };
}

module.exports = {
  applyPaidWebhookEvent, attachCheckoutSession, checkoutSessionPayload, closeCheckoutSessionForExpiry, ensureCheckoutSession, parsePaidEvent, processPaidWebhook,
  paidSessionPayload, queueExpiredPancakeCancellation, reconcilePendingPayments, releaseExpiredReservations, restockItems, withOrderParam
};
