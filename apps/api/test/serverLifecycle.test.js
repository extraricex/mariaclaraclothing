const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../src/server');

test('server starts Meta worker only when enabled and shuts dependencies down', async () => {
  const calls = [];
  const server = { close: (callback) => { calls.push('server.close'); callback(); } };
  const app = { listen: (_port, callback) => { callback(); return server; } };
  const worker = { start: () => calls.push('worker.start'), stop: () => calls.push('worker.stop') };

  const runtime = startServer({
    app,
    config: { port: 3000, meta: { enabled: true } },
    createWorker: () => worker,
    pool: {},
    closeDatabase: async () => calls.push('db.close'),
    registerSignals: false,
    logger: { log: () => {} }
  });

  assert.deepEqual(calls, ['worker.start']);
  await runtime.shutdown();
  assert.deepEqual(calls, ['worker.start', 'worker.stop', 'server.close', 'db.close']);
});

test('server leaves Meta worker stopped when CAPI is disabled', async () => {
  let workerCreated = false;
  const runtime = startServer({
    app: { listen: () => ({ close: (callback) => callback() }) },
    config: { port: 3000, meta: { enabled: false } },
    createWorker: () => { workerCreated = true; },
    closeDatabase: async () => {},
    registerSignals: false,
    logger: { log: () => {} }
  });
  assert.equal(workerCreated, false);
  await runtime.shutdown();
});

test('server starts Pancake auto sync worker when enabled and stops it on shutdown', async () => {
  const calls = [];
  const server = { close: (callback) => { calls.push('server.close'); callback(); } };
  const app = { listen: (_port, callback) => { callback(); return server; } };
  const pancakeWorker = {
    start: () => calls.push('pancake.start'),
    stop: () => calls.push('pancake.stop')
  };

  const runtime = startServer({
    app,
    config: {
      port: 3000,
      meta: { enabled: false },
      notifications: { enabled: false },
      pancake: { mode: 'live', apiKeyConfigured: true, autoSyncEnabled: true }
    },
    createPancakeWorker: () => pancakeWorker,
    closeDatabase: async () => calls.push('db.close'),
    registerSignals: false,
    logger: { log: () => {} }
  });

  assert.deepEqual(calls, ['pancake.start']);
  assert.equal(runtime.pancakeWorker, pancakeWorker);
  await runtime.shutdown();
  assert.deepEqual(calls, ['pancake.start', 'pancake.stop', 'server.close', 'db.close']);
});

test('server leaves Pancake auto sync worker stopped when unsafe or incomplete', async () => {
  let pancakeWorkerCreated = false;
  const runtime = startServer({
    app: { listen: () => ({ close: (callback) => callback() }) },
    config: {
      port: 3000,
      meta: { enabled: false },
      notifications: { enabled: false },
      pancake: { mode: 'live', apiKeyConfigured: false, autoSyncEnabled: true }
    },
    createPancakeWorker: () => {
      pancakeWorkerCreated = true;
      return { start: () => {}, stop: () => {} };
    },
    closeDatabase: async () => {},
    registerSignals: false,
    logger: { log: () => {} }
  });

  assert.equal(pancakeWorkerCreated, false);
  assert.equal(runtime.pancakeWorker, null);
  await runtime.shutdown();
});

test('server starts and stops the PayMongo reservation worker only when configured', async () => {
  const calls = [];
  const paymentWorker = { start: () => calls.push('payment.start'), stop: () => calls.push('payment.stop') };
  const runtime = startServer({
    app: { listen: () => ({ close: (callback) => { calls.push('server.close'); callback(); } }) },
    config: {
      port: 3000, meta: { enabled: false }, notifications: { enabled: false },
      pancake: { mode: 'disabled', apiKeyConfigured: false, autoSyncEnabled: false },
      paymongo: { configured: true }
    },
    createPaymentWorker: () => paymentWorker,
    closeDatabase: async () => calls.push('db.close'), registerSignals: false, logger: { log() {} }
  });
  assert.equal(runtime.paymentWorker, paymentWorker);
  assert.deepEqual(calls, ['payment.start']);
  await runtime.shutdown();
  assert.deepEqual(calls, ['payment.start', 'payment.stop', 'server.close', 'db.close']);
});
