const crypto = require('node:crypto');
const { hasDatabaseUrl, query, transaction } = require('../../db/postgres');

const memory = { imports: [], shops: [], references: { shops: [], warehouses: [], orderSources: [] }, mappings: [], conflicts: [], selection: {} };

const digest = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function beginImport(meta) {
  if (!hasDatabaseUrl()) { memory.imports.unshift({ ...meta, status: 'running' }); return; }
  try {
    await query(`INSERT INTO pancake_catalog_imports (id,shop_id,status,started_at) VALUES ($1,$2,'running',$3)`, [meta.id, meta.shopId || '', meta.startedAt]);
  } catch (error) {
    if (error?.code === '23505') throw Object.assign(new Error('Import in progress'), { code: 'pancake_import_in_progress' });
    throw error;
  }
}

async function saveDiscoveredShops(importId, shops) {
  memory.references.shops = shops;
  if (!hasDatabaseUrl()) return;
  const seenAt = new Date().toISOString();
  await transaction(async (client) => {
    for (const shop of shops) await client.query(
      `INSERT INTO pancake_shops (shop_id,name,safe_digest,last_seen_at) VALUES ($1,$2,$3,$4)
       ON CONFLICT (shop_id) DO UPDATE SET name=EXCLUDED.name,safe_digest=EXCLUDED.safe_digest,last_seen_at=EXCLUDED.last_seen_at`,
      [shop.id, shop.name, digest(shop), seenAt]
    );
  });
}

async function loadEffectiveSelection(config) {
  if (!hasDatabaseUrl()) return { ...memory.selection, shopId: config.shopId || memory.selection.shopId || '', warehouseId: config.warehouseId || memory.selection.warehouseId || '', orderSourceId: config.orderSourceId || memory.selection.orderSourceId || '' };
  const result = await query("SELECT * FROM pancake_connections WHERE connection_key='primary'");
  const row = result.rows[0] || {};
  return { shopId: config.shopId || row.shop_id || '', warehouseId: config.warehouseId || row.warehouse_id || '', orderSourceId: config.orderSourceId || row.order_source_id || '' };
}

async function loadActiveLocalVariants() {
  if (!hasDatabaseUrl()) return [];
  const result = await query(`SELECT v.id,v.product_slug,v.sku,v.price_cents,v.external_pos_variant_id,p.status,p.price_cents AS product_price_cents
    FROM product_variants v JOIN products p ON p.slug=v.product_slug WHERE p.status NOT IN ('draft','archived') ORDER BY v.id`);
  return result.rows.map((row) => ({ id: row.id, productSlug: row.product_slug, sku: row.sku, status: row.status, priceCents: row.price_cents || row.product_price_cents, externalPosVariantId: row.external_pos_variant_id || '' }));
}

async function completeShopDiscovery(importId) {
  if (!hasDatabaseUrl()) { const item = memory.imports.find((entry) => entry.id === importId); if (item) item.status = 'shop_selection_required'; return; }
  await query("UPDATE pancake_catalog_imports SET status='shop_selection_required',finished_at=now() WHERE id=$1", [importId]);
}

async function failImport(importId, safeErrorCode, durationMs = 0) {
  if (!hasDatabaseUrl()) { const item = memory.imports.find((entry) => entry.id === importId); if (item) Object.assign(item, { status: 'failed', safeErrorCode }); return; }
  await query("UPDATE pancake_catalog_imports SET status='failed',safe_error_code=$2,duration_ms=$3,finished_at=now() WHERE id=$1", [importId, safeErrorCode, durationMs]);
}

