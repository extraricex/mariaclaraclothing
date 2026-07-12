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

function inboundEventKey(normalized, payloadHash) {
  return [
    normalized.pancakeOrderId,
    normalized.pancakeUpdatedAt || '',
    normalized.status || '',
    normalized.trackingNumber || '',
    payloadHash
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
    codAmountCents: normalized.codAmountCents,
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
    estimatedDeliveryAt: normalized.estimatedDeliveryAt,
    deliveryNotes: normalized.deliveryNotes,
    tags: ['pancake-pos'],
    notes: normalized.notes,
    exportedToJnt: false,
    adminEditableTotals: {},
    placedAt,
    updatedAt: placedAt
  };
}

function inboundOrderPatch(normalized, existing = {}) {
  const patch = {
    customer: normalized.customer,
    address: normalized.address,
    items: normalized.items,
    subtotalCents: normalized.subtotalCents,
    discountTotalCents: normalized.discountTotalCents,
    shippingFeeCents: normalized.shippingFeeCents,
    freeShippingUnlocked: normalized.shippingFeeCents === 0,
    totalCents: normalized.totalCents,
    codAmountCents: normalized.codAmountCents,
    cartSnapshot: normalized.items,
    paymentMethod: normalized.paymentMethod,
    status: normalized.status,
    fulfillmentStatus: normalized.fulfillmentStatus,
    paymentStatus: normalized.paymentStatus,
    codConfirmationStatus: normalized.codConfirmationStatus,
    deliveryStatus: normalized.deliveryStatus,
    deliveryMethod: normalized.deliveryMethod,
    trackingNumber: normalized.trackingNumber,
    estimatedDeliveryAt: normalized.estimatedDeliveryAt || existing.estimatedDeliveryAt || '',
    deliveryNotes: normalized.deliveryNotes || existing.deliveryNotes || '',
    notes: normalized.notes || existing.notes || ''
  };
  return patch;
}

function nativePancakeOrderNumber(pancakeOrderId) {
  const id = String(pancakeOrderId || '').trim().replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 80);
  return id ? `PNK-${id}` : '';
}

function isOlderPancakeUpdate(normalized, link) {
  if (!normalized.pancakeUpdatedAt || !link?.lastPancakeUpdatedAt) return false;
  const incoming = new Date(normalized.pancakeUpdatedAt).getTime();
  const previous = new Date(link.lastPancakeUpdatedAt).getTime();
  return Number.isFinite(incoming) && Number.isFinite(previous) && incoming < previous;
}

async function processInboundPancakeOrder({
  pancakeOrder,
  orderRepository = orderRepositoryDefault,
  syncRepository = syncRepositoryDefault,
  now = () => new Date()
}) {
  const normalized = normalizePancakeOrder(pancakeOrder);
  if (!normalized.pancakeOrderId) return { status: 'blocked', safeErrorCode: 'pancake_order_id_missing' };
  const linked = await syncRepository.getOrderLinkByPancakeOrderId?.(normalized.pancakeOrderId);
  const orderNumber = linked?.orderNumber || normalized.orderNumber || nativePancakeOrderNumber(normalized.pancakeOrderId);
  if (!orderNumber) return { status: 'blocked', safeErrorCode: 'pancake_order_match_low_confidence' };
  normalized.orderNumber = orderNumber;
  const existingLink = linked || await syncRepository.getOrderSyncDetail(orderNumber);
  if (isOlderPancakeUpdate(normalized, existingLink)) {
    await syncRepository.appendSyncLog({
      direction: 'inbound',
      entityType: 'order',
      entityId: normalized.pancakeOrderId,
      orderNumber,
      pancakeOrderId: normalized.pancakeOrderId,
      level: 'warning',
      code: 'pancake_stale_update_ignored',
      message: 'Ignored older Pancake order update.'
    });
    return { status: 'stale', orderNumber };
  }

  const payloadHash = hashObject(pancakeOrder);
  const event = await syncRepository.enqueueSyncEvent({
    direction: 'inbound',
    entityType: 'order',
    entityId: normalized.pancakeOrderId,
    orderNumber: normalized.orderNumber,
    pancakeOrderId: normalized.pancakeOrderId,
    eventKey: inboundEventKey(normalized, payloadHash),
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

  await orderRepository.updateOrder(normalized.orderNumber, inboundOrderPatch(normalized, existing));
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
    code: normalized.trackingNumber ? 'pancake_order_tracking_synced' : 'pancake_order_updated',
    message: 'Pancake order update synced to admin.'
  });
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
  const pollTime = now();
  const updatedSince = new Date(pollTime.getTime() - Number(config.orderPollLookbackMs || 15 * 60 * 1000)).toISOString();
  const updatedUntil = pollTime.toISOString();
  const pageSize = Number(config.orderPollPageSize || 50);
  const summary = { status: 'complete', importedCount: 0, updatedCount: 0, duplicateCount: 0, blockedCount: 0 };
  let pageNumber = 1;
  let totalPages = 1;
  do {
    const body = await client.listOrders(config.shopId, { pageNumber, pageSize, updatedSince, updatedUntil });
    totalPages = Math.max(1, Math.min(100, Number(body.total_pages || body.totalPages || pageNumber)));
    for (const pancakeOrder of body.data || []) {
      const result = await processInboundPancakeOrder({ pancakeOrder, orderRepository, syncRepository, now });
      if (result.status === 'imported') summary.importedCount += 1;
      else if (result.status === 'updated') summary.updatedCount += 1;
      else if (result.status === 'duplicate') summary.duplicateCount += 1;
      else if (result.status === 'blocked') summary.blockedCount += 1;
    }
    pageNumber += 1;
  } while (pageNumber <= totalPages);
  if (summary.importedCount || summary.updatedCount || summary.blockedCount) {
    await syncRepository.appendSyncLog({
      direction: 'inbound',
      entityType: 'order',
      entityId: '',
      level: summary.blockedCount ? 'warning' : 'info',
      code: 'pancake_order_poll_complete',
      message: 'Pancake order polling completed.',
      metadata: summary
    });
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
      if (!Object.keys(payload).length) {
        await syncRepository.markSyncEventBlocked(event.id, 'pancake_order_update_not_supported');
        summary.blockedCount += 1;
        continue;
      }
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
