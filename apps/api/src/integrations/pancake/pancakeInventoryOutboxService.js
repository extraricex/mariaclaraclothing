const repositoryDefault = require('./pancakeInventoryOutboxRepository');
const productSyncRepositoryDefault = require('./pancakeProductSyncRepository');
const { syncProductToPancake } = require('./pancakeProductSyncService');

function safeCode(error) {
  const value = String(error?.code || 'pancake_inventory_sync_failed');
  return /^pancake_[a-z_]+$/.test(value) ? value : 'pancake_inventory_sync_failed';
}

async function processInventorySyncJobs({
  config, client, repository = repositoryDefault, productSyncRepository = productSyncRepositoryDefault,
  productSlugs = [], limit = 20, syncProduct = syncProductToPancake
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

module.exports = { processInventorySyncJobs, safeCode };