async function commitCompleteImport(snapshot) {
  if (!hasDatabaseUrl()) {
    memory.references = { shops: snapshot.shops, warehouses: snapshot.warehouses, orderSources: snapshot.orderSources };
    memory.mappings = snapshot.mappingResult.mappings; memory.conflicts = snapshot.mappingResult.conflicts;
    const item = memory.imports.find((entry) => entry.id === snapshot.importId); if (item) item.status = 'complete';
    return;
  }
  await transaction(async (client) => {
    const seenAt = snapshot.finishedAt;
    for (const item of snapshot.warehouses) await client.query(
      `INSERT INTO pancake_warehouses (shop_id,warehouse_id,name,allow_create_order,source_updated_at,last_seen_at) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (shop_id,warehouse_id) DO UPDATE SET name=EXCLUDED.name,allow_create_order=EXCLUDED.allow_create_order,source_updated_at=EXCLUDED.source_updated_at,last_seen_at=EXCLUDED.last_seen_at`,
      [snapshot.shopId, item.id, item.name, item.allowCreateOrder, item.sourceUpdatedAt, seenAt]
    );
    for (const item of snapshot.orderSources) await client.query(
      `INSERT INTO pancake_order_sources (shop_id,order_source_id,parent_id,name,source_updated_at,last_seen_at) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (shop_id,order_source_id) DO UPDATE SET parent_id=EXCLUDED.parent_id,name=EXCLUDED.name,source_updated_at=EXCLUDED.source_updated_at,last_seen_at=EXCLUDED.last_seen_at`,
      [snapshot.shopId, item.id, item.parentId || null, item.name, item.sourceUpdatedAt, seenAt]
    );
    await client.query('DELETE FROM pancake_catalog_variations WHERE shop_id=$1', [snapshot.shopId]);
    for (const item of snapshot.variations) await client.query(
      `INSERT INTO pancake_catalog_variations (shop_id,pancake_product_id,pancake_variation_id,display_id,normalized_sku,product_name,retail_price_raw,is_hidden,is_locked,source_updated_at,payload_digest,last_seen_import_id,last_seen_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [snapshot.shopId, item.product_id, item.id, item.display_id, String(item.display_id || '').normalize('NFKC').trim().toUpperCase(), item.product.name, Number.isFinite(Number(item.retail_price)) ? Number(item.retail_price) : null, item.is_hidden, item.is_locked, item.updated_at, digest(item), snapshot.importId, seenAt]
    );
    await client.query('DELETE FROM pancake_variant_mappings');
    for (const item of snapshot.mappingResult.mappings) {
      await client.query(`INSERT INTO pancake_variant_mappings (id,local_variant_id,product_slug,local_sku,normalized_sku,pancake_product_id,pancake_variation_id,warehouse_id,status,last_verified_import_id,last_verified_at,payload_digest)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [crypto.randomUUID(), item.localVariantId || null, item.productSlug, item.localSku, item.normalizedSku, item.pancakeProductId, item.pancakeVariationId, snapshot.selection.warehouseId || '', item.status, snapshot.importId, item.verifiedAt, item.payloadDigest]);
      if (item.status === 'verified') await client.query(`UPDATE product_variants SET external_pos_variant_id=$1 WHERE id=$2 AND (external_pos_variant_id='' OR external_pos_variant_id=$1)`, [item.pancakeVariationId, item.localVariantId]);
    }
    const keys = snapshot.mappingResult.conflicts.map((item) => item.conflictKey);
    for (const item of snapshot.mappingResult.conflicts) await client.query(
      `INSERT INTO pancake_sync_conflicts (id,conflict_key,entity_type,entity_id,code,severity,context,status,first_seen_at,last_seen_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'open',$8,$8)
       ON CONFLICT (conflict_key) DO UPDATE SET context=EXCLUDED.context,status='open',occurrence_count=pancake_sync_conflicts.occurrence_count+1,last_seen_at=EXCLUDED.last_seen_at,resolved_at=NULL`,
      [crypto.randomUUID(), item.conflictKey, item.entityType, item.entityId, item.code, item.severity, JSON.stringify(item.context || {}), seenAt]
    );
    if (keys.length) await client.query("UPDATE pancake_sync_conflicts SET status='resolved',resolved_at=$1 WHERE status='open' AND NOT (conflict_key=ANY($2::text[]))", [seenAt, keys]);
    else await client.query("UPDATE pancake_sync_conflicts SET status='resolved',resolved_at=$1 WHERE status='open'", [seenAt]);
    await client.query(`UPDATE pancake_catalog_imports SET status='complete',shop_id=$2,page_count=$3,pancake_variation_count=$4,local_variant_count=$5,verified_count=$6,conflict_count=$7,price_unit_status=$8,finished_at=$9,duration_ms=GREATEST(0,EXTRACT(EPOCH FROM ($9::timestamptz-started_at))*1000)::integer WHERE id=$1`,
      [snapshot.importId, snapshot.shopId, snapshot.pageCount, snapshot.variations.length, snapshot.mappingResult.summary.localVariantCount, snapshot.mappingResult.summary.verifiedCount, snapshot.mappingResult.summary.conflictCount, snapshot.mappingResult.priceEvidence.status, snapshot.finishedAt]);
    await client.query("UPDATE pancake_connections SET price_unit_status=$1,updated_at=now() WHERE connection_key='primary'", [snapshot.mappingResult.priceEvidence.status]);
  });
}

