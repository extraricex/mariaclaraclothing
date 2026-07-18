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
    responsePayload: row.response_payload || row.responsePayload || {},
    addressMapping: row.address_mapping || row.addressMapping || {},
    providerVerification: row.provider_verification || row.providerVerification || {},
    safeErrorCode: row.safe_error_code || row.safeErrorCode || '',
    attemptCount: Number(row.attempt_count || row.attemptCount || 0),
    queuedAt: row.queued_at ? new Date(row.queued_at).toISOString() : (row.queuedAt || ''),
    builtAt: row.built_at ? new Date(row.built_at).toISOString() : (row.builtAt || ''),
    sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : (row.sentAt || ''),
    verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : (row.verifiedAt || ''),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : (row.updatedAt || '')
  };
}

function exportStatusForOrder(order = {}) {
  const paymongo = String(order.paymentMethod || order.paymentProvider || '').trim().toLowerCase() === 'paymongo';
  return paymongo && String(order.paymentStatus || '').trim().toLowerCase() !== 'paid'
    ? 'waiting_payment'
    : 'queued';
}

async function enqueueOrderExport(order, options = {}) {
  const orderNumber = String(order?.orderNumber || '').trim();
  if (!orderNumber) return null;
  if (String(order?.status || '').toLowerCase() === 'cancelled') return null;
  if (String(order?.checkoutChannel || '').trim().toLowerCase() === 'pancake_pos') return null;
  const desiredStatus = exportStatusForOrder(order);
  if (!hasDatabaseUrl()) {
    const existing = memory.exports.find((item) => item.orderNumber === orderNumber);
    if (existing) {
      existing.order = order;
      if (existing.status !== 'sent') {
        existing.status = existing.pancakeOrderId ? 'created_unverified' : desiredStatus;
        existing.safeErrorCode = '';
      }
      return existing;
    }
    const record = {
      id: crypto.randomUUID(),
      orderNumber,
      order,
      mode: 'shadow',
      status: desiredStatus,
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
     VALUES ($1,$2,'shadow',$3,now(),now())
     ON CONFLICT (order_number) DO UPDATE SET
       status = CASE
         WHEN pancake_order_exports.status = 'sent' THEN pancake_order_exports.status
         WHEN pancake_order_exports.pancake_order_id <> '' THEN 'created_unverified'
         ELSE EXCLUDED.status
       END,
       safe_error_code = CASE WHEN pancake_order_exports.status = 'sent' THEN pancake_order_exports.safe_error_code ELSE '' END,
       updated_at = now()
     RETURNING *`,
    [crypto.randomUUID(), orderNumber, desiredStatus]
  );
  return toPublicRow(result.rows[0]);
}

async function enqueueMissingOrderExports({ limit = 100, placedAfter = '' } = {}) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
  if (!hasDatabaseUrl()) return 0;
  const missing = await query(
    `SELECT o.order_number,o.payment_method,o.payment_provider,o.payment_status,o.status
     FROM orders o
     LEFT JOIN pancake_order_exports e ON e.order_number=o.order_number
     WHERE e.order_number IS NULL
       AND o.status <> 'cancelled'
       AND lower(COALESCE(o.checkout_channel,'')) <> 'pancake_pos'
       AND ($2::timestamptz IS NULL OR o.placed_at >= $2::timestamptz)
     ORDER BY o.placed_at DESC
     LIMIT $1`,
    [safeLimit, placedAfter || null]
  );
  for (const row of missing.rows) {
    await enqueueOrderExport({
      orderNumber: row.order_number,
      paymentMethod: row.payment_method,
      paymentProvider: row.payment_provider,
      paymentStatus: row.payment_status,
      status: row.status
    });
  }
  return missing.rows.length;
}

function rowToExportOrder(row = {}) {
  return {
    orderNumber: row.order_number,
    customer: row.customer || {},
    address: row.address || {},
    items: row.items || [],
    subtotalCents: Number(row.subtotal_cents || 0),
    shippingFeeCents: Number(row.shipping_fee_cents || 0),
    discountTotalCents: Number(row.discount_total_cents || 0),
    totalCents: Number(row.total_cents || 0),
    currency: row.currency || 'PHP',
    freeShippingUnlocked: Boolean(row.free_shipping_unlocked),
    paymentMethod: row.payment_method || '',
    paymentProvider: row.payment_provider || '',
    paymentStatus: row.payment_status || '',
    providerCheckoutSessionId: row.provider_checkout_session_id || '',
    providerPaymentId: row.provider_payment_id || '',
    paidAmountCents: row.paid_amount_cents === null || row.paid_amount_cents === undefined
      ? null : Number(row.paid_amount_cents),
    status: row.status || '',
    checkoutChannel: row.checkout_channel || '',
    notes: row.notes || '',
    placedAt: row.placed_at ? new Date(row.placed_at).toISOString() : '',
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : ''
  };
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

async function listQueuedOrderExports({ limit = 50, placedAfter = '' } = {}) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  if (!hasDatabaseUrl()) {
    const cutoff = placedAfter ? new Date(placedAfter).getTime() : 0;
    return memory.exports
      .filter((item) => ['queued', 'created_unverified', 'failed'].includes(item.status)
        && String(item.order?.status || '') !== 'cancelled'
        && String(item.order?.checkoutChannel || '').trim().toLowerCase() !== 'pancake_pos'
        && exportStatusForOrder(item.order) !== 'waiting_payment'
        && (!cutoff || new Date(item.order?.placedAt || 0).getTime() >= cutoff))
      .slice(0, safeLimit)
      .map((item) => ({
        orderNumber: item.orderNumber,
        status: item.status,
        pancakeOrderId: item.pancakeOrderId || '',
        order: item.order
      }));
  }
  const result = await query(
    `SELECT e.order_number,e.status AS export_status,e.pancake_order_id,o.*
     FROM pancake_order_exports e
     JOIN orders o ON o.order_number=e.order_number
     WHERE e.status IN ('queued','created_unverified','failed')
       AND o.status <> 'cancelled'
       AND lower(COALESCE(o.checkout_channel,'')) <> 'pancake_pos'
       AND (lower(COALESCE(o.payment_method,'')) <> 'paymongo' OR o.payment_status='paid')
       AND ($2::timestamptz IS NULL OR o.placed_at >= $2::timestamptz)
     ORDER BY o.placed_at DESC, e.queued_at DESC
     LIMIT $1`,
    [safeLimit, placedAfter || null]
  );
  return result.rows.map((row) => ({
    orderNumber: row.order_number,
    status: row.export_status,
    pancakeOrderId: row.pancake_order_id || '',
    order: rowToExportOrder(row)
  }));
}

async function loadOrderExportWorkItem(orderNumber, { placedAfter = '' } = {}) {
  const normalized = String(orderNumber || '').trim();
  if (!normalized) return null;
  if (!hasDatabaseUrl()) {
    const cutoff = placedAfter ? new Date(placedAfter).getTime() : 0;
    const item = memory.exports.find((candidate) => candidate.orderNumber === normalized
      && ['queued', 'created_unverified', 'blocked', 'failed'].includes(candidate.status)
      && String(candidate.order?.status || '') !== 'cancelled'
      && String(candidate.order?.checkoutChannel || '').trim().toLowerCase() !== 'pancake_pos'
      && exportStatusForOrder(candidate.order) !== 'waiting_payment'
      && (!cutoff || new Date(candidate.order?.placedAt || 0).getTime() >= cutoff));
    return item ? {
      orderNumber: item.orderNumber, status: item.status,
      pancakeOrderId: item.pancakeOrderId || '', order: item.order
    } : null;
  }
  const result = await query(
    `SELECT e.order_number,e.status AS export_status,e.pancake_order_id,o.*
     FROM pancake_order_exports e
     JOIN orders o ON o.order_number=e.order_number
     WHERE e.order_number=$1 AND e.status IN ('queued','created_unverified','blocked','failed') AND o.status <> 'cancelled'
       AND lower(COALESCE(o.checkout_channel,'')) <> 'pancake_pos'
       AND (lower(COALESCE(o.payment_method,'')) <> 'paymongo' OR o.payment_status='paid')
       AND ($2::timestamptz IS NULL OR o.placed_at >= $2::timestamptz)
     LIMIT 1`,
    [normalized, placedAfter || null]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    orderNumber: row.order_number,
    status: row.export_status,
    pancakeOrderId: row.pancake_order_id || '',
    order: rowToExportOrder(row)
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

async function saveOrderAddressMapping(orderNumber, addressMapping) {
  const normalized = String(orderNumber || '').trim();
  if (!normalized) return null;
  if (!hasDatabaseUrl()) {
    const existing = memory.exports.find((item) => item.orderNumber === normalized);
    if (existing) {
      Object.assign(existing, {
        addressMapping: addressMapping || {}, updatedAt: new Date().toISOString()
      });
      existing.order.address = {
        ...(existing.order.address || {}),
        pancakeCountryCode: addressMapping?.countryCode || '63',
        pancakeProvinceId: addressMapping?.province?.id || '',
        pancakeProvinceName: addressMapping?.province?.name || '',
        pancakeDistrictId: addressMapping?.district?.id || '',
        pancakeDistrictName: addressMapping?.district?.name || '',
        pancakeCommuneId: addressMapping?.commune?.id || '',
        pancakeCommuneName: addressMapping?.commune?.name || '',
        pancakeMappingStatus: addressMapping?.mappingStatus || '',
        pancakeMappingResolvedAt: addressMapping?.resolvedAt || ''
      };
    }
    return existing || null;
  }
  const result = await query(
    `UPDATE pancake_order_exports
     SET address_mapping=$2::jsonb,updated_at=now()
     WHERE order_number=$1 RETURNING *`,
    [normalized, JSON.stringify(addressMapping || {})]
  );
  await query(
    `UPDATE orders
     SET address = address || $2::jsonb,updated_at=now()
     WHERE order_number=$1`,
    [normalized, JSON.stringify({
      pancakeCountryCode: addressMapping?.countryCode || '63',
      pancakeProvinceId: addressMapping?.province?.id || '',
      pancakeProvinceName: addressMapping?.province?.name || '',
      pancakeDistrictId: addressMapping?.district?.id || '',
      pancakeDistrictName: addressMapping?.district?.name || '',
      pancakeCommuneId: addressMapping?.commune?.id || '',
      pancakeCommuneName: addressMapping?.commune?.name || '',
      pancakeMappingStatus: addressMapping?.mappingStatus || '',
      pancakeMappingResolvedAt: addressMapping?.resolvedAt || ''
    })]
  );
  return result.rows[0] ? toPublicRow(result.rows[0]) : null;
}

async function markOrderExportCreated(record) {
  const orderNumber = String(record?.orderNumber || '').trim();
  if (!orderNumber || !String(record?.pancakeOrderId || '').trim()) return null;
  if (!hasDatabaseUrl()) {
    const existing = memory.exports.find((item) => item.orderNumber === orderNumber);
    if (existing) Object.assign(existing, {
      ...record,
      mode: record.mode || 'live',
      status: 'created_unverified',
      safeErrorCode: '',
      attemptCount: Number(existing.attemptCount || 0) + 1,
      updatedAt: record.createdAt || new Date().toISOString()
    });
    return existing || null;
  }
  const result = await query(
    `UPDATE pancake_order_exports
     SET mode=$2,status='created_unverified',shop_id=$3,warehouse_id=$4,order_source_id=$5,
         pancake_order_id=$6,request_payload=$7::jsonb,response_payload=$8::jsonb,
         address_mapping=$9::jsonb,safe_error_code='',attempt_count=attempt_count+1,updated_at=now()
     WHERE order_number=$1 AND status <> 'sent'
     RETURNING *`,
    [
      orderNumber, record.mode || 'live', record.shopId || '', record.warehouseId || '',
      record.orderSourceId || '', record.pancakeOrderId || '',
      JSON.stringify(record.requestPayload || {}), JSON.stringify(record.responsePayload || {}),
      JSON.stringify(record.addressMapping || {})
    ]
  );
  return result.rows[0] ? toPublicRow(result.rows[0]) : null;
}

async function markOrderExportVerificationFailed(record) {
  const orderNumber = String(record?.orderNumber || '').trim();
  if (!orderNumber) return null;
  if (!hasDatabaseUrl()) {
    const existing = memory.exports.find((item) => item.orderNumber === orderNumber);
    if (existing) Object.assign(existing, {
      pancakeOrderId: record.pancakeOrderId || existing.pancakeOrderId || '',
      status: 'created_unverified',
      safeErrorCode: record.safeErrorCode || 'pancake_address_verification_failed',
      providerVerification: record.providerVerification || {},
      responsePayload: record.responsePayload || existing.responsePayload || {},
      updatedAt: new Date().toISOString()
    });
    return existing || null;
  }
  const result = await query(
    `UPDATE pancake_order_exports
     SET status='created_unverified',
         pancake_order_id=CASE WHEN $2<>'' THEN $2 ELSE pancake_order_id END,
         safe_error_code=$3,provider_verification=$4::jsonb,
         response_payload=CASE WHEN $5::jsonb='{}'::jsonb THEN response_payload ELSE $5::jsonb END,
         updated_at=now()
     WHERE order_number=$1 AND status <> 'sent'
     RETURNING *`,
    [
      orderNumber, record.pancakeOrderId || '',
      record.safeErrorCode || 'pancake_address_verification_failed',
      JSON.stringify(record.providerVerification || {}), JSON.stringify(record.responsePayload || {})
    ]
  );
  return result.rows[0] ? toPublicRow(result.rows[0]) : null;
}

async function recordOrderAddressVerification(record) {
  const orderNumber = String(record?.orderNumber || '').trim();
  if (!orderNumber) return null;
  if (!hasDatabaseUrl()) {
    const existing = memory.exports.find((item) => item.orderNumber === orderNumber);
    if (existing) Object.assign(existing, {
      addressMapping: record.addressMapping || existing.addressMapping || {},
      providerVerification: record.providerVerification || {},
      responsePayload: record.responsePayload || existing.responsePayload || {},
      safeErrorCode: record.providerVerification?.valid ? '' : (record.safeErrorCode || 'pancake_address_verification_failed'),
      verifiedAt: record.providerVerification?.valid ? (record.verifiedAt || new Date().toISOString()) : existing.verifiedAt || '',
      updatedAt: new Date().toISOString()
    });
    return existing || null;
  }
  const result = await query(
    `UPDATE pancake_order_exports
     SET address_mapping=$2::jsonb,provider_verification=$3::jsonb,response_payload=$4::jsonb,
         safe_error_code=CASE WHEN $5 THEN '' ELSE $6 END,
         verified_at=CASE WHEN $5 THEN $7 ELSE verified_at END,
         updated_at=now()
     WHERE order_number=$1 RETURNING *`,
    [
      orderNumber, JSON.stringify(record.addressMapping || {}),
      JSON.stringify(record.providerVerification || {}), JSON.stringify(record.responsePayload || {}),
      Boolean(record.providerVerification?.valid), record.safeErrorCode || 'pancake_address_verification_failed',
      record.verifiedAt || new Date().toISOString()
    ]
  );
  return result.rows[0] ? toPublicRow(result.rows[0]) : null;
}

async function getOrderExportRecord(orderNumber) {
  const normalized = String(orderNumber || '').trim();
  if (!normalized) return null;
  if (!hasDatabaseUrl()) {
    const existing = memory.exports.find((item) => item.orderNumber === normalized);
    return existing ? toPublicMemoryRow(existing) : null;
  }
  const result = await query('SELECT * FROM pancake_order_exports WHERE order_number=$1', [normalized]);
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
      updatedAt: record.sentAt,
      verifiedAt: record.verifiedAt || record.sentAt
    });
    return existing;
  }
  const result = await query(
    `UPDATE pancake_order_exports
     SET mode=$2,status='sent',shop_id=$3,warehouse_id=$4,order_source_id=$5,pancake_order_id=$6,
         request_payload=$7::jsonb,response_payload=$8::jsonb,address_mapping=$9::jsonb,
         provider_verification=$10::jsonb,safe_error_code='',attempt_count=attempt_count+1,
         sent_at=$11,verified_at=$12,updated_at=now()
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
      JSON.stringify(record.responsePayload || {}),
      JSON.stringify(record.addressMapping || {}),
      JSON.stringify(record.providerVerification || {}),
      record.sentAt,
      record.verifiedAt || record.sentAt
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

async function markOrderExportSkipped(orderNumber, safeErrorCode = 'pancake_order_cancelled_before_export') {
  const normalized = String(orderNumber || '').trim();
  if (!normalized) return null;
  if (!hasDatabaseUrl()) {
    const existing = memory.exports.find((item) => item.orderNumber === normalized);
    if (existing && existing.status !== 'sent') Object.assign(existing, {
      status: 'skipped', safeErrorCode, updatedAt: new Date().toISOString()
    });
    return existing || null;
  }
  const result = await query(
    `UPDATE pancake_order_exports
     SET status='skipped',safe_error_code=$2,updated_at=now()
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
    waitingPaymentCount: count('waiting_payment'),
    shadowBuiltCount: count('shadow_built'),
    createdUnverifiedCount: count('created_unverified'),
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
    responsePayload: row.responsePayload || {},
    addressMapping: row.addressMapping || {},
    providerVerification: row.providerVerification || {},
    safeErrorCode: row.safeErrorCode || '',
    attemptCount: Number(row.attemptCount || 0),
    queuedAt: row.queuedAt || '',
    builtAt: row.builtAt || '',
    sentAt: row.sentAt || '',
    verifiedAt: row.verifiedAt || '',
    updatedAt: row.updatedAt || ''
  };
}

module.exports = {
  blockOrderExport,
  completeShadowExport,
  enqueueOrderExport,
  enqueueMissingOrderExports,
  getOrderExportRecord,
  getOrderExportStatus,
  listQueuedOrderExports,
  loadOrderExportWorkItem,
  loadOrderExportReadiness,
  markOrderExportCreated,
  markOrderExportFailed,
  markOrderExportSkipped,
  markOrderExportSent,
  markOrderExportVerificationFailed,
  recordOrderAddressVerification,
  resetMemoryForTests,
  saveOrderAddressMapping
};
