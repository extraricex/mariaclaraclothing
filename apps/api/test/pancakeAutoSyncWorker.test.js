const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createPancakeAutoSyncWorker,
  shouldRunPancakeAutoSync
} = require('../src/integrations/pancake/pancakeAutoSyncWorker');

const runnableConfig = {
  mode: 'shadow',
  apiKeyConfigured: true,
  autoSyncEnabled: true,
  autoSyncIntervalMs: 600000,
  autoSyncStartupDelayMs: 15000
};

test('Pancake auto sync only runs for enabled safe modes with an API key', () => {
  assert.equal(shouldRunPancakeAutoSync(runnableConfig), true);
  assert.equal(shouldRunPancakeAutoSync({ ...runnableConfig, mode: 'read_only' }), true);
  assert.equal(shouldRunPancakeAutoSync({ ...runnableConfig, mode: 'live' }), true);
  assert.equal(shouldRunPancakeAutoSync({ ...runnableConfig, autoSyncEnabled: false }), false);
  assert.equal(shouldRunPancakeAutoSync({ ...runnableConfig, apiKeyConfigured: false }), false);
  assert.equal(shouldRunPancakeAutoSync({ ...runnableConfig, mode: 'disabled' }), false);
});

test('Pancake auto sync runOnce imports catalog, reconciles inventory, and builds order shadows', async () => {
  const calls = [];
  const worker = createPancakeAutoSyncWorker({
    config: runnableConfig,
    client: {},
    catalogRepository: {},
    inventoryRepository: {},
    orderRepository: {},
    catalogService: {
      runCatalogImport: async () => {
        calls.push('catalog');
        return { status: 'complete', mappedCount: 24 };
      }
    },
    inventoryService: {
      runInventoryReconciliation: async ({ config }) => {
        calls.push(`inventory:${config.mode}`);
        return { status: 'complete', checked: 24 };
      }
    },
    orderService: {
      runOrderShadowBuild: async () => {
        calls.push('orders');
        return { status: 'complete', queued: 1 };
      }
    },
    logger: { info: () => {}, error: () => {} }
  });

  const result = await worker.runOnce();

  assert.deepEqual(calls, ['catalog', 'orders', 'inventory:read_only']);
  assert.equal(result.status, 'complete');
  assert.equal(result.catalog.mappedCount, 24);
  assert.equal(result.inventory.checked, 24);
  assert.equal(result.orders.queued, 1);
});

test('Pancake auto sync runOnce sends live order exports only in live mode', async () => {
  const calls = [];
  const worker = createPancakeAutoSyncWorker({
    config: { ...runnableConfig, mode: 'live' },
    client: {},
    catalogRepository: {},
    inventoryRepository: {},
    orderRepository: {},
    catalogService: { runCatalogImport: async () => { calls.push('catalog'); return { status: 'complete' }; } },
    inventoryService: { runInventoryReconciliation: async () => { calls.push('inventory'); return { status: 'complete' }; } },
    orderService: {
      runOrderShadowBuild: async () => { calls.push('shadow'); return { status: 'complete' }; },
      runOrderLiveExport: async () => { calls.push('live'); return { status: 'complete', sent: 1 }; }
    },
    logger: { info: () => {}, error: () => {} }
  });

  const result = await worker.runOnce();

  assert.deepEqual(calls, ['catalog', 'live', 'inventory']);
  assert.equal(result.orders.sent, 1);
});

