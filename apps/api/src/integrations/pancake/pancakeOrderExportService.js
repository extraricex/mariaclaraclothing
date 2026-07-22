const syncRepositoryDefault = require('./pancakeOrderSyncRepository');
const inventoryOutboxRepositoryDefault = require('./pancakeInventoryOutboxRepository');
const {
  buildPancakeOrderFinancialPayload,
  buildPancakeShippingAddress,
  verifyPancakeStructuredAddress
} = require('./pancakeOrderMapper');
const geoRepositoryDefault = require('./pancakeGeoRepository');
const { resolvePancakeAddress } = require('./pancakeGeoService');
const { customerFullName } = require('../../customers/customerName');
const { hasCompleteDeliveryInformation, normalizePhilippineMobile } = require('../../checkout/deliveryDetails');

class PancakeOrderExportError extends Error {
  constructor(code) {
    super(code);
    this.name = 'PancakeOrderExportError';
    this.code = code;
  }
}

function normalizeSku(value) {
  return String(value || '').normalize('NFKC').trim().toUpperCase();
}

function block(code) {
  throw new PancakeOrderExportError(code);
}

function pesosFromCents(cents) {
  const value = Number(cents || 0);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / 100);
}

function safeShopId(value) {
  const text = String(value || '').trim();
  if (/^\d+$/.test(text)) return Number(text);
  return text;
}

function mappingBySku(readiness) {
  const pairs = new Map();
  for (const mapping of readiness.mappings || []) {
    const sku = normalizeSku(mapping.normalizedSku || mapping.localSku || mapping.sku);
    if (sku && mapping.pancakeVariationId) pairs.set(sku, mapping);
  }
  return pairs;
}

function assertReady(readiness) {
  if (!readiness?.shopId || !readiness?.warehouseId || !readiness?.orderSourceId) {
    block('pancake_references_incomplete');
  }
  if (readiness.priceUnitStatus !== 'confirmed_pesos') {
    block('pancake_price_unit_not_confirmed');
  }
  if (readiness.latestCatalog?.status !== 'complete') {
    block('pancake_catalog_not_ready');
  }
  if (Number(readiness.latestCatalog?.conflictCount || 0) > 0) {
    block('pancake_catalog_conflicts_open');
  }
}

function assertPaymentEligible(order = {}) {
  const paymongo = String(order.paymentMethod || order.paymentProvider || '').trim().toLowerCase() === 'paymongo';
  if (!paymongo) return;
  if (String(order.paymentStatus || '').trim().toLowerCase() !== 'paid') {
    block('pancake_order_waiting_payment');
  }
  const totalCents = Number(order.totalCents);
  const paidAmountCents = Number(order.paidAmountCents);
  if (!Number.isInteger(totalCents) || totalCents <= 0 || paidAmountCents !== totalCents
    || !String(order.providerPaymentId || '').trim()) {
    block('pancake_order_payment_not_verified');
  }
}

function buildPancakeOrderPayload(order, readiness, addressMapping = {}) {
  if (order?.isTestOrder || order?.paymentMetadata?.metaControlledTest) {
    block('pancake_test_order_blocked');
  }
  if (!hasCompleteDeliveryInformation(order)) block('pancake_order_delivery_incomplete');
  assertPaymentEligible(order);
  assertReady(readiness);
  const bySku = mappingBySku(readiness);
  const items = (order.items || []).map((item) => {
    const mapping = bySku.get(normalizeSku(item.sku));
    if (!mapping) block('pancake_order_item_mapping_missing');
    return {
      product_id: String(mapping.pancakeProductId || ''),
      variation_id: String(mapping.pancakeVariationId || ''),
      quantity: Math.max(1, Math.trunc(Number(item.quantity || 0))),
      discount_each_product: 0,
      is_bonus_product: false,
      is_discount_percent: false,
      is_wholesale: false,
      one_time_product: false,
      variation_info: {
        id: String(mapping.pancakeVariationId || ''),
        product_id: String(mapping.pancakeProductId || ''),
        name: String(item.productName || ''),
        retail_price: pesosFromCents(item.unitPriceCents)
      }
    };
  });
  if (!items.length) block('pancake_order_items_empty');

  const customer = order.customer || {};
  const financials = buildPancakeOrderFinancialPayload(order);
  const payload = {
    shop_id: safeShopId(readiness.shopId),
    warehouse_id: String(readiness.warehouseId || ''),
    custom_id: String(order.orderNumber || ''),
    bill_full_name: customerFullName(customer),
    bill_phone_number: normalizePhilippineMobile(customer.phone),
    bill_email: String(customer.email || '').trim().toLowerCase(),
    shipping_address: buildPancakeShippingAddress(order, addressMapping),
    items,
    shipping_fee: financials.shipping_fee,
    total_discount: financials.total_discount,
    is_free_shipping: financials.is_free_shipping,
    received_at_shop: false,
    status: 0,
    cod: financials.cod,
    transfer_money: financials.transfer_money,
    note: financials.note,
    note_print: financials.note_print,
    merge_order: false
  };
  const orderSource = String(readiness.orderSourceId || '').trim();
  if (orderSource) payload.account = /^\d+$/.test(orderSource) ? Number(orderSource) : orderSource;
  return payload;
}

