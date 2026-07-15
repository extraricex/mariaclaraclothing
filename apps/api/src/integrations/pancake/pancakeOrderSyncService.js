const crypto = require('node:crypto');

const orderRepositoryDefault = require('../../orders/orderRepository');
const syncRepositoryDefault = require('./pancakeOrderSyncRepository');
const {
  buildPancakeOrderUpdatePayload,
  normalizePancakeOrder
} = require('./pancakeOrderMapper');
const { hasCompleteDeliveryInformation } = require('../../checkout/deliveryDetails');

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

function changedFieldsForEvent(event = {}) {
  return Array.isArray(event.payload?.changedFields) ? event.payload.changedFields : [];
}

function canReconcileTerminalCancellation(event, order) {
  const fields = new Set(changedFieldsForEvent(event));
  const paidStatuses = new Set(['paid', 'partially_refunded']);
  return order?.status === 'cancelled'
    && !paidStatuses.has(String(order.paymentStatus || ''))
    && (fields.has('status') || fields.has('fulfillmentStatus') || fields.has('deliveryStatus'));
}

async function providerAlreadyCancelled({ client, config, pancakeOrderId, event, order }) {
  if (!client?.getOrder || !canReconcileTerminalCancellation(event, order)) return false;
  try {
    const providerOrder = await client.getOrder(config.shopId, pancakeOrderId);
    return normalizePancakeOrder(providerOrder).status === 'cancelled';
  } catch (_error) {
    return false;
  }
}

async function completeOutboundEvent({ syncRepository, event, order, pancakeOrderId, config, now, alreadyApplied = false }) {
  await syncRepository.markSyncEventSucceeded(event.id);
  await syncRepository.upsertOrderLink({
    orderNumber: event.orderNumber,
    pancakeOrderId,
    shopId: config.shopId,
    syncStatus: 'synced',
    lastSyncedAt: now().toISOString(),
    lastLocalUpdatedAt: order.updatedAt || now().toISOString(),
    safeErrorCode: ''
  });
  await syncRepository.appendSyncLog({
    direction: 'outbound', entityType: 'order', entityId: event.orderNumber,
    orderNumber: event.orderNumber, pancakeOrderId,
    level: 'info', code: outboundLogCode(event, order, 'synced'),
    message: alreadyApplied
      ? 'Order cancellation was already applied in Pancake POS.'
      : outboundLogMessage(event, order, 'synced'),
    metadata: { changedFields: changedFieldsForEvent(event), alreadyApplied }
  });
}

function outboundLogCode(event, order, outcome) {
  const fields = new Set(changedFieldsForEvent(event));
  const suffix = outcome === 'failed' ? 'failed' : 'synced';
  if (fields.has('paymentStatus') || fields.has('paymentMethod')) return `pancake_order_payment_${suffix}`;
  if (fields.has('status') && order?.status === 'cancelled') return `pancake_order_cancellation_${suffix}`;
  if (fields.has('status') || fields.has('fulfillmentStatus') || fields.has('deliveryStatus')) return `pancake_order_status_${suffix}`;
  if (fields.has('trackingNumber')) return `pancake_order_tracking_${suffix}`;
  return `pancake_order_update_${suffix}`;
}

function outboundLogMessage(event, order, outcome) {
  const fields = new Set(changedFieldsForEvent(event));
  const completed = outcome === 'failed' ? 'failed and was scheduled for retry' : 'synchronized to Pancake POS';
  if (fields.has('paymentStatus') || fields.has('paymentMethod')) return `Payment update ${completed}.`;
  if (fields.has('status') && order?.status === 'cancelled') return `Order cancellation ${completed}.`;
  if (fields.has('status') || fields.has('fulfillmentStatus') || fields.has('deliveryStatus')) return `Order status ${completed}.`;
  if (fields.has('trackingNumber')) return `Tracking update ${completed}.`;
  return `Order update ${completed}.`;
}

function importedOrder(normalized, now) {
  const placedAt = normalized.pancakeUpdatedAt || now().toISOString();
  const completeDelivery = hasCompleteDeliveryInformation(normalized);
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
    status: completeDelivery ? normalized.status : 'received',
    fulfillmentStatus: completeDelivery ? normalized.fulfillmentStatus : 'unfulfilled',
    paymentStatus: normalized.paymentStatus,
    codConfirmationStatus: completeDelivery ? normalized.codConfirmationStatus : 'pending',
    deliveryStatus: completeDelivery ? normalized.deliveryStatus : 'pending',
    deliveryMethod: normalized.deliveryMethod,
    trackingNumber: normalized.trackingNumber,
    estimatedDeliveryAt: normalized.estimatedDeliveryAt,
    deliveryNotes: normalized.deliveryNotes,
    tags: completeDelivery ? ['pancake-pos'] : ['pancake-pos', 'missing_delivery_information'],
    notes: normalized.notes,
    exportedToJnt: false,
    adminEditableTotals: {},
    placedAt,
    updatedAt: placedAt
  };
}

