const test = require('node:test');
const assert = require('node:assert/strict');
const { createMetaConversionsWorker, retryDelayMs } = require('../src/marketing/metaConversionsWorker');

function dependencies({ events, sendError } = {}) {
  const calls = [];
  const logs = [];
  const repository = {
    recoverStaleMetaEventClaims: async (_client, cutoff) => calls.push(['recover', cutoff]),
    claimDueMetaEvents: async () => events || [],
    markMetaEventSent: async (_client, id, result) => calls.push(['sent', id, result]),
    scheduleMetaEventRetry: async (_client, id, result) => calls.push(['retry', id, result]),
    markMetaEventFailed: async (_client, id, error) => calls.push(['failed', id, error])
  };
  const sendEvent = async () => {
    if (sendError) throw sendError;
    return { traceId: 'trace-1', status: 200, eventsReceived: 1 };
  };
  const logger = {
    info: (message, details) => logs.push(['info', message, details]),
    warn: (message, details) => logs.push(['warn', message, details]),
    error: (message, details) => logs.push(['error', message, details])
  };
  return { calls, logs, logger, repository, sendEvent };
}

test('Meta worker marks accepted outbox events sent and recovers stale claims', async () => {
  const deps = dependencies({ events: [{
    id: 'one', attempt_count: 1, event_id: 'purchase_MCC-1', aggregate_id: 'MCC-1',
    payload: { event_name: 'Purchase', custom_data: { value: 649, currency: 'PHP', num_items: 1 } }
  }] });
  const now = new Date('2026-06-20T12:00:00Z');
  const worker = createMetaConversionsWorker({
    client: {}, config: {}, now: () => now, random: () => 0,
    repository: deps.repository, sendEvent: deps.sendEvent, logger: deps.logger
  });

  const result = await worker.runOnce();
  assert.deepEqual(result, { claimed: 1, sent: 1, retried: 0, failed: 0 });
  assert.equal(deps.calls[0][0], 'recover');
  assert.equal(deps.calls[0][1].toISOString(), '2026-06-20T11:55:00.000Z');
  assert.deepEqual(deps.calls[1], ['sent', 'one', { traceId: 'trace-1' }]);
  assert.deepEqual(deps.logs[0], ['info', 'Meta Conversions API event accepted.', {
    eventName: 'Purchase', eventId: 'purchase_MCC-1', value: 649, currency: 'PHP',
    orderNumber: 'MCC-1', paymentMethod: '', numberOfItems: 1,
    browserPixelSent: 'reported_by_browser', conversionsApiSent: true,
    metaApiStatus: 200, eventsReceived: 1
  }]);
});

test('Meta worker retries transient failures and permanently fails invalid events', async () => {
  const transient = Object.assign(new Error('temporary'), { retryable: true });
  const transientDeps = dependencies({ events: [{ id: 'two', attempt_count: 2, payload: {} }], sendError: transient });
  const now = new Date('2026-06-20T12:00:00Z');
  const transientWorker = createMetaConversionsWorker({
    client: {}, config: {}, now: () => now, random: () => 0,
    repository: transientDeps.repository, sendEvent: transientDeps.sendEvent, logger: transientDeps.logger
  });
  await transientWorker.runOnce();
  assert.equal(transientDeps.calls[1][0], 'retry');
  assert.equal(transientDeps.calls[1][2].nextAttemptAt.toISOString(), '2026-06-20T12:02:00.000Z');
  assert.equal(transientDeps.logs[0][0], 'warn');
  assert.equal(transientDeps.logs[0][2].error, 'temporary');

  const permanent = Object.assign(new Error('invalid'), { retryable: false });
  const permanentDeps = dependencies({ events: [{ id: 'three', attempt_count: 1, payload: {} }], sendError: permanent });
  const permanentWorker = createMetaConversionsWorker({
    client: {}, config: {}, now: () => now,
    repository: permanentDeps.repository, sendEvent: permanentDeps.sendEvent, logger: permanentDeps.logger
  });
  await permanentWorker.runOnce();
  assert.deepEqual(permanentDeps.calls[1], ['failed', 'three', 'invalid']);
});

test('Meta retry delays use bounded exponential backoff and stop after eight attempts', async () => {
  assert.equal(retryDelayMs(1, () => 0), 60_000);
  assert.equal(retryDelayMs(7, () => 0), 3_840_000);

  const error = Object.assign(new Error('still failing'), { retryable: true });
  const deps = dependencies({ events: [{ id: 'last', attempt_count: 8, payload: {} }], sendError: error });
  const worker = createMetaConversionsWorker({
    client: {}, config: {}, repository: deps.repository, sendEvent: deps.sendEvent, logger: deps.logger
  });
  await worker.runOnce();
  assert.deepEqual(deps.calls[1], ['failed', 'last', 'still failing']);
});