test('auto sync worker runs inbound and outbound Pancake order sync after live export', async () => {
  const calls = [];
  const worker = createPancakeAutoSyncWorker({
    config: { mode: 'live', autoSyncEnabled: true, apiKeyConfigured: true, autoSyncIntervalMs: 60000 },
    client: {},
    catalogService: { runCatalogImport: async () => ({ status: 'complete' }) },
    inventoryService: { runInventoryReconciliation: async () => ({ status: 'complete' }) },
    orderService: { runOrderLiveExport: async () => ({ status: 'complete' }) },
    orderSyncService: {
      pollInboundPancakeOrders: async () => { calls.push('inbound'); return { status: 'complete' }; },
      processOutboundOrderEvents: async () => { calls.push('outbound'); return { status: 'complete' }; }
    },
    logger: { info() {}, error() {} }
  });

  const result = await worker.runOnce();
  assert.equal(result.orderInbound.status, 'complete');
  assert.equal(result.orderOutbound.status, 'complete');
  assert.deepEqual(calls, ['inbound', 'outbound']);
});

test('Pancake auto sync skips work when disabled', async () => {
  let called = false;
  const worker = createPancakeAutoSyncWorker({
    config: { ...runnableConfig, autoSyncEnabled: false },
    catalogService: { runCatalogImport: async () => { called = true; } },
    inventoryService: { runInventoryReconciliation: async () => { called = true; } },
    orderService: { runOrderShadowBuild: async () => { called = true; } },
    logger: { info: () => {}, error: () => {} }
  });

  const result = await worker.runOnce();

  assert.deepEqual(result, { status: 'skipped', reason: 'pancake_auto_sync_disabled' });
  assert.equal(called, false);
});

test('Pancake auto sync start runs after startup delay on an interval and stop clears timers', async () => {
  const calls = [];
  let timeoutCallback;
  let intervalCallback;
  const timeoutId = { unref: () => calls.push('timeout-unref') };
  const intervalId = { unref: () => calls.push('unref') };
  const worker = createPancakeAutoSyncWorker({
    config: runnableConfig,
    client: {},
    catalogRepository: {},
    inventoryRepository: {},
    orderRepository: {},
    catalogService: { runCatalogImport: async () => calls.push('catalog') },
    inventoryService: { runInventoryReconciliation: async () => calls.push('inventory') },
    orderService: { runOrderShadowBuild: async () => calls.push('orders') },
    setTimeoutFn: (callback, timeoutMs) => {
      calls.push(['timeout', timeoutMs]);
      timeoutCallback = callback;
      return timeoutId;
    },
    setIntervalFn: (callback, intervalMs) => {
      calls.push(['interval', intervalMs]);
      intervalCallback = callback;
      return intervalId;
    },
    clearTimeoutFn: (id) => calls.push(['clear-timeout', id]),
    clearIntervalFn: (id) => calls.push(['clear', id]),
    logger: { info: () => {}, error: () => {} }
  });

  worker.start();
  timeoutCallback();
  await new Promise((resolve) => setImmediate(resolve));
  intervalCallback();
  await new Promise((resolve) => setImmediate(resolve));
  worker.stop();

  assert.deepEqual(calls, [
    ['timeout', 15000],
    'timeout-unref',
    ['interval', 600000],
    'unref',
    'catalog',
    'orders',
    'inventory',
    'catalog',
    'orders',
    'inventory',
    ['clear-timeout', timeoutId],
    ['clear', intervalId]
  ]);
});

test('Pancake auto sync interval uses faster order polling cadence when configured', async () => {
  const calls = [];
  const worker = createPancakeAutoSyncWorker({
    config: { ...runnableConfig, autoSyncIntervalMs: 600000, orderPollIntervalMs: 120000 },
    catalogService: { runCatalogImport: async () => {} },
    inventoryService: { runInventoryReconciliation: async () => {} },
    orderService: { runOrderShadowBuild: async () => {} },
    setTimeoutFn: () => ({ unref() {} }),
    setIntervalFn: (_callback, intervalMs) => {
      calls.push(intervalMs);
      return { unref() {} };
    },
    clearTimeoutFn: () => {},
    clearIntervalFn: () => {},
    logger: { info: () => {}, error: () => {} }
  });

  worker.start();
  worker.stop();

  assert.deepEqual(calls, [120000]);
});