function inboundOrderPatch(normalized, existing = {}) {
  const patch = {
    status: normalized.status,
    fulfillmentStatus: normalized.fulfillmentStatus,
    codConfirmationStatus: normalized.codConfirmationStatus,
    deliveryStatus: normalized.deliveryStatus,
    deliveryMethod: normalized.deliveryMethod,
    trackingNumber: normalized.trackingNumber,
    estimatedDeliveryAt: normalized.estimatedDeliveryAt || existing.estimatedDeliveryAt || '',
    deliveryNotes: normalized.deliveryNotes || existing.deliveryNotes || '',
    notes: normalized.notes || existing.notes || ''
  };
  if (['storefront_checkout', 'storefront_cart'].includes(existing.checkoutChannel)) {
    // The website/admin database owns customer delivery details. Pancake may
    // return partial shipping objects on status-only updates; never let those
    // responses erase a validated storefront address or replace admin notes.
    patch.customer = existing.customer;
    patch.address = existing.address;
    patch.deliveryNotes = existing.deliveryNotes || '';
    patch.notes = existing.notes || '';
    patch.paymentStatus = existing.paymentProvider === 'paymongo'
      ? existing.paymentStatus
      : normalized.paymentStatus;
  } else {
    Object.assign(patch, {
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
      paymentStatus: normalized.paymentStatus
    });
  }
  const candidate = { ...existing, ...patch };
  if (!hasCompleteDeliveryInformation(candidate)
    && ['confirmed', 'packed', 'shipped', 'delivered'].includes(normalized.status)) {
    patch.status = existing.status || 'received';
    patch.fulfillmentStatus = existing.fulfillmentStatus || 'unfulfilled';
    patch.codConfirmationStatus = existing.codConfirmationStatus || 'pending';
    patch.deliveryStatus = existing.deliveryStatus || 'pending';
    patch.tags = [...new Set([...(existing.tags || []), 'missing_delivery_information'])];
  }
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
  const summary = { status: 'complete', checkedCount: events.length, updatedCount: 0, failedCount: 0, blockedCount: 0 };
  for (const event of events) {
    let order;
    let pancakeOrderId = event.pancakeOrderId;
    try {
      order = await orderRepository.findOrderByNumber(event.orderNumber);
      if (!pancakeOrderId) {
        const detail = await syncRepository.getOrderSyncDetail(event.orderNumber);
        pancakeOrderId = detail?.pancakeOrderId || '';
      }
      if (!order || !pancakeOrderId) {
        const code = !order ? 'local_order_missing' : 'pancake_order_link_missing';
        await syncRepository.markSyncEventBlocked(event.id, code);
        await syncRepository.appendSyncLog({
          direction: 'outbound', entityType: 'order', entityId: event.orderNumber,
          orderNumber: event.orderNumber, pancakeOrderId,
          level: 'error', code,
          message: !order ? 'Local order was not found.' : 'Pancake order link is missing; update was not sent.'
        });
        summary.blockedCount += 1;
        continue;
      }
      if (await providerAlreadyCancelled({ client, config, pancakeOrderId, event, order })) {
        await completeOutboundEvent({ syncRepository, event, order, pancakeOrderId, config, now, alreadyApplied: true });
        summary.updatedCount += 1;
        continue;
      }
      const payload = buildPancakeOrderUpdatePayload({ order, changedFields: event.payload.changedFields || [] });
      if (!Object.keys(payload).length) {
        await syncRepository.markSyncEventBlocked(event.id, 'pancake_order_update_not_supported');
        summary.blockedCount += 1;
        continue;
      }
      await client.updateOrder(config.shopId, pancakeOrderId, payload);
      await completeOutboundEvent({ syncRepository, event, order, pancakeOrderId, config, now });
      summary.updatedCount += 1;
    } catch (error) {
      const code = safeProviderCode(error);
      const nextAttemptAt = new Date(now().getTime() + retryDelayMs(Number(event.attemptCount || 0) + 1)).toISOString();
      await syncRepository.markSyncEventRetryable(event.id, { safeErrorCode: code, nextAttemptAt });
      if (pancakeOrderId) {
        await syncRepository.upsertOrderLink({
          orderNumber: event.orderNumber,
          pancakeOrderId,
          shopId: config.shopId,
          syncStatus: 'sync_failed',
          lastLocalUpdatedAt: order?.updatedAt || now().toISOString(),
          safeErrorCode: code
        });
      }
      await syncRepository.appendSyncLog({
        direction: 'outbound', entityType: 'order', entityId: event.orderNumber,
        orderNumber: event.orderNumber, pancakeOrderId,
        level: 'error', code: outboundLogCode(event, order, 'failed'),
        message: outboundLogMessage(event, order, 'failed'),
        metadata: { safeErrorCode: code, changedFields: changedFieldsForEvent(event) }
      });
      summary.failedCount += 1;
    }
  }
  if (summary.failedCount) summary.status = 'failed';
  else if (summary.blockedCount) summary.status = 'blocked';
  return summary;
}

module.exports = {
  pollInboundPancakeOrders,
  processInboundPancakeOrder,
  processOutboundOrderEvents
};
