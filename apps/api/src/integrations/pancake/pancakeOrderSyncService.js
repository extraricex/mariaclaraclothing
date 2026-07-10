const crypto = require('node:crypto');

const orderRepositoryDefault = require('../../orders/orderRepository');
const syncRepositoryDefault = require('./pancakeOrderSyncRepository');
const {
  buildPancakeOrderUpdatePayload,
  normalizePancakeOrder
} = require('./pancakeOrderMapper');

function hashObject(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value || {})).digest('hex');
}

function inboundEventKey(normalized) {
  return [
    normalized.pancakeOrderId,
    normalized.pancakeUpdatedAt || '',
    normalized.status || '',
    normalized.trackingNumber || ''
  ].join(':');
}

function safeProviderCode(error) {
  const code = String(error?.code || '');
  return /^pancake_[a-z_]+$/.test(code) ? code : 'pancake_order_sync_failed';
}

function retryDelayMs(attempt) {
  return Math.min(60 * 60 * 1000, 60 * 1000 * (2 ** Math.max(0, attempt - 1)));
}

function importedOrder(normalized, now) {
  const placedAt = normalized.pancakeUpdatedAt || now().toISOString();
  return {
    orderNumber: normalized.orderNumber,
    customer: normalized.customer,
    address: normalized.address,
    items: normalized.items,
    subtotalCents: normalized.subtotalCents,
    discountTotalCents: normalized.discountTotalCents,
    discountCode: '',
    discountSnapshot: {},
    shippingFeeCents: normalized.shippingFeeCents,
    shippingRegion: '',
    shippingRegionLabel: '',
    freeShippingUnlocked: normalized.shippingFeeCents === 0,
    totalCents: normalized.totalCents,
    cartSnapshot: normalized.items,
    checkoutChannel: 'pancake_pos',
    paymentMethod: normalized.paymentMethod,
    channel: 'Pancake POS',
    status: normalized.status,
    fulfillmentStatus: normalized.fulfillmentStatus,
    paymentStatus: normalized.paymentStatus,
    codConfirmationStatus: normalized.codConfirmationStatus,
    deliveryStatus: normalized.deliveryStatus,
    deliveryMethod: normalized.deliveryMethod,
    trackingNumber: normalized.trackingNumber,
    tags: ['pancake-pos'],
    notes: normalized.notes,
    exportedToJnt: false,
    adminEditableTotals: {},
    placedAt,
    updatedAt: placedAt
  };
}

async function processInboundPancakeOrder({
  pancakeOrder,
  orderRepository = orderRepositoryDefault,
  syncRepository = syncRepositoryDefault,
  now = () => new Date()
}) {
  const normalized = normalizePancakeOrder(pancakeOrder);
  if (!normalized.pancakeOrderId) return { status: 'blocked', safeErrorCode: 'pancake_order_id_missing' };
  if (!normalized.orderNumber) return { status: 'blocked', safeErrorCode: 'pancake_order_match_low_confidence' };

  const payloadHash = hashObject(pancakeOrder);
  const event = await syncRepository.enqueueSyncEvent({
    direction: 'inbound',
    entityType: 'order',
    entityId: normalized.pancakeOrderId,
    orderNumber: normalized.orderNumber,
    pancakeOrderId: normalized.pancakeOrderId,
    eventKey: inboundEventKey(normalized),
    payloadHash,
    payload: { pancakeOrder }
  });
  if (event?.status === 'duplicate') return { status: 'duplicate' };

  const existing = await orderRepository.findOrderByNumber(normalized.orderNumber);
  if (!existing) {
    await orderRepository.saveOrder(importedOrder(normalized, now));
    await syncRepository.upsertOrderLink({
      orderNumber: normalized.orderNumber,
      pancakeOrderId: normalized.pancakeOrderId,
      syncStatus: 'synced',
      lastSyncedAt: now().toISOString(),
      lastPancakeUpdatedAt: normalized.pancakeUpdatedAt || null
    });
    await syncRepository.markSyncEventSucceeded(event.id);
    await syncRepository.appendSyncLog({
      direction: 'inbound',
      entityType: 'order',
      entityId: normalized.pancakeOrderId,
      orderNumber: normalized.orderNumber,
      pancakeOrderId: normalized.pancakeOrderId,
      level: 'info',
      code: 'pancake_order_imported',
      message: 'Pancake order imported.'
    });
    return { status: 'imported', orderNumber: normalized.orderNumber };
  }

  await orderRepository.updateOrder(normalized.orderNumber, {
    customer: normalized.customer,
    address: normalized.address,
    status: normalized.status,
    fulfillmentStatus: normalized.fulfillmentStatus,
    paymentStatus: normalized.paymentStatus,
    codConfirmationStatus: normalized.codConfirmationStatus,
    deliveryStatus: normalized.deliveryStatus,
    deliveryMethod: normalized.deliveryMethod,
    trackingNumber: normalized.trackingNumber,
    notes: normalized.notes || existing.notes || ''
  });
  await syncRepository.upsertOrderLink({
    orderNumber: normalized.orderNumber,
    pancakeOrderId: normalized.pancakeOrderId,
    syncStatus: 'synced',
    lastSyncedAt: now().toISOString(),
    lastPancakeUpdatedAt: normalized.pancakeUpdatedAt || null
  });
  await syncRepository.markSyncEventSucceeded(event.id);
  return { status: 'updated', orderNumber: normalized.orderNumber };
}