function maskPhone(value) {
  const text = String(value || '');
  if (text.length <= 7) return text ? '***' : '';
  return `${text.slice(0, 4)}****${text.slice(-3)}`;
}

function maskEmail(value) {
  const text = String(value || '');
  const [name, domain] = text.split('@');
  if (!name || !domain) return text ? '***' : '';
  if (name.length <= 2) return `${name[0] || '*'}***@${domain}`;
  return `${name[0]}***${name.slice(-1)}@${domain}`;
}

function redactPancakeOrderPayload(payload) {
  const copy = JSON.parse(JSON.stringify(payload || {}));
  copy.bill_phone_number = maskPhone(copy.bill_phone_number);
  copy.bill_email = maskEmail(copy.bill_email);
  if (copy.shipping_address) {
    copy.shipping_address.phone_number = maskPhone(copy.shipping_address.phone_number);
  }
  return copy;
}

async function runOrderShadowBuild({
  config, client, repository, geoRepository = geoRepositoryDefault,
  geoResolver = resolvePancakeAddress, now = () => new Date(), limit = 50
}) {
  if (config.mode === 'disabled') {
    return { status: 'disabled', summary: { checkedCount: 0, builtCount: 0, blockedCount: 0, failedCount: 0 } };
  }
  const readiness = await repository.loadOrderExportReadiness();
  if (repository.enqueueMissingOrderExports) {
    await repository.enqueueMissingOrderExports({ limit, placedAfter: config.orderExportCutoffAt || '' });
  }
  const exports = await repository.listQueuedOrderExports({ limit, placedAfter: config.orderExportCutoffAt || '' });
  const summary = { checkedCount: exports.length, builtCount: 0, blockedCount: 0, failedCount: 0 };
  const builtAt = now().toISOString();

  for (const item of exports) {
    try {
      const addressMapping = await geoResolver(item.order.address, { client, repository: geoRepository });
      const request = buildPancakeOrderPayload(item.order, readiness, addressMapping);
      await repository.saveOrderAddressMapping?.(item.orderNumber, addressMapping);
      await repository.completeShadowExport({
        orderNumber: item.orderNumber,
        mode: config.mode,
        shopId: String(readiness.shopId || ''),
        warehouseId: String(readiness.warehouseId || ''),
        orderSourceId: String(readiness.orderSourceId || ''),
        requestPayload: redactPancakeOrderPayload(request),
        builtAt
      });
      summary.builtCount += 1;
    } catch (error) {
      const code = error instanceof PancakeOrderExportError ? error.code : 'pancake_order_shadow_failed';
      await repository.blockOrderExport(item.orderNumber, code);
      summary.blockedCount += 1;
    }
  }

  return { status: 'complete', summary };
}

function safeProviderCode(error) {
  const code = String(error?.code || '');
  return /^pancake_[a-z_]+$/.test(code) ? code : 'pancake_order_live_export_failed';
}

function correctionPayload(request = {}) {
  return Object.fromEntries([
    'bill_full_name', 'bill_phone_number', 'bill_email', 'shipping_address',
    'shipping_fee', 'total_discount', 'is_free_shipping', 'cod', 'transfer_money',
    'note', 'note_print'
  ].filter((field) => request[field] !== undefined).map((field) => [field, request[field]]));
}

async function retrieveAndVerify({ client, shopId, pancakeOrderId, order, addressMapping }) {
  const providerOrder = await client.getOrder(shopId, pancakeOrderId);
  return {
    providerOrder,
    verification: verifyPancakeStructuredAddress({ providerOrder, order, mapping: addressMapping })
  };
}

