const crypto = require('node:crypto');
const { hasDatabaseUrl, query } = require('../../db/postgres');

const memory = { exports: [] };

function resetMemoryForTests() {
  memory.exports = [];
}

function toPublicRow(row) {
  return {
    id: row.id,
    orderNumber: row.order_number || row.orderNumber,
    mode: row.mode || '',
    status: row.status || '',
    shopId: row.shop_id || row.shopId || '',
    warehouseId: row.warehouse_id || row.warehouseId || '',
    orderSourceId: row.order_source_id || row.orderSourceId || '',
    pancakeOrderId: row.pancake_order_id || row.pancakeOrderId || '',
    requestPayload: row.request_payload || row.requestPayload || {},
    safeErrorCode: row.safe_error_code || row.safeErrorCode || '',
    attemptCount: Number(row.attempt_count || row.attemptCount || 0),
    queuedAt: row.queued_at ? new Date(row.queued_at).toISOString() : (row.queuedAt || ''),
    builtAt: row.built_at ? new Date(row.built_at).toISOString() : (row.builtAt || ''),
    sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : (row.sentAt || ''),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : (row.updatedAt || '')
  };
}

async function enqueueOrderExport(order, options = {}) {
  const orderNumber = String(order?.orderNumber || '').trim();
  if (!orderNumber) return null;
  if (!hasDatabaseUrl()) {
    const existing = memory.exports.find((item) => item.orderNumber === orderNumber);
    if (existing) {
      existing.order = order;
      return existing;
    }
    const record = {
      id: crypto.randomUUID(),
      orderNumber,
      order,
      mode: 'shadow',
      status: 'queued',
      safeErrorCode: '',
      attemptCount: 0,
      queuedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    memory.exports.unshift(record);
    return record;
  }
  const executor = options.client || { query };
  const result = await executor.query(
    `INSERT INTO pancake_order_exports (id,order_number,mode,status,queued_at,updated_at)
     VALUES ($1,$2,'shadow','queued',now(),now())
     ON CONFLICT (order_number) DO UPDATE SET
       status = CASE WHEN pancake_order_exports.status = 'sent' THEN pancake_order_exports.status ELSE 'queued' END,
       safe_error_code = '',
       updated_at = now()
     RETURNING *`,
    [crypto.randomUUID(), orderNumber]
  );
  return toPublicRow(result.rows[0]);
}

async function enqueueMissingOrderExports({ limit = 100 } = {}) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
  if (!hasDatabaseUrl()) return 0;
  const missing = await query(
    `SELECT o.order_number
     FROM orders o
     LEFT JOIN pancake_order_exports e ON e.order_number=o.order_number
     WHERE e.order_number IS NULL
     ORDER BY o.placed_at DESC
     LIMIT $1`,
    [safeLimit]
  );
  for (const row of missing.rows) {
    await enqueueOrderExport({ orderNumber: row.order_number });
  }
  return missing.rows.length;
}

async function loadOrderExportReadiness(config = {}) {
  if (!hasDatabaseUrl()) {
    return {
      ready: false,
      shopId: '',
      warehouseId: '',
      orderSourceId: '',
      priceUnitStatus: '',
      latestCatalog: null,
      mappings: []
    };
  }
  const connection = await query("SELECT * FROM pancake_connections WHERE connection_key='primary'");
  const selected = connection.rows[0] || {};
  const latest = await query('SELECT * FROM pancake_catalog_imports ORDER BY started_at DESC LIMIT 1');
  const catalog = latest.rows[0] || null;
  const mappings = await query(
    `SELECT
       m.local_variant_id,
       m.product_slug,
       m.local_sku,
       m.normalized_sku,
       m.pancake_product_id,
       m.pancake_variation_id
     FROM pancake_variant_mappings m
     WHERE m.status='verified'
     ORDER BY m.product_slug,m.local_sku`
  );
  return {
    ready: true,
    shopId: String(config.shopId || selected.shop_id || ''),
    warehouseId: String(config.warehouseId || selected.warehouse_id || ''),
    orderSourceId: String(config.orderSourceId || selected.order_source_id || ''),
    priceUnitStatus: selected.price_unit_status || '',
    latestCatalog: catalog ? {
      status: catalog.status,
      verifiedCount: Number(catalog.verified_count || 0),
      localVariantCount: Number(catalog.local_variant_count || 0),
      conflictCount: Number(catalog.conflict_count || 0)
    } : null,
    mappings: mappings.rows.map((row) => ({
      localVariantId: row.local_variant_id,
      productSlug: row.product_slug,
      localSku: row.local_sku,
      normalizedSku: row.normalized_sku,
      pancakeProductId: row.pancake_product_id,
      pancakeVariationId: row.pancake_variation_id
    }))
  };
}

