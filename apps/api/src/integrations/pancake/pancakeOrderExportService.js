const syncRepositoryDefault = require('./pancakeOrderSyncRepository');
const inventoryOutboxRepositoryDefault = require('./pancakeInventoryOutboxRepository');
const { buildPancakeOrderNote, buildPancakePaymentPayload } = require('./pancakeOrderMapper');
const { customerFullName } = require('../../customers/customerName');
const {
  formatDeliveryAddress,
  hasCompleteDeliveryInformation
} = require('../../checkout/deliveryDetails');

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

function shippingAddress(order) {
  const address = order.address || {};
  const customer = order.customer || {};
  return {
    full_name: customerFullName(customer),
    phone_number: String(customer.phone || '').trim(),
    address: String(address.houseAddress || '').trim(),
    full_address: formatDeliveryAddress(address),
    post_code: String(address.postalCode || '').trim() || null
  };
}

function buildPancakeOrderPayload(order, readiness) {
  if (!hasCompleteDeliveryInformation(order)) block('pancake_order_delivery_incomplete');
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
  const payment = buildPancakePaymentPayload(order);
  const paymentNote = buildPancakeOrderNote(order);
  const payload = {
    shop_id: safeShopId(readiness.shopId),
    warehouse_id: String(readiness.warehouseId || ''),
    custom_id: String(order.orderNumber || ''),
    bill_full_name: customerFullName(customer),
    bill_phone_number: String(customer.phone || '').trim(),
    bill_email: String(customer.email || '').trim().toLowerCase(),
    shipping_address: shippingAddress(order),
    items,
    shipping_fee: pesosFromCents(order.shippingFeeCents),
    total_discount: pesosFromCents(order.discountTotalCents),
    is_free_shipping: Boolean(order.freeShippingUnlocked),
    received_at_shop: false,
    status: 0,
    cod: payment.cod,
    transfer_money: payment.transfer_money,
    note: paymentNote,
    note_print: paymentNote,
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

async function runOrderShadowBuild({ config, repository, now = () => new Date(), limit = 50 }) {
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
      const request = buildPancakeOrderPayload(item.order, readiness);
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

async function runOrderLiveExport({
  config, client, repository, syncRepository = syncRepositoryDefault,
  inventoryOutboxRepository = inventoryOutboxRepositoryDefault,
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
    try {
      request = buildPancakeOrderPayload(item.order, readiness);
    } catch (error) {
      const code = error instanceof PancakeOrderExportError ? error.code : 'pancake_order_shadow_failed';
      await repository.blockOrderExport(item.orderNumber, code);
      summary.blockedCount += 1;
      continue;
    }

    try {
      const response = await client.createOrder(readiness.shopId, request);
      const sentAt = now().toISOString();
      await repository.markOrderExportSent({
        orderNumber: item.orderNumber,
        mode: 'live',
        shopId: String(readiness.shopId || ''),
        warehouseId: String(readiness.warehouseId || ''),
        orderSourceId: String(readiness.orderSourceId || ''),
        pancakeOrderId: response.pancakeOrderId,
        requestPayload: redactPancakeOrderPayload(request),
        sentAt
      });
      await syncRepository.upsertOrderLink?.({
        orderNumber: item.orderNumber,
        pancakeOrderId: response.pancakeOrderId,
        shopId: String(readiness.shopId || ''),
        syncStatus: 'synced',
        lastSyncedAt: sentAt
      });
      const productSlugs = [...new Set((item.order?.items || [])
        .map((line) => String(line.productId || '').replace(/^catalog-/, ''))
        .filter(Boolean))];
      await inventoryOutboxRepository.enqueueInventorySync(productSlugs, 'website_order', {
        maxAttempts: config.syncMaxAttempts
      });
      summary.sentCount += 1;
    } catch (error) {
      await repository.markOrderExportFailed(item.orderNumber, safeProviderCode(error));
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
  runOrderLiveExport,
  runOrderShadowBuild
};
