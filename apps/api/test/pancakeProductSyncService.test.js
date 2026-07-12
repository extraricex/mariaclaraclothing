const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  buildProductPayload,
  buildQuantityPayload,
  syncProductToPancake
} = require('../src/integrations/pancake/pancakeProductSyncService');

const PRODUCT = {
  slug: 'oversized-shirt', name: 'Oversized Shirt', description: 'Premium cotton', status: 'active',
  priceCents: 64900, parcelWeightGrams: 250,
  variants: [
    { id: 1, size: 's', sku: 'MCC-S', priceCents: 64900, stockQuantity: 3 },
    { id: 2, size: 'm', sku: 'MCC-M', priceCents: null, stockQuantity: 5 }
  ]
};
const READINESS = {
  ready: true, shopId: 'shop-1', warehouseId: 'warehouse-1', priceUnitStatus: 'confirmed_pesos',
  pancakeProductId: 'product-1',
  mappings: [
    { localVariantId: 1, sku: 'MCC-S', size: 's', pancakeProductId: 'product-1', pancakeVariantId: 'variant-s', status: 'verified' },
    { localVariantId: 2, sku: 'MCC-M', size: 'm', pancakeProductId: 'product-1', pancakeVariantId: 'variant-m', status: 'verified' }
  ]
};

function fakeRepository(readiness = READINESS) {
  const records = [];
  return {
    records,
    loadProductSyncReadiness: async () => readiness,
    recordProductSync: async (record) => records.push(record),
    listProductSyncStatuses: async () => [{
      productSlug: PRODUCT.slug,
      status: records.at(-1)?.status || 'never_synced',
      pancakeProductId: records.at(-1)?.pancakeProductId || '',
      mappedVariantCount: readiness.status?.mappedVariantCount ?? 2,
      totalVariantCount: readiness.status?.totalVariantCount ?? 2,
      variantMappings: readiness.mappings || [],
      lastErrorCode: records.at(-1)?.safeErrorCode || '',
      stockMismatch: records.at(-1)?.summary?.stockMismatch ?? null
    }]
  };
}

test('mapped product payload preserves IDs and converts local cents to Pancake pesos', () => {
  const payload = buildProductPayload(PRODUCT, READINESS);
  assert.equal(payload.product.name, PRODUCT.name);
  assert.equal(payload.product.weight, 250);
  assert.equal(payload.product.variations[0].id, 'variant-s');
  assert.equal(payload.product.variations[0].custom_id, 'MCC-S');
  assert.equal(payload.product.variations[0].retail_price, 649);
  const quantity = buildQuantityPayload(PRODUCT, READINESS);
  assert.equal(quantity.is_actual_remain_quantity, false);
  assert.deepEqual(quantity.variations_warehouses[1], {
    variation_id: 'variant-m', remain_quantity: 5, warehouse_id: 'warehouse-1'
  });
});

test('manual sync updates the mapped product then mapped warehouse quantities', async () => {
  const calls = [];
  const repository = fakeRepository();
  const sync = await syncProductToPancake({
    productSlug: PRODUCT.slug,
    config: { mode: 'live', apiKey: 'secret' },
    client: {
      updateProduct: async (...args) => calls.push(['product', ...args]),
      updateVariationQuantities: async (...args) => calls.push(['quantity', ...args])
    },
    repository,
    productRepository: { findEditableProductBySlug: async () => PRODUCT },
    now: () => new Date('2026-07-12T00:00:00.000Z')
  });
  assert.deepEqual(calls.map((call) => call[0]), ['product', 'quantity']);
  assert.equal(calls[0][2], 'product-1');
  assert.equal(repository.records.at(-1).status, 'synced');
  assert.equal(sync.status, 'synced');
  assert.equal(sync.stockMismatch, false);
});

test('missing mapping blocks without calling Pancake and records a retryable warning', async () => {
  const repository = fakeRepository({
    ready: false,
    reason: 'pancake_product_mapping_missing',
    status: { mappedVariantCount: 1, totalVariantCount: 2, variantMappings: [] }
  });
  let calls = 0;
  await assert.rejects(syncProductToPancake({
    productSlug: PRODUCT.slug,
    config: { mode: 'live', apiKey: 'secret' },
    client: { updateProduct: async () => { calls += 1; } },
    repository,
    productRepository: { findEditableProductBySlug: async () => PRODUCT }
  }), (error) => error.code === 'pancake_product_mapping_missing' && error.status === 409);
  assert.equal(calls, 0);
  assert.equal(repository.records.at(-1).status, 'missing_mapping');
});

test('provider failure is logged as failed and can be retried', async () => {
  const repository = fakeRepository();
  await assert.rejects(syncProductToPancake({
    productSlug: PRODUCT.slug,
    config: { mode: 'live', apiKey: 'secret' },
    client: {
      updateProduct: async () => { throw Object.assign(new Error('private provider response'), { code: 'pancake_timeout', retryable: true }); },
      updateVariationQuantities: async () => {}
    },
    repository,
    productRepository: { findEditableProductBySlug: async () => PRODUCT }
  }), (error) => error.code === 'pancake_timeout' && error.status === 503 && !error.message.includes('private'));
  assert.equal(repository.records.at(-1).status, 'failed');
  assert.equal(repository.records.at(-1).summary.stockMismatch, true);
});

test('database schema and versioned migration persist product sync audit status', () => {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  const migration = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '20260712_pancake_product_sync.sql'), 'utf8');
  for (const source of [schema, migration]) {
    assert.match(source, /CREATE TABLE IF NOT EXISTS pancake_product_syncs/);
    assert.match(source, /missing_mapping/);
    assert.match(source, /last_synced_at/);
  }
});
