import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NETWORK_ERROR_MESSAGE,
  TEMPORARY_SERVICE_MESSAGE,
  fetchWithRecovery,
  responseErrorMessage
} from '../src/lib/network.js';

function response(status, retryAfter = '') {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name === 'Retry-After' ? retryAfter : '' }
  };
}

test('safe GET requests recover from network and temporary upstream failures', async () => {
  const outcomes = [new TypeError('Failed to fetch'), response(503, '1'), response(200)];
  const waits = [];
  let calls = 0;
  const result = await fetchWithRecovery('/api/products', {}, {
    fetchImpl: async () => {
      const outcome = outcomes[calls++];
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
    retryDelaysMs: [10, 20],
    wait: async (milliseconds) => waits.push(milliseconds)
  });

  assert.equal(result.status, 200);
  assert.equal(calls, 3);
  assert.deepEqual(waits, [10, 1000]);
});

test('non-idempotent requests are not automatically retried', async () => {
  let calls = 0;
  await assert.rejects(
    fetchWithRecovery('/api/orders', { method: 'POST', body: '{}' }, {
      fetchImpl: async () => {
        calls += 1;
        throw new TypeError('Failed to fetch');
      },
      retryDelaysMs: [0, 0],
      wait: async () => {}
    }),
    (error) => error.code === 'NETWORK_ERROR' && error.message === NETWORK_ERROR_MESSAGE
  );
  assert.equal(calls, 1);
});

test('temporary proxy responses receive a customer-friendly message', () => {
  assert.equal(responseErrorMessage(response(503)), TEMPORARY_SERVICE_MESSAGE);
  assert.equal(responseErrorMessage(response(400), 'Please check your details.'), 'Please check your details.');
});
