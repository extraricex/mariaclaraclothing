const test = require('node:test');
const assert = require('node:assert/strict');

const { processInventorySyncJobs } = require('../src/integrations/pancake/pancakeInventoryOutboxService');
const { retryDelayMs } = require('../src/integrations/pancake/pancakeInventoryOutboxRepository');

test('inventory outbox syncs a due absolute-stock snapshot and records success', async () => {
  const calls = [];
  const job = { productSlug: 'shirt', source: 'admin', attemptCount: 1, checksum: 'abc' };
  const repository = {
    claimDueInventoryJobs: async () => [job],
    markInventoryJobSynced: async (...args) => calls.push(['synced', ...args]),
    markInventoryJobFailed: async (...args) => calls.push(['failed', ...args])
  };
  const result = await processInventorySyncJobs({
    config: { mode: 'live' }, client: {}, repository, productSyncRepository: {},
    syncProduct: async ({ productSlug }) => ({ productSlug, pancakeProductId: 'pp-1', variantMappings: [] })
  });
  assert.equal(result.status, 'complete');
  assert.equal(result.syncedCount, 1);
  assert.equal(calls[0][0], 'synced');
});

test('inventory outbox preserves local stock, records safe failure, and uses 1/5/15 minute backoff', async () => {
  const calls = [];
  const repository = {
    claimDueInventoryJobs: async () => [{ productSlug: 'shirt', source: 'admin', attemptCount: 2, checksum: 'abc' }],
    markInventoryJobSynced: async () => {},
    markInventoryJobFailed: async (...args) => calls.push(args)
  };
  const result = await processInventorySyncJobs({
    config: { mode: 'live' }, client: {}, repository, productSyncRepository: {},
    syncProduct: async () => { const error = new Error('provider details'); error.code = 'pancake_api_error'; throw error; }
  });
  assert.equal(result.status, 'partial');
  assert.deepEqual(calls[0].slice(1), ['pancake_api_error']);
  assert.deepEqual([retryDelayMs(1), retryDelayMs(2), retryDelayMs(3), retryDelayMs(9)], [60_000, 300_000, 900_000, 900_000]);
});
