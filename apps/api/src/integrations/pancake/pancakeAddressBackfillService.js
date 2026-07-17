const orderRepositoryDefault = require('../../orders/orderRepository');
const syncRepositoryDefault = require('./pancakeOrderSyncRepository');
const { normalizePancakeOrder } = require('./pancakeOrderMapper');
const {
  canonicalDeliveryAddress,
  deliveryValidationResult,
  hasCompleteDeliveryInformation
} = require('../../checkout/deliveryDetails');

function blank(value) {
  return !String(value ?? '').trim();
}

function fillMissing(existing = {}, incoming = {}) {
  const merged = { ...(existing || {}) };
  for (const [key, value] of Object.entries(incoming || {})) {
    if (blank(merged[key]) && !blank(value)) merged[key] = value;
  }
  return merged;
}

function recoveredDeliveryInformation(order = {}, providerOrder = {}) {
  const normalized = normalizePancakeOrder(providerOrder);
  const candidate = {
    customer: fillMissing(order.customer, normalized.customer),
    address: canonicalDeliveryAddress(fillMissing(order.address, normalized.address))
  };
  const validation = deliveryValidationResult(candidate, { requireExplicitNameParts: false });
  if (!validation.valid) return null;
  return {
    customer: { ...candidate.customer, ...validation.customer },
    address: { ...candidate.address, ...validation.address },
    tags: (order.tags || []).filter((tag) => tag !== 'missing_delivery_information')
  };
}

async function backfillPancakeDeliveryAddresses({
  apply = false,
  client,
  config,
  orderRepository = orderRepositoryDefault,
  syncRepository = syncRepositoryDefault
} = {}) {
  if (!client || !config?.shopId) throw new Error('Pancake client and shop are required.');
  const orders = await orderRepository.listOrders();
  const incomplete = orders.filter((order) => !hasCompleteDeliveryInformation(order));
  const summary = {
    mode: apply ? 'apply' : 'audit',
    incompleteCount: incomplete.length,
    linkedCount: 0,
    recoverableCount: 0,
    appliedCount: 0,
    providerIncompleteCount: 0,
    failedCount: 0
  };

  for (const order of incomplete) {
    const detail = await syncRepository.getOrderSyncDetail(order.orderNumber);
    if (!detail?.pancakeOrderId) continue;
    summary.linkedCount += 1;
    try {
      const providerOrder = await client.getOrder(config.shopId, detail.pancakeOrderId);
      const recovered = recoveredDeliveryInformation(order, providerOrder);
      if (!recovered) {
        summary.providerIncompleteCount += 1;
        continue;
      }
      summary.recoverableCount += 1;
      if (!apply) continue;

      await orderRepository.updateOrder(order.orderNumber, recovered);
      await orderRepository.appendOrderStatusEvent?.(order.orderNumber, {
        source: 'system',
        changes: { deliveryInformation: { from: 'incomplete', to: 'complete' } },
        note: 'Recovered verified readable delivery details from the linked Pancake POS order.'
      });
      await syncRepository.appendSyncLog?.({
        direction: 'inbound',
        entityType: 'order',
        entityId: detail.pancakeOrderId,
        orderNumber: order.orderNumber,
        pancakeOrderId: detail.pancakeOrderId,
        level: 'info',
        code: 'pancake_delivery_address_backfilled',
        message: 'Recovered complete customer delivery details from Pancake POS.'
      });
      summary.appliedCount += 1;
    } catch (_error) {
      summary.failedCount += 1;
    }
  }
  return summary;
}

module.exports = { backfillPancakeDeliveryAddresses, recoveredDeliveryInformation };
