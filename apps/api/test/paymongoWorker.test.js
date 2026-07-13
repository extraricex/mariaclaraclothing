const test = require('node:test');
const assert = require('node:assert/strict');

const { createPayMongoWorker } = require('../src/payments/paymongoWorker');

test('PayMongo worker reconciles immediately at startup and keeps the minute schedule', async () => {
  let scheduled;
  let runs = 0;
  const worker = createPayMongoWorker({
    config: { configured: true },
    client: { retrieveCheckoutSession: async () => ({ attributes: {} }) },
    reconcilePayments: async () => { runs += 1; return { checkedCount: 0, paidCount: 0 }; },
    releaseReservations: async () => ({ releasedCount: 0 }),
    setIntervalFn: (callback, interval) => {
      scheduled = { callback, interval, unref() {} };
      return scheduled;
    },
    clearIntervalFn: () => {},
    logger: { info() {}, error() {} }
  });

  worker.start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(scheduled.interval, 60_000);
  assert.equal(runs, 1);
  await scheduled.callback();
  assert.equal(runs, 2);
  worker.stop();
});