async function getCatalogStatus() {
  if (!hasDatabaseUrl()) return memory.imports[0] || { status: 'never_imported' };
  const result = await query('SELECT * FROM pancake_catalog_imports ORDER BY started_at DESC LIMIT 1');
  const row = result.rows[0];
  return row ? { status: row.status, importId: row.id, summary: { localVariantCount: row.local_variant_count, pancakeVariationCount: row.pancake_variation_count, verifiedCount: row.verified_count, conflictCount: row.conflict_count }, validation: { priceUnitStatus: row.price_unit_status }, lastErrorCode: row.safe_error_code || '', finishedAt: row.finished_at || '' } : { status: 'never_imported' };
}

async function listReferences() {
  if (!hasDatabaseUrl()) return memory.references;
  const [shops, warehouses, sources] = await Promise.all([query('SELECT shop_id AS id,name FROM pancake_shops ORDER BY name'), query('SELECT warehouse_id AS id,name,allow_create_order FROM pancake_warehouses ORDER BY name'), query('SELECT order_source_id AS id,parent_id,name FROM pancake_order_sources ORDER BY name')]);
  return { shops: shops.rows, warehouses: warehouses.rows.map((r) => ({ ...r, allowCreateOrder: r.allow_create_order })), orderSources: sources.rows.map((r) => ({ id: r.id, parentId: r.parent_id || '', name: r.name })) };
}

async function listMappings({ page = 1, pageSize = 50, search = '', conflictOnly = false } = {}) {
  if (!hasDatabaseUrl()) return { items: memory.mappings, conflicts: memory.conflicts, page: 1, pageSize, total: memory.mappings.length };
  const values = [`%${String(search).replace(/[\\%_]/g, '\\$&')}%`];
  const conflictClause = conflictOnly ? "AND m.status <> 'verified'" : '';
  const result = await query(`SELECT m.*,p.name AS product_name FROM pancake_variant_mappings m LEFT JOIN products p ON p.slug=m.product_slug WHERE (m.local_sku ILIKE $1 ESCAPE '\\' OR p.name ILIKE $1 ESCAPE '\\') ${conflictClause} ORDER BY m.product_slug,m.local_sku LIMIT $2 OFFSET $3`, [values[0], pageSize, (page - 1) * pageSize]);
  const count = await query(`SELECT count(*)::integer AS count FROM pancake_variant_mappings m LEFT JOIN products p ON p.slug=m.product_slug WHERE (m.local_sku ILIKE $1 ESCAPE '\\' OR p.name ILIKE $1 ESCAPE '\\') ${conflictClause}`, values);
  return { items: result.rows, page, pageSize, total: count.rows[0].count };
}

async function saveSelection(selection, locks = {}) {
  const safe = { shopId: String(selection.shopId || ''), warehouseId: String(selection.warehouseId || ''), orderSourceId: String(selection.orderSourceId || '') };
  memory.selection = { ...memory.selection, ...safe };
  if (!hasDatabaseUrl()) return safe;
  const current = await loadEffectiveSelection({});
  const next = { shopId: locks.shopLocked ? current.shopId : safe.shopId, warehouseId: locks.warehouseLocked ? current.warehouseId : safe.warehouseId, orderSourceId: locks.orderSourceLocked ? current.orderSourceId : safe.orderSourceId };
  await query(`INSERT INTO pancake_connections (connection_key,shop_id,warehouse_id,order_source_id) VALUES ('primary',$1,$2,$3)
    ON CONFLICT (connection_key) DO UPDATE SET shop_id=$1,warehouse_id=$2,order_source_id=$3,updated_at=now()`, [next.shopId, next.warehouseId, next.orderSourceId]);
  return next;
}

module.exports = { beginImport, commitCompleteImport, completeShopDiscovery, failImport, getCatalogStatus, listMappings, listReferences, loadActiveLocalVariants, loadEffectiveSelection, saveDiscoveredShops, saveSelection };
