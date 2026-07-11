const crypto = require('node:crypto');
const { hasDatabaseUrl, query, transaction } = require('../../db/postgres');

const memory = { runs: [] };

async function beginInventoryReconciliation(meta) {
  if (!hasDatabaseUrl()) {
    memory.runs.unshift({ ...meta, status: 'running' });
    return;
  }
  await query(
    `INSERT INTO pancake_inventory_reconciliations (id,status,started_at)
     VALUES ($1,'running',$2)`,
    [meta.id, meta.startedAt]
  );
}

async function loadInventoryReadiness(config = {}) {
  if (!hasDatabaseUrl()) return { ready: false, reason: 'pancake_database_unavailable', mappings: [] };
  const connection = await query("SELECT * FROM pancake_connections WHERE connection_key='primary'");
  const selected = connection.rows[0] || {};
  const shopId = String(config.shopId || selected.shop_id || '');
  const warehouseId = String(config.warehouseId || selected.warehouse_id || '');
  if (!shopId) return { ready: false, reason: 'shop_not_selected', mappings: [] };
  if (!warehouseId) return { ready: false, reason: 'warehouse_not_selected', shopId, mappings: [] };

  const latest = await query('SELECT * FROM pancake_catalog_imports ORDER BY started_at DESC LIMIT 1');
  const catalog = latest.rows[0];
  if (!catalog || catalog.status !== 'complete' || Number(catalog.conflict_count || 0) > 0 || Number(catalog.verified_count || 0) !== Number(catalog.local_variant_count || 0)) {
    return { ready: false, reason: 'pancake_catalog_not_ready', shopId, warehouseId, latestCatalog: catalog || null, mappings: [] };
  }

  const mappings = await query(
    `SELECT
      m.local_variant_id,
      m.product_slug,
      p.name AS product_name,
      v.sku,
      v.size,
      v.stock_quantity,
      m.pancake_variation_id
    FROM pancake_variant_mappings m
    JOIN product_variants v ON v.id=m.local_variant_id
    JOIN products p ON p.slug=v.product_slug
    WHERE m.status='verified' AND p.status NOT IN ('draft','archived')
    ORDER BY m.local_variant_id`
  );

  return {
    ready: true,
    shopId,
    warehouseId,
    latestCatalog: {
      status: catalog.status,
      verifiedCount: Number(catalog.verified_count || 0),
      localVariantCount: Number(catalog.local_variant_count || 0),
      conflictCount: Number(catalog.conflict_count || 0)
    },
    mappings: mappings.rows.map((row) => ({
      localVariantId: row.local_variant_id,
      productSlug: row.product_slug,
      productName: row.product_name,
      sku: row.sku,
      size: row.size,
      stockQuantity: Number(row.stock_quantity || 0),
      pancakeVariationId: row.pancake_variation_id
    }))
  };
}