async function listQueuedOrderExports({ limit = 50 } = {}) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  if (!hasDatabaseUrl()) {
    return memory.exports
      .filter((item) => ['queued', 'blocked', 'failed'].includes(item.status))
      .slice(0, safeLimit)
      .map((item) => ({ orderNumber: item.orderNumber, order: item.order }));
  }
  const result = await query(
    `SELECT e.order_number,o.*
     FROM pancake_order_exports e
     JOIN orders o ON o.order_number=e.order_number
     WHERE e.status IN ('queued','blocked','failed')
     ORDER BY o.placed_at DESC, e.queued_at DESC
     LIMIT $1`,
    [safeLimit]
  );
  return result.rows.map((row) => ({
    orderNumber: row.order_number,
    order: {
      orderNumber: row.order_number,
      customer: row.customer || {},
      address: row.address || {},
      items: row.items || [],
      shippingFeeCents: Number(row.shipping_fee_cents || 0),
      discountTotalCents: Number(row.discount_total_cents || 0),
      freeShippingUnlocked: Boolean(row.free_shipping_unlocked),
      paymentMethod: row.payment_method || '',
      checkoutChannel: row.checkout_channel || '',
      notes: row.notes || '',
      placedAt: row.placed_at ? new Date(row.placed_at).toISOString() : ''
    }
  }));
}

async function loadOrderExportWorkItem(orderNumber) {
  const normalized = String(orderNumber || '').trim();
  if (!normalized) return null;
  if (!hasDatabaseUrl()) {
    const item = memory.exports.find((candidate) => candidate.orderNumber === normalized && candidate.status !== 'sent');
    return item ? { orderNumber: item.orderNumber, order: item.order } : null;
  }
  const result = await query(
    `SELECT e.order_number,o.*
     FROM pancake_order_exports e
     JOIN orders o ON o.order_number=e.order_number
     WHERE e.order_number=$1 AND e.status <> 'sent'
     LIMIT 1`,
    [normalized]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    orderNumber: row.order_number,
    order: {
      orderNumber: row.order_number,
      customer: row.customer || {},
      address: row.address || {},
      items: row.items || [],
      shippingFeeCents: Number(row.shipping_fee_cents || 0),
      discountTotalCents: Number(row.discount_total_cents || 0),
      freeShippingUnlocked: Boolean(row.free_shipping_unlocked),
      paymentMethod: row.payment_method || '',
      checkoutChannel: row.checkout_channel || '',
      notes: row.notes || '',
      placedAt: row.placed_at ? new Date(row.placed_at).toISOString() : ''
    }
  };
}

async function completeShadowExport(record) {
  if (!hasDatabaseUrl()) {
    const existing = memory.exports.find((item) => item.orderNumber === record.orderNumber);
    if (existing) Object.assign(existing, { ...record, status: 'shadow_built', safeErrorCode: '', updatedAt: record.builtAt });
    return existing;
  }
  const result = await query(
    `UPDATE pancake_order_exports
     SET mode=$2,status='shadow_built',shop_id=$3,warehouse_id=$4,order_source_id=$5,
         request_payload=$6::jsonb,safe_error_code='',attempt_count=attempt_count+1,
         built_at=$7,updated_at=now()
     WHERE order_number=$1
     RETURNING *`,
    [
      record.orderNumber,
      record.mode || 'shadow',
      record.shopId || '',
      record.warehouseId || '',
      record.orderSourceId || '',
      JSON.stringify(record.requestPayload || {}),
      record.builtAt
    ]
  );
  return result.rows[0] ? toPublicRow(result.rows[0]) : null;
}

async function blockOrderExport(orderNumber, safeErrorCode) {
  const normalized = String(orderNumber || '').trim();
  if (!normalized) return null;
  if (!hasDatabaseUrl()) {
    const existing = memory.exports.find((item) => item.orderNumber === normalized);
    if (existing) Object.assign(existing, { status: 'blocked', safeErrorCode, updatedAt: new Date().toISOString() });
    return existing;
  }
  const result = await query(
    `UPDATE pancake_order_exports
     SET status='blocked',safe_error_code=$2,attempt_count=attempt_count+1,updated_at=now()
     WHERE order_number=$1
     RETURNING *`,
    [normalized, safeErrorCode]
  );
  return result.rows[0] ? toPublicRow(result.rows[0]) : null;
}

