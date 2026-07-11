const crypto = require('node:crypto');

function safeCode(error) {
  const code = String(error?.code || 'pancake_inventory_failed');
  return /^pancake_[a-z_]+$/.test(code) ? code : 'pancake_inventory_failed';
}

function invalidResponse() {
  const error = new Error('Invalid Pancake inventory response');
  error.code = 'pancake_invalid_response';
  return error;
}

function validatePage(body, pageNumber, expectedTotalPages) {
  if (!body || !Array.isArray(body.data)) throw invalidResponse();
  for (const field of ['page_number', 'page_size', 'total_entries', 'total_pages']) {
    if (!Number.isInteger(body[field]) || body[field] < 0) throw invalidResponse();
  }
  if (body.page_number !== pageNumber || body.page_size < 1) throw invalidResponse();
  if (expectedTotalPages !== undefined && body.total_pages !== expectedTotalPages) throw invalidResponse();
}

async function fetchAllVariations({ client, shopId, pageSize, maxPages }) {
  const first = await client.listVariations(shopId, { pageNumber: 1, pageSize });
  validatePage(first, 1);
  if (first.total_pages > maxPages) throw invalidResponse();
  const pages = [first];
  for (let pageNumber = 2; pageNumber <= first.total_pages; pageNumber += 1) {
    const page = await client.listVariations(shopId, { pageNumber, pageSize });
    validatePage(page, pageNumber, first.total_pages);
    pages.push(page);
  }
  return pages.flatMap((page) => page.data);
}

function selectedWarehouseQuantity(variation, warehouseId) {
  const rows = Array.isArray(variation?.variations_warehouses) ? variation.variations_warehouses : [];
  const row = rows.find((item) => String(item?.warehouse_id || item?.warehouseId || '') === warehouseId);
  if (!row && rows.length === 0 && Object.hasOwn(variation || {}, 'remain_quantity')) {
    const quantity = Number(variation.remain_quantity);
    if (!Number.isInteger(quantity) || quantity < 0) return { ok: false, code: 'pancake_inventory_quantity_invalid' };
    return { ok: true, quantity };
  }
  if (!row) return { ok: false, code: 'pancake_inventory_warehouse_missing' };
  const quantity = Number(row.remain_quantity);
  if (!Number.isInteger(quantity) || quantity < 0) return { ok: false, code: 'pancake_inventory_quantity_invalid' };
  return { ok: true, quantity };
}

function buildSnapshot({ runId, readiness, variations, startedAt, finishedAt }) {
  const byVariationId = new Map(variations.map((item) => [String(item.id || ''), item]));
  const updates = [];
  const conflicts = [];
  let unchangedCount = 0;

  for (const mapping of readiness.mappings || []) {
    const remote = byVariationId.get(String(mapping.pancakeVariationId || ''));
    const evidence = selectedWarehouseQuantity(remote, readiness.warehouseId);
    if (!evidence.ok) {
      conflicts.push({
        code: evidence.code,
        conflictKey: `inventory:${evidence.code}:${mapping.pancakeVariationId || mapping.localVariantId}`,
        entityType: 'pancake_variation',
        entityId: String(mapping.pancakeVariationId || ''),
        context: { sku: mapping.sku || '', warehouseId: readiness.warehouseId }
      });
      continue;
    }
    const previousQuantity = Number(mapping.stockQuantity || 0);
    const quantityChange = evidence.quantity - previousQuantity;
    if (quantityChange === 0) unchangedCount += 1;
    updates.push({
      localVariantId: mapping.localVariantId,
      productSlug: mapping.productSlug,
      productName: mapping.productName,
      sku: mapping.sku,
      size: mapping.size,
      pancakeVariationId: mapping.pancakeVariationId,
      previousQuantity,
      nextQuantity: evidence.quantity,
      quantityChange
    });
  }

  const changed = updates.filter((item) => item.quantityChange !== 0);
  return {
    runId,
    shopId: readiness.shopId,
    warehouseId: readiness.warehouseId,
    updates,
    changed,
    conflicts,
    summary: {
      checkedCount: (readiness.mappings || []).length,
      updatedCount: changed.length,
      unchangedCount,
      skippedCount: conflicts.length,
      conflictCount: conflicts.length
    },
    startedAt,
    finishedAt
  };
}

async function runInventoryReconciliation({ config = {}, client, repository, now = () => new Date() }) {
  if (config.mode !== 'read_only') return { status: 'blocked', lastErrorCode: 'pancake_mode_not_allowed' };
  if (!config.apiKeyConfigured) return { status: 'blocked', lastErrorCode: 'pancake_configuration_incomplete' };

  const runId = crypto.randomUUID();
  const started = now();
  await repository.beginInventoryReconciliation({
    id: runId,
    startedAt: started.toISOString()
  });

  const readiness = await repository.loadInventoryReadiness(config);
  if (!readiness.ready) {
    const code = readiness.reason || 'pancake_inventory_not_ready';
    await repository.blockInventoryReconciliation(runId, code);
    return { status: 'blocked', runId, lastErrorCode: code };
  }

  try {
    const variations = await fetchAllVariations({
      client,
      shopId: readiness.shopId,
      pageSize: config.catalogPageSize || 100,
      maxPages: config.catalogMaxPages || 100
    });
    const finished = now();
    const snapshot = buildSnapshot({
      runId,
      readiness,
      variations,
      startedAt: started.toISOString(),
      finishedAt: finished.toISOString()
    });
    const summary = await repository.completeInventoryReconciliation(snapshot);
    return { status: 'complete', runId, summary, lastErrorCode: '' };
  } catch (error) {
    const code = safeCode(error);
    await repository.failInventoryReconciliation(runId, code);
    return { status: 'failed', runId, lastErrorCode: code };
  }
}

async function getInventoryStatus({ repository }) {
  return repository.getInventoryStatus();
}

module.exports = { buildSnapshot, getInventoryStatus, runInventoryReconciliation, selectedWarehouseQuantity };