async function completeInventoryReconciliation(snapshot) {
  if (!hasDatabaseUrl()) {
    const run = memory.runs.find((item) => item.id === snapshot.runId);
    if (run) Object.assign(run, { status: 'complete', summary: snapshot.summary });
    return snapshot.summary;
  }

  await transaction(async (client) => {
    for (const item of snapshot.updates) {
      await client.query(
        'UPDATE product_variants SET stock_quantity=$1 WHERE id=$2',
        [item.nextQuantity, item.localVariantId]
      );
      if (item.quantityChange !== 0) {
        await client.query(
          `INSERT INTO inventory_movements (
            id, order_number, source, reason, product_slug, product_name, sku,
            size, quantity_change, created_at
          ) VALUES ($1,'','pancake','pancake_reconcile',$2,$3,$4,$5,$6,$7)`,
          [
            crypto.randomUUID(),
            item.productSlug || '',
            item.productName || '',
            item.sku || '',
            item.size || '',
            item.quantityChange,
            snapshot.finishedAt
          ]
        );
      }
    }

    const keys = snapshot.conflicts.map((item) => item.conflictKey);
    for (const item of snapshot.conflicts) {
      await client.query(
        `INSERT INTO pancake_sync_conflicts (id,conflict_key,entity_type,entity_id,code,severity,context,status,first_seen_at,last_seen_at)
         VALUES ($1,$2,$3,$4,$5,'blocking',$6::jsonb,'open',$7,$7)
         ON CONFLICT (conflict_key) DO UPDATE SET context=EXCLUDED.context,status='open',occurrence_count=pancake_sync_conflicts.occurrence_count+1,last_seen_at=EXCLUDED.last_seen_at,resolved_at=NULL`,
        [crypto.randomUUID(), item.conflictKey, item.entityType, item.entityId, item.code, JSON.stringify(item.context || {}), snapshot.finishedAt]
      );
    }
    if (keys.length) {
      await client.query("UPDATE pancake_sync_conflicts SET status='resolved',resolved_at=$1 WHERE status='open' AND conflict_key LIKE 'inventory:%' AND NOT (conflict_key=ANY($2::text[]))", [snapshot.finishedAt, keys]);
    } else {
      await client.query("UPDATE pancake_sync_conflicts SET status='resolved',resolved_at=$1 WHERE status='open' AND conflict_key LIKE 'inventory:%'", [snapshot.finishedAt]);
    }

    await client.query(
      `UPDATE pancake_inventory_reconciliations
       SET status='complete',shop_id=$2,warehouse_id=$3,checked_count=$4,updated_count=$5,unchanged_count=$6,
           skipped_count=$7,conflict_count=$8,finished_at=$9,
           duration_ms=GREATEST(0,EXTRACT(EPOCH FROM ($9::timestamptz-started_at))*1000)::integer
       WHERE id=$1`,
      [
        snapshot.runId,
        snapshot.shopId,
        snapshot.warehouseId,
        snapshot.summary.checkedCount,
        snapshot.summary.updatedCount,
        snapshot.summary.unchangedCount,
        snapshot.summary.skippedCount,
        snapshot.summary.conflictCount,
        snapshot.finishedAt
      ]
    );
  });
  return snapshot.summary;
}

async function blockInventoryReconciliation(id, safeErrorCode) {
  if (!hasDatabaseUrl()) {
    const run = memory.runs.find((item) => item.id === id);
    if (run) Object.assign(run, { status: 'blocked', safeErrorCode });
    return;
  }
  await query("UPDATE pancake_inventory_reconciliations SET status='blocked',safe_error_code=$2,finished_at=now() WHERE id=$1", [id, safeErrorCode]);
}

async function failInventoryReconciliation(id, safeErrorCode) {
  if (!hasDatabaseUrl()) {
    const run = memory.runs.find((item) => item.id === id);
    if (run) Object.assign(run, { status: 'failed', safeErrorCode });
    return;
  }
  await query("UPDATE pancake_inventory_reconciliations SET status='failed',safe_error_code=$2,finished_at=now() WHERE id=$1", [id, safeErrorCode]);
}

async function getInventoryStatus() {
  if (!hasDatabaseUrl()) return memory.runs[0] || { status: 'never_run' };
  const result = await query('SELECT * FROM pancake_inventory_reconciliations ORDER BY started_at DESC LIMIT 1');
  const row = result.rows[0];
  if (!row) return { status: 'never_run' };
  return {
    status: row.status,
    runId: row.id,
    summary: {
      checkedCount: Number(row.checked_count || 0),
      updatedCount: Number(row.updated_count || 0),
      unchangedCount: Number(row.unchanged_count || 0),
      skippedCount: Number(row.skipped_count || 0),
      conflictCount: Number(row.conflict_count || 0)
    },
    lastErrorCode: row.safe_error_code || '',
    finishedAt: row.finished_at || ''
  };
}

module.exports = {
  beginInventoryReconciliation,
  blockInventoryReconciliation,
  completeInventoryReconciliation,
  failInventoryReconciliation,
  getInventoryStatus,
  loadInventoryReadiness
};