async function markOrderExportSent(record) {
  const orderNumber = String(record?.orderNumber || '').trim();
  if (!orderNumber) return null;
  if (!hasDatabaseUrl()) {
    const existing = memory.exports.find((item) => item.orderNumber === orderNumber);
    if (existing) Object.assign(existing, {
      ...record,
      mode: record.mode || 'live',
      status: 'sent',
      safeErrorCode: '',
      attemptCount: Number(existing.attemptCount || 0) + 1,
      updatedAt: record.sentAt
    });
    return existing;
  }
  const result = await query(
    `UPDATE pancake_order_exports
     SET mode=$2,status='sent',shop_id=$3,warehouse_id=$4,order_source_id=$5,pancake_order_id=$6,
         request_payload=$7::jsonb,safe_error_code='',attempt_count=attempt_count+1,
         sent_at=$8,updated_at=now()
     WHERE order_number=$1 AND status <> 'sent'
     RETURNING *`,
    [
      orderNumber,
      record.mode || 'live',
      record.shopId || '',
      record.warehouseId || '',
      record.orderSourceId || '',
      record.pancakeOrderId || '',
      JSON.stringify(record.requestPayload || {}),
      record.sentAt
    ]
  );
  return result.rows[0] ? toPublicRow(result.rows[0]) : null;
}

async function markOrderExportFailed(orderNumber, safeErrorCode) {
  const normalized = String(orderNumber || '').trim();
  if (!normalized) return null;
  if (!hasDatabaseUrl()) {
    const existing = memory.exports.find((item) => item.orderNumber === normalized);
    if (existing) Object.assign(existing, {
      status: 'failed',
      safeErrorCode,
      attemptCount: Number(existing.attemptCount || 0) + 1,
      updatedAt: new Date().toISOString()
    });
    return existing;
  }
  const result = await query(
    `UPDATE pancake_order_exports
     SET status='failed',safe_error_code=$2,attempt_count=attempt_count+1,updated_at=now()
     WHERE order_number=$1 AND status <> 'sent'
     RETURNING *`,
    [normalized, safeErrorCode]
  );
  return result.rows[0] ? toPublicRow(result.rows[0]) : null;
}

async function getOrderExportStatus() {
  if (!hasDatabaseUrl()) {
    const summary = summarize(memory.exports);
    return { status: memory.exports.length ? 'ready' : 'never_queued', summary, recent: memory.exports.slice(0, 10).map(toPublicMemoryRow) };
  }
  const counts = await query(
    `SELECT status,count(*)::integer AS count
     FROM pancake_order_exports
     GROUP BY status`
  );
  const recent = await query(
    `SELECT *
     FROM pancake_order_exports
     ORDER BY updated_at DESC
     LIMIT 10`
  );
  return {
    status: recent.rows.length ? 'ready' : 'never_queued',
    summary: summarize(counts.rows.map((row) => ({ status: row.status, count: row.count }))),
    recent: recent.rows.map(toPublicRow)
  };
}

function summarize(rows) {
  const count = (status) => rows
    .filter((item) => item.status === status)
    .reduce((sum, item) => sum + Number(item.count || 1), 0);
  return {
    queuedCount: count('queued'),
    shadowBuiltCount: count('shadow_built'),
    blockedCount: count('blocked'),
    failedCount: count('failed'),
    sentCount: count('sent')
  };
}

function toPublicMemoryRow(row) {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    mode: row.mode || '',
    status: row.status || '',
    shopId: row.shopId || '',
    warehouseId: row.warehouseId || '',
    orderSourceId: row.orderSourceId || '',
    pancakeOrderId: row.pancakeOrderId || '',
    requestPayload: row.requestPayload || {},
    safeErrorCode: row.safeErrorCode || '',
    attemptCount: Number(row.attemptCount || 0),
    queuedAt: row.queuedAt || '',
    builtAt: row.builtAt || '',
    sentAt: row.sentAt || '',
    updatedAt: row.updatedAt || ''
  };
}

module.exports = {
  blockOrderExport,
  completeShadowExport,
  enqueueOrderExport,
  enqueueMissingOrderExports,
  getOrderExportStatus,
  listQueuedOrderExports,
  loadOrderExportWorkItem,
  loadOrderExportReadiness,
  markOrderExportFailed,
  markOrderExportSent,
  resetMemoryForTests
};