async function pollInboundPancakeOrders({
  config,
  client,
  syncRepository = syncRepositoryDefault,
  orderRepository = orderRepositoryDefault,
  now = () => new Date()
}) {
  if (!config.shopId) {
    return {
      status: 'blocked',
      safeErrorCode: 'pancake_shop_id_missing',
      importedCount: 0,
      updatedCount: 0,
      duplicateCount: 0
    };
  }
  const updatedSince = new Date(now().getTime() - Number(config.orderPollLookbackMs || 15 * 60 * 1000)).toISOString();
  const pageSize = Number(config.orderPollPageSize || 50);
  const body = await client.listOrders(config.shopId, { pageNumber: 1, pageSize, updatedSince });
  const summary = { status: 'complete', importedCount: 0, updatedCount: 0, duplicateCount: 0, blockedCount: 0 };
  for (const pancakeOrder of body.data || []) {
    const result = await processInboundPancakeOrder({ pancakeOrder, orderRepository, syncRepository, now });
    if (result.status === 'imported') summary.importedCount += 1;
    else if (result.status === 'updated') summary.updatedCount += 1;
    else if (result.status === 'duplicate') summary.duplicateCount += 1;
    else if (result.status === 'blocked') summary.blockedCount += 1;
  }
  return summary;
}

async function processOutboundOrderEvents({
  config,
  client,
  syncRepository = syncRepositoryDefault,
  orderRepository = orderRepositoryDefault,
  now = () => new Date(),
  limit = 25
}) {
  const events = await syncRepository.claimDueSyncEvents({ direction: 'outbound', limit, now: now().toISOString() });
  const summary = { checkedCount: events.length, updatedCount: 0, failedCount: 0, blockedCount: 0 };
  for (const event of events) {
    try {
      const order = await orderRepository.findOrderByNumber(event.orderNumber);
      if (!order || !event.pancakeOrderId) {
        await syncRepository.markSyncEventBlocked(event.id, !order ? 'local_order_missing' : 'pancake_order_link_missing');
        summary.blockedCount += 1;
        continue;
      }
      const payload = buildPancakeOrderUpdatePayload({ order, changedFields: event.payload.changedFields || [] });
      await client.updateOrder(config.shopId, event.pancakeOrderId, payload);
      await syncRepository.markSyncEventSucceeded(event.id);
      await syncRepository.upsertOrderLink({
        orderNumber: event.orderNumber,
        pancakeOrderId: event.pancakeOrderId,
        shopId: config.shopId,
        syncStatus: 'synced',
        lastSyncedAt: now().toISOString(),
        lastLocalUpdatedAt: order.updatedAt || now().toISOString()
      });
      summary.updatedCount += 1;
    } catch (error) {
      const nextAttemptAt = new Date(now().getTime() + retryDelayMs(Number(event.attemptCount || 0) + 1)).toISOString();
      await syncRepository.markSyncEventRetryable(event.id, { safeErrorCode: safeProviderCode(error), nextAttemptAt });
      summary.failedCount += 1;
    }
  }
  return summary;
}

module.exports = {
  pollInboundPancakeOrders,
  processInboundPancakeOrder,
  processOutboundOrderEvents
};
