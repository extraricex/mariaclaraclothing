const repositoryDefault = require('./pancakeInventoryOutboxRepository');
const productSyncRepositoryDefault = require('./pancakeProductSyncRepository');

function safeCode(error) {
  const value = String(error?.code || 'pancake_inventory_sync_failed');
  return /^pancake_[a-z_]+$/.test(value) ? value : 'pancake_inventory_sync_failed';
}

async function syncInventoryToPancake({ productSlug, config, client, repository = productSyncRepositoryDefault }) {
  if (config?.mode !== 'live' || !config?.apiKey) {
    const error = new Error('Pancake inventory sync requires live mode.');
    error.code = 'pancake_product_sync_not_live';
    throw error;
  }
  const readiness = await repository.loadProductSyncReadiness(productSlug, config);
  if (!readiness.ready) {
    const error = new Error('Pancake inventory mapping is not ready.');
    error.code = readiness.reason || 'pancake_product_mapping_missing';
    throw error;
  }
  await client.updateVariationQuantities(readiness.shopId, {
    is_actual_remain_quantity: false,
    variations_warehouses: readiness.mappings.map((mapping) => ({
      variation_id: mapping.pancakeVariantId,
      remain_quantity: Number(mapping.stockQuantity || 0),
      warehouse_id: readiness.warehouseId
    }))
  });
  return {
    productSlug,
    status: 'synced',
    pancakeProductId: readiness.pancakeProductId,
    variantMappings: readiness.mappings
  };
}

async function processInventorySyncJobs({
  config, client, repository = repositoryDefault, productSyncRepository = productSyncRepositoryDefault,
  productSlugs = [], limit = 20, syncProduct = syncInventoryToPancake
}) {
  const jobs = await repository.claimDueInventoryJobs({ limit, productSlugs });
  const results = [];
  for (const job of jobs) {
    try {
      const sync = await syncProduct({
        productSlug: job.productSlug, config, client, repository: productSyncRepository
      });
      await repository.markInventoryJobSynced(job, sync);
      results.push({ productSlug: job.productSlug, status: 'synced', sync });
    } catch (error) {
      const code = safeCode(error);
      await repository.markInventoryJobFailed(job, code);
      results.push({ productSlug: job.productSlug, status: 'failed', code, sync: error.sync || null });
    }
  }
  return {
    status: results.some((item) => item.status === 'failed') ? 'partial' : 'complete',
    processedCount: results.length,
    syncedCount: results.filter((item) => item.status === 'synced').length,
    failedCount: results.filter((item) => item.status === 'failed').length,
    results
  };
}

module.exports = { processInventorySyncJobs, safeCode, syncInventoryToPancake };