async function runOrderLiveExport({
  config, client, repository, syncRepository = syncRepositoryDefault,
  inventoryOutboxRepository = inventoryOutboxRepositoryDefault,
  geoRepository = geoRepositoryDefault, geoResolver = resolvePancakeAddress,
  now = () => new Date(), limit = 50, orderNumber = ''
}) {
  const emptySummary = { checkedCount: 0, sentCount: 0, blockedCount: 0, failedCount: 0 };
  if (config.mode !== 'live') {
    return { status: 'blocked', lastErrorCode: 'pancake_mode_not_allowed', summary: emptySummary };
  }
  await syncRepository.backfillSentOrderExportLinks?.({ limit });
  const readiness = await repository.loadOrderExportReadiness();
  if (!orderNumber && repository.enqueueMissingOrderExports) {
    await repository.enqueueMissingOrderExports({ limit, placedAfter: config.orderExportCutoffAt || '' });
  }
  const exports = orderNumber
    ? [await repository.loadOrderExportWorkItem(orderNumber, { placedAfter: config.orderExportCutoffAt || '' })].filter(Boolean)
    : await repository.listQueuedOrderExports({ limit, placedAfter: config.orderExportCutoffAt || '' });
  if (orderNumber && exports.length === 0) {
    return { status: 'skipped', reason: 'pancake_order_export_not_queued', summary: emptySummary };
  }
  const summary = { checkedCount: exports.length, sentCount: 0, blockedCount: 0, failedCount: 0 };

  for (const item of exports) {
    let request;
    let addressMapping;
    try {
      addressMapping = await geoResolver(item.order.address, { client, repository: geoRepository });
      request = buildPancakeOrderPayload(item.order, readiness, addressMapping);
      await repository.saveOrderAddressMapping?.(item.orderNumber, addressMapping);
    } catch (error) {
      const code = error instanceof PancakeOrderExportError || /^pancake_[a-z_]+$/.test(String(error?.code || ''))
        ? error.code : 'pancake_order_shadow_failed';
      await repository.blockOrderExport(item.orderNumber, code);
      await syncRepository.appendSyncLog?.({
        direction: 'outbound', entityType: 'order', entityId: item.orderNumber,
        orderNumber: item.orderNumber, level: 'error', code,
        message: `Pancake synchronization is blocked because ${error?.field || 'the address'} could not be mapped.`
      });
      summary.blockedCount += 1;
      continue;
    }

    let pancakeOrderId = String(item.pancakeOrderId || '').trim();
    try {
      if (!pancakeOrderId) {
        const existingLink = await syncRepository.getOrderSyncDetail?.(item.orderNumber);
        pancakeOrderId = String(existingLink?.pancakeOrderId || '').trim();
      }
      if (!pancakeOrderId && client.findOrdersByCustomId) {
        const providerMatches = await client.findOrdersByCustomId(readiness.shopId, item.orderNumber);
        if (providerMatches.length > 1) {
          await repository.blockOrderExport(item.orderNumber, 'pancake_order_duplicate_ambiguous');
          await syncRepository.appendSyncLog?.({
            direction: 'outbound', entityType: 'order', entityId: item.orderNumber,
            orderNumber: item.orderNumber, level: 'error', code: 'pancake_order_duplicate_ambiguous',
            message: 'More than one Pancake order has this exact website order number; no additional order was created.'
          });
          summary.blockedCount += 1;
          continue;
        }
        pancakeOrderId = String(providerMatches[0]?.id || '').trim();
        if (pancakeOrderId) {
          await repository.markOrderExportCreated?.({
            orderNumber: item.orderNumber,
            mode: 'live',
            shopId: String(readiness.shopId || ''),
            warehouseId: String(readiness.warehouseId || ''),
            orderSourceId: String(readiness.orderSourceId || ''),
            pancakeOrderId,
            requestPayload: redactPancakeOrderPayload(request),
            responsePayload: { pancakeOrderId, recoveredByCustomId: true },
            addressMapping,
            createdAt: now().toISOString()
          });
          await syncRepository.upsertOrderLink?.({
            orderNumber: item.orderNumber,
            pancakeOrderId,
            shopId: String(readiness.shopId || ''),
            syncStatus: 'pending_sync',
            lastLocalUpdatedAt: item.order?.updatedAt || now().toISOString()
          });
        }
      }
      if (!pancakeOrderId) {
        const response = await client.createOrder(readiness.shopId, request);
        pancakeOrderId = response.pancakeOrderId;
        await repository.markOrderExportCreated?.({
          orderNumber: item.orderNumber,
          mode: 'live',
          shopId: String(readiness.shopId || ''),
          warehouseId: String(readiness.warehouseId || ''),
          orderSourceId: String(readiness.orderSourceId || ''),
          pancakeOrderId,
          requestPayload: redactPancakeOrderPayload(request),
          responsePayload: { pancakeOrderId },
          addressMapping,
          createdAt: now().toISOString()
        });
        await syncRepository.upsertOrderLink?.({
          orderNumber: item.orderNumber,
          pancakeOrderId,
          shopId: String(readiness.shopId || ''),
          syncStatus: 'pending_sync',
          lastLocalUpdatedAt: item.order?.updatedAt || now().toISOString()
        });
      }

      let verified = await retrieveAndVerify({
        client, shopId: readiness.shopId, pancakeOrderId,
        order: item.order, addressMapping
      });
      if (!verified.verification.valid) {
        await client.updateOrder(readiness.shopId, pancakeOrderId, correctionPayload(request));
        verified = await retrieveAndVerify({
          client, shopId: readiness.shopId, pancakeOrderId,
          order: item.order, addressMapping
        });
      }
      if (!verified.verification.valid) {
        await repository.markOrderExportVerificationFailed?.({
          orderNumber: item.orderNumber,
          pancakeOrderId,
          safeErrorCode: 'pancake_address_verification_failed',
          providerVerification: verified.verification,
          responsePayload: verified.verification.persisted
        });
        await syncRepository.upsertOrderLink?.({
          orderNumber: item.orderNumber, pancakeOrderId,
          shopId: String(readiness.shopId || ''), syncStatus: 'blocked',
          safeErrorCode: 'pancake_address_verification_failed'
        });
        await syncRepository.appendSyncLog?.({
          direction: 'outbound', entityType: 'order', entityId: item.orderNumber,
          orderNumber: item.orderNumber, pancakeOrderId, level: 'error',
          code: 'pancake_address_verification_failed',
          message: 'Pancake created the order but did not persist the complete structured address.',
          metadata: { issues: verified.verification.issues }
        });
        summary.blockedCount += 1;
        continue;
      }

      const sentAt = now().toISOString();
      await repository.markOrderExportSent({
        orderNumber: item.orderNumber,
        mode: 'live',
        shopId: String(readiness.shopId || ''),
        warehouseId: String(readiness.warehouseId || ''),
        orderSourceId: String(readiness.orderSourceId || ''),
        pancakeOrderId,
        requestPayload: redactPancakeOrderPayload(request),
        responsePayload: verified.verification.persisted,
        addressMapping,
        providerVerification: verified.verification,
        verifiedAt: verified.verification.verifiedAt,
        sentAt
      });
      await syncRepository.upsertOrderLink?.({
        orderNumber: item.orderNumber,
        pancakeOrderId,
        shopId: String(readiness.shopId || ''),
        syncStatus: 'synced',
        lastSyncedAt: sentAt
      });
      await syncRepository.appendSyncLog?.({
        direction: 'outbound', entityType: 'order', entityId: item.orderNumber,
        orderNumber: item.orderNumber, pancakeOrderId, level: 'info',
        code: 'pancake_structured_address_verified',
        message: 'Pancake order retrieved with Province, District, Commune, phone, and full address persisted.'
      });
      const productSlugs = [...new Set((item.order?.items || [])
        .map((line) => String(line.productId || '').replace(/^catalog-/, ''))
        .filter(Boolean))];
      await inventoryOutboxRepository.enqueueInventorySync(productSlugs, 'website_order', {
        maxAttempts: config.syncMaxAttempts
      });
      summary.sentCount += 1;
    } catch (error) {
      const code = safeProviderCode(error);
      if (pancakeOrderId) {
        await repository.markOrderExportVerificationFailed?.({
          orderNumber: item.orderNumber, pancakeOrderId,
          safeErrorCode: code,
          providerVerification: { valid: false, issues: ['provider_retrieval'], verifiedAt: now().toISOString() }
        });
      } else {
        await repository.markOrderExportFailed(item.orderNumber, code);
      }
      summary.failedCount += 1;
    }
  }

  return { status: 'complete', summary };
}

async function getOrderExportStatus({ repository }) {
  return repository.getOrderExportStatus();
}

module.exports = {
  PancakeOrderExportError,
  buildPancakeOrderPayload,
  getOrderExportStatus,
  normalizeSku,
  redactPancakeOrderPayload,
  retrieveAndVerify,
  runOrderLiveExport,
  runOrderShadowBuild
};
