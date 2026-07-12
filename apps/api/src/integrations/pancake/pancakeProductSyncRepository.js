const { hasDatabaseUrl, query } = require('../../db/postgres');

const memory = new Map();

function emptyStatus(productSlug) {
  return {
    productSlug,
    status: 'missing_mapping',
    pancakeProductId: '',
    mappedVariantCount: 0,
    totalVariantCount: 0,
    variantMappings: [],
    lastAttemptAt: '',
    lastSyncedAt: '',
    lastErrorCode: '',
    stockMismatch: null
  };
}

function fromRows(productSlug, rows, sync) {
  const mappings = rows.map((row) => ({
    localVariantId: row.local_variant_id,
    sku: row.sku || '',
    size: row.size || '',
    stockQuantity: Number(row.stock_quantity || 0),
    pancakeProductId: row.pancake_product_id || '',
    pancakeVariantId: row.pancake_variation_id || '',
    status: row.mapping_status || 'missing'
  }));
  const verified = mappings.filter((mapping) => mapping.status === 'verified' && mapping.pancakeProductId && mapping.pancakeVariantId);
  const productIds = [...new Set(verified.map((mapping) => mapping.pancakeProductId))];
  const mappingComplete = mappings.length > 0 && verified.length === mappings.length && productIds.length === 1;
  const summary = sync?.summary && typeof sync.summary === 'object' ? sync.summary : {};
  return {
    productSlug,
    status: sync?.status || (mappingComplete ? 'never_synced' : 'missing_mapping'),
    pancakeProductId: sync?.pancake_product_id || (productIds.length === 1 ? productIds[0] : ''),
    mappedVariantCount: verified.length,
    totalVariantCount: mappings.length,
    variantMappings: mappings,
    lastAttemptAt: sync?.last_attempt_at || '',
    lastSyncedAt: sync?.last_synced_at || '',
    lastErrorCode: sync?.safe_error_code || '',
    stockMismatch: summary.stockMismatch === undefined ? null : Boolean(summary.stockMismatch)
  };
}

async function listProductSyncStatuses(productSlugs = []) {
  const slugs = [...new Set((productSlugs || []).map((slug) => String(slug || '').trim()).filter(Boolean))].slice(0, 100);
  if (!slugs.length) return [];
  if (!hasDatabaseUrl()) {
    return slugs.map((slug) => memory.get(slug) || emptyStatus(slug));
  }
  const mappings = await query(
    `SELECT p.slug AS product_slug,v.id AS local_variant_id,v.sku,v.size,v.stock_quantity,
            m.pancake_product_id,m.pancake_variation_id,m.status AS mapping_status
       FROM products p
       JOIN product_variants v ON v.product_slug=p.slug
       LEFT JOIN pancake_variant_mappings m ON m.local_variant_id=v.id
      WHERE p.slug=ANY($1::text[])
      ORDER BY p.slug,v.id`,
    [slugs]
  );
  const syncs = await query('SELECT * FROM pancake_product_syncs WHERE product_slug=ANY($1::text[])', [slugs]);
  const bySlug = new Map();
  for (const row of mappings.rows) bySlug.set(row.product_slug, [...(bySlug.get(row.product_slug) || []), row]);
  const syncBySlug = new Map(syncs.rows.map((row) => [row.product_slug, row]));
  return slugs.map((slug) => fromRows(slug, bySlug.get(slug) || [], syncBySlug.get(slug)));
}

async function loadProductSyncReadiness(productSlug, config = {}) {
  const [status] = await listProductSyncStatuses([productSlug]);
  if (!hasDatabaseUrl()) return { ready: false, reason: 'pancake_database_unavailable', status };
  const connection = await query("SELECT * FROM pancake_connections WHERE connection_key='primary'");
  const selected = connection.rows[0] || {};
  const shopId = String(config.shopId || selected.shop_id || '');
  const warehouseId = String(config.warehouseId || selected.warehouse_id || '');
  if (!shopId) return { ready: false, reason: 'shop_not_selected', status };
  if (!warehouseId) return { ready: false, reason: 'warehouse_not_selected', status, shopId };
  const latest = await query('SELECT status,price_unit_status FROM pancake_catalog_imports ORDER BY started_at DESC LIMIT 1');
  const catalog = latest.rows[0];
  if (!catalog || catalog.status !== 'complete') return { ready: false, reason: 'pancake_catalog_not_ready', status, shopId, warehouseId };
  if (!['confirmed_pesos', 'confirmed_centavos'].includes(catalog.price_unit_status)) {
    return { ready: false, reason: 'pancake_price_unit_unconfirmed', status, shopId, warehouseId };
  }
  const productIds = [...new Set(status.variantMappings.map((mapping) => mapping.pancakeProductId).filter(Boolean))];
  if (!status.totalVariantCount || status.mappedVariantCount !== status.totalVariantCount || productIds.length !== 1) {
    return { ready: false, reason: 'pancake_product_mapping_missing', status, shopId, warehouseId };
  }
  return {
    ready: true,
    status,
    shopId,
    warehouseId,
    priceUnitStatus: catalog.price_unit_status,
    pancakeProductId: productIds[0],
    mappings: status.variantMappings
  };
}

async function recordProductSync(record) {
  const normalized = {
    productSlug: String(record.productSlug || ''),
    status: String(record.status || 'failed'),
    pancakeProductId: String(record.pancakeProductId || ''),
    attemptId: String(record.attemptId || ''),
    safeErrorCode: String(record.safeErrorCode || ''),
    summary: record.summary || {},
    lastAttemptAt: record.lastAttemptAt || new Date().toISOString(),
    lastSyncedAt: record.lastSyncedAt || null
  };
  if (!hasDatabaseUrl()) {
    memory.set(normalized.productSlug, {
      ...emptyStatus(normalized.productSlug),
      status: normalized.status,
      pancakeProductId: normalized.pancakeProductId,
      lastAttemptAt: normalized.lastAttemptAt,
      lastSyncedAt: normalized.lastSyncedAt || '',
      lastErrorCode: normalized.safeErrorCode,
      stockMismatch: normalized.summary.stockMismatch ?? null
    });
    return;
  }
  await query(
    `INSERT INTO pancake_product_syncs (
       product_slug,status,pancake_product_id,attempt_id,safe_error_code,summary,last_attempt_at,last_synced_at,updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,now())
     ON CONFLICT (product_slug) DO UPDATE SET
       status=EXCLUDED.status,pancake_product_id=EXCLUDED.pancake_product_id,
       attempt_id=EXCLUDED.attempt_id,safe_error_code=EXCLUDED.safe_error_code,
       summary=EXCLUDED.summary,last_attempt_at=EXCLUDED.last_attempt_at,
       last_synced_at=COALESCE(EXCLUDED.last_synced_at,pancake_product_syncs.last_synced_at),updated_at=now()`,
    [normalized.productSlug, normalized.status, normalized.pancakeProductId, normalized.attemptId,
      normalized.safeErrorCode, JSON.stringify(normalized.summary), normalized.lastAttemptAt, normalized.lastSyncedAt]
  );
}

module.exports = { listProductSyncStatuses, loadProductSyncReadiness, recordProductSync };
