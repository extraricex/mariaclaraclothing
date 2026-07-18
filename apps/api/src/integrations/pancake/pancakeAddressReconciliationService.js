const orderRepositoryDefault = require('../../orders/orderRepository');
const exportRepositoryDefault = require('./pancakeOrderExportRepository');
const syncRepositoryDefault = require('./pancakeOrderSyncRepository');
const geoRepositoryDefault = require('./pancakeGeoRepository');
const { hasCompleteDeliveryInformation } = require('../../checkout/deliveryDetails');
const { resolvePancakeAddress } = require('./pancakeGeoService');
const {
  buildPancakeOrderUpdatePayload,
  verifyPancakeStructuredAddress
} = require('./pancakeOrderMapper');

function inRange(order, from, to) {
  const timestamp = new Date(order.placedAt || 0).getTime();
  if (!Number.isFinite(timestamp)) return false;
  if (from && timestamp < new Date(from).getTime()) return false;
  if (to && timestamp > new Date(to).getTime()) return false;
  return true;
}

function websiteAddress(order = {}) {
  const address = order.address || {};
  return {
    street: address.houseAddress || address.addressLine1 || '',
    barangayCode: address.barangayCode || '',
    barangay: address.barangay || address.barangayName || '',
    cityCode: address.cityCode || '',
    city: address.city || address.cityName || '',
    provinceCode: address.provinceCode || '',
    province: address.province || address.provinceName || '',
    postalCode: address.postalCode || address.zipCode || '',
    fullAddress: address.formattedFullAddress || address.addressLine || ''
  };
}

function providerAddress(providerOrder = {}) {
  const shipping = providerOrder.shipping_address || {};
  return {
    provinceId: String(shipping.province_id || ''),
    provinceName: String(shipping.province_name || ''),
    districtId: String(shipping.district_id || ''),
    districtName: String(shipping.district_name || ''),
    communeId: String(shipping.commune_id || ''),
    communeName: String(shipping.commnue_name || shipping.commune_name || ''),
    phoneNumber: String(shipping.phone_number || providerOrder.bill_phone_number || ''),
    postCode: String(shipping.post_code || ''),
    fullAddress: String(shipping.full_address || shipping.new_full_address || '')
  };
}

function providerAddressIncomplete(address = {}) {
  return !address.provinceId || !address.districtId || !address.communeId
    || !address.phoneNumber || !address.fullAddress;
}

async function previewAddressReconciliation({
  from = '', to = '', limit = 100, client, config,
  orderRepository = orderRepositoryDefault,
  syncRepository = syncRepositoryDefault,
  geoRepository = geoRepositoryDefault,
  geoResolver = resolvePancakeAddress
} = {}) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 100));
  const orders = (await orderRepository.listOrders())
    .filter((order) => inRange(order, from, to))
    .slice(0, safeLimit);
  const items = [];
  let incompleteCount = 0;
  for (const order of orders) {
    const link = await syncRepository.getOrderSyncDetail(order.orderNumber);
    if (!link?.pancakeOrderId) continue;
    try {
      const providerOrder = await client.getOrder(config.shopId, link.pancakeOrderId);
      const current = providerAddress(providerOrder);
      const incomplete = providerAddressIncomplete(current);
      if (!incomplete) continue;
      incompleteCount += 1;
      let proposed = null;
      let mappingStatus = 'needs_review';
      let safeErrorCode = '';
      if (hasCompleteDeliveryInformation(order)) {
        try {
          proposed = await geoResolver(order.address, { client, repository: geoRepository });
          mappingStatus = 'resolved';
        } catch (error) {
          safeErrorCode = String(error?.code || 'pancake_address_mapping_failed');
          mappingStatus = error?.code?.endsWith('_ambiguous') ? 'ambiguous' : 'not_found';
        }
      } else {
        safeErrorCode = 'pancake_order_delivery_incomplete';
      }
      items.push({
        orderNumber: order.orderNumber,
        placedAt: order.placedAt,
        pancakeOrderId: link.pancakeOrderId,
        websiteAddress: websiteAddress(order),
        currentPancakeAddress: current,
        proposedMapping: proposed,
        mappingStatus,
        safeErrorCode,
        canApply: Boolean(proposed)
      });
    } catch (error) {
      items.push({
        orderNumber: order.orderNumber,
        placedAt: order.placedAt,
        pancakeOrderId: link.pancakeOrderId,
        websiteAddress: websiteAddress(order),
        currentPancakeAddress: {},
        proposedMapping: null,
        mappingStatus: 'provider_error',
        safeErrorCode: String(error?.code || 'pancake_order_retrieval_failed'),
        canApply: false
      });
    }
  }
  return {
    from, to, scannedCount: orders.length, incompleteCount,
    applicableCount: items.filter((item) => item.canApply).length,
    items
  };
}

