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
