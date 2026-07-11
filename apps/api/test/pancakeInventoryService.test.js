const test = require('node:test');
const assert = require('node:assert/strict');

function repository(readiness = {}) {
  const calls = [];
  return {
    calls,
    beginInventoryReconciliation: async (meta) => { calls.push(['begin', meta]); },
    loadInventoryReadiness: async () => ({
      ready: true,
      shopId: 'shop-1',
      warehouseId: 'warehouse-1',
      latestCatalog: { status: 'complete', verifiedCount: 2, localVariantCount: 2, conflictCount: 0 },
      mappings: [
        { localVariantId: 10, productSlug: 'shirt', productName: 'Shirt', sku: 'SKU-S', size: 'S', pancakeVariationId: 'pv-1', stockQuantity: 2 },
        { localVariantId: 11, productSlug: 'shirt', productName: 'Shirt', sku: 'SKU-M', size: 'M', pancakeVariationId: 'pv-2', stockQuantity: 5 }
      ],
      ...readiness
    }),
    completeInventoryReconciliation: async (snapshot) => {
      calls.push(['complete', snapshot]);
      return snapshot.summary;
    },
    blockInventoryReconciliation: async (id, code) => calls.push(['block', id, code]),
    failInventoryReconciliation: async (id, code) => calls.push(['fail', id, code]),
    getInventoryStatus: async () => ({ status: 'never_run' })
  };
}

test('inventory reconciliation blocks until catalog mapping is clean', async () => {
  const { runInventoryReconciliation } = require('../src/integrations/pancake/pancakeInventoryService');
  const repo = repository({ ready: false, reason: 'pancake_catalog_not_ready', mappings: [] });
  const result = await runInventoryReconciliation({
    config: { mode: 'read_only', apiKeyConfigured: true, catalogPageSize: 100, catalogMaxPages: 5 },
    client: { listVariations: async () => { throw new Error('should not call provider'); } },
    repository: repo,
    now: () => new Date('2026-07-07T00:00:00Z')
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.lastErrorCode, 'pancake_catalog_not_ready');
  assert.equal(repo.calls.some((call) => call[0] === 'complete'), false);
});

test('inventory reconciliation applies selected warehouse remain_quantity as absolute stock', async () => {
  const { runInventoryReconciliation } = require('../src/integrations/pancake/pancakeInventoryService');
  const repo = repository();
  const client = {
    listVariations: async (_shopId, { pageNumber }) => ({
      data: pageNumber === 1 ? [
        { id: 'pv-1', variations_warehouses: [{ warehouse_id: 'warehouse-1', remain_quantity: 7 }] },
        { id: 'pv-2', variations_warehouses: [{ warehouse_id: 'warehouse-1', remain_quantity: 5 }] }
      ] : [],
      page_number: pageNumber,
      page_size: 100,
      total_entries: 2,
      total_pages: 1
    })
  };

  const result = await runInventoryReconciliation({
    config: { mode: 'read_only', apiKeyConfigured: true, catalogPageSize: 100, catalogMaxPages: 5 },
    client,
    repository: repo,
    now: () => new Date('2026-07-07T00:00:00Z')
  });

  assert.equal(result.status, 'complete');
  assert.deepEqual(result.summary, {
    checkedCount: 2,
    updatedCount: 1,
    unchangedCount: 1,
    skippedCount: 0,
    conflictCount: 0
  });
  const snapshot = repo.calls.find((call) => call[0] === 'complete')[1];
  assert.deepEqual(snapshot.updates.map((item) => ({
    localVariantId: item.localVariantId,
    previousQuantity: item.previousQuantity,
    nextQuantity: item.nextQuantity,
    quantityChange: item.quantityChange
  })), [
    { localVariantId: 10, previousQuantity: 2, nextQuantity: 7, quantityChange: 5 },
    { localVariantId: 11, previousQuantity: 5, nextQuantity: 5, quantityChange: 0 }
  ]);
});

test('inventory reconciliation skips invalid selected warehouse quantities', async () => {
  const { runInventoryReconciliation } = require('../src/integrations/pancake/pancakeInventoryService');
  const repo = repository();
  const client = {
    listVariations: async (_shopId, { pageNumber }) => ({
      data: [
        { id: 'pv-1', variations_warehouses: [{ warehouse_id: 'warehouse-2', remain_quantity: 7 }] },
        { id: 'pv-2', variations_warehouses: [{ warehouse_id: 'warehouse-1', remain_quantity: -1 }] }
      ],
      page_number: pageNumber,
      page_size: 100,
      total_entries: 2,
      total_pages: 1
    })
  };

  const result = await runInventoryReconciliation({
    config: { mode: 'read_only', apiKeyConfigured: true, catalogPageSize: 100, catalogMaxPages: 5 },
    client,
    repository: repo,
    now: () => new Date('2026-07-07T00:00:00Z')
  });

  assert.equal(result.status, 'complete');
  assert.equal(result.summary.checkedCount, 2);
  assert.equal(result.summary.updatedCount, 0);
  assert.equal(result.summary.skippedCount, 2);
  assert.equal(result.summary.conflictCount, 2);
  const snapshot = repo.calls.find((call) => call[0] === 'complete')[1];
  assert.equal(snapshot.updates.length, 0);
  assert.deepEqual(snapshot.conflicts.map((item) => item.code), ['pancake_inventory_warehouse_missing', 'pancake_inventory_quantity_invalid']);
});

test('inventory reconciliation uses top-level remain_quantity when warehouse rows are absent', async () => {
  const { runInventoryReconciliation } = require('../src/integrations/pancake/pancakeInventoryService');
  const repo = repository({
    mappings: [
      { localVariantId: 10, productSlug: 'shirt', productName: 'Shirt', sku: 'SKU-S', size: 'S', pancakeVariationId: 'pv-1', stockQuantity: 4 }
    ]
  });
  const client = {
    listVariations: async (_shopId, { pageNumber }) => ({
      data: [{ id: 'pv-1', remain_quantity: 0, variations_warehouses: [] }],
      page_number: pageNumber,
      page_size: 100,
      total_entries: 1,
      total_pages: 1
    })
  };

  const result = await runInventoryReconciliation({
    config: { mode: 'read_only', apiKeyConfigured: true, catalogPageSize: 100, catalogMaxPages: 5 },
    client,
    repository: repo,
    now: () => new Date('2026-07-07T00:00:00Z')
  });

  assert.equal(result.status, 'complete');
  assert.deepEqual(result.summary, {
    checkedCount: 1,
    updatedCount: 1,
    unchangedCount: 0,
    skippedCount: 0,
    conflictCount: 0
  });
  const snapshot = repo.calls.find((call) => call[0] === 'complete')[1];
  assert.equal(snapshot.updates[0].nextQuantity, 0);
  assert.equal(snapshot.updates[0].quantityChange, -4);
});