async function reconcileOneAddress({
  orderNumber, client, config,
  orderRepository = orderRepositoryDefault,
  exportRepository = exportRepositoryDefault,
  syncRepository = syncRepositoryDefault,
  geoRepository = geoRepositoryDefault,
  geoResolver = resolvePancakeAddress
} = {}) {
  const order = await orderRepository.findOrderByNumber(orderNumber, { includeRelated: false });
  if (!order) return { orderNumber, status: 'blocked', safeErrorCode: 'local_order_missing' };
  const link = await syncRepository.getOrderSyncDetail(orderNumber);
  if (!link?.pancakeOrderId) {
    return { orderNumber, status: 'blocked', safeErrorCode: 'pancake_order_link_missing' };
  }
  if (!hasCompleteDeliveryInformation(order)) {
    return { orderNumber, status: 'blocked', safeErrorCode: 'pancake_order_delivery_incomplete' };
  }
  try {
    const addressMapping = await geoResolver(order.address, { client, repository: geoRepository, forceRefresh: true });
    const payload = buildPancakeOrderUpdatePayload({
      order,
      changedFields: ['customer', 'address'],
      addressMapping
    });
    await client.updateOrder(config.shopId, link.pancakeOrderId, payload);
    const providerOrder = await client.getOrder(config.shopId, link.pancakeOrderId);
    const verification = verifyPancakeStructuredAddress({ providerOrder, order, mapping: addressMapping });
    await exportRepository.recordOrderAddressVerification({
      orderNumber,
      addressMapping,
      providerVerification: verification,
      responsePayload: verification.persisted,
      verifiedAt: verification.verifiedAt,
      safeErrorCode: verification.valid ? '' : 'pancake_address_verification_failed'
    });
    await syncRepository.upsertOrderLink({
      ...link,
      orderNumber,
      pancakeOrderId: link.pancakeOrderId,
      shopId: config.shopId,
      syncStatus: verification.valid ? 'synced' : 'blocked',
      lastSyncedAt: verification.valid ? verification.verifiedAt : link.lastSyncedAt,
      safeErrorCode: verification.valid ? '' : 'pancake_address_verification_failed'
    });
    await syncRepository.appendSyncLog({
      direction: 'outbound', entityType: 'order', entityId: orderNumber,
      orderNumber, pancakeOrderId: link.pancakeOrderId,
      level: verification.valid ? 'info' : 'error',
      code: verification.valid ? 'pancake_structured_address_reconciled' : 'pancake_address_verification_failed',
      message: verification.valid
        ? 'Approved reconciliation persisted and verified the structured Pancake address.'
        : 'Pancake did not persist every structured address field after the approved update.',
      metadata: { issues: verification.issues }
    });
    return {
      orderNumber,
      pancakeOrderId: link.pancakeOrderId,
      status: verification.valid ? 'verified' : 'blocked',
      addressMapping,
      verification,
      safeErrorCode: verification.valid ? '' : 'pancake_address_verification_failed'
    };
  } catch (error) {
    return {
      orderNumber,
      pancakeOrderId: link.pancakeOrderId,
      status: 'blocked',
      safeErrorCode: String(error?.code || 'pancake_address_reconciliation_failed')
    };
  }
}

async function applyAddressReconciliation({ orderNumbers = [], confirmed = false, ...dependencies } = {}) {
  if (!confirmed) {
    const error = new Error('Explicit reconciliation confirmation is required.');
    error.status = 400;
    error.code = 'pancake_reconciliation_confirmation_required';
    throw error;
  }
  const selected = [...new Set(orderNumbers.map((value) => String(value || '').trim()).filter(Boolean))];
  if (!selected.length || selected.length > 50) {
    const error = new Error('Select 1 to 50 Pancake orders to update.');
    error.status = 400;
    error.code = 'pancake_reconciliation_selection_invalid';
    throw error;
  }
  const results = [];
  for (const orderNumber of selected) {
    results.push(await reconcileOneAddress({ orderNumber, ...dependencies }));
  }
  return {
    selectedCount: selected.length,
    verifiedCount: results.filter((item) => item.status === 'verified').length,
    blockedCount: results.filter((item) => item.status !== 'verified').length,
    results
  };
}

module.exports = {
  applyAddressReconciliation,
  previewAddressReconciliation,
  providerAddress,
  providerAddressIncomplete,
  reconcileOneAddress,
  websiteAddress
};
