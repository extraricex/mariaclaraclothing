const test = require('node:test');
const assert = require('node:assert/strict');

const CONFIG = {
  apiBaseUrl: 'https://pos.pages.fm/api/v1',
  apiKey: 'secret key/value',
  timeoutMs: 25
};

test('listShops calls the official endpoint with the API key', async () => {
  const { createPancakeClient } = require('../src/integrations/pancake/pancakeClient');
  const calls = [];
  const client = createPancakeClient(CONFIG, async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ success: true, shops: [{ id: 123, name: 'Maria Clara' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  });

  assert.equal((await client.listShops()).shops[0].id, 123);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://pos.pages.fm/api/v1/shops?api_key=secret+key%2Fvalue');
  assert.equal(calls[0].options.headers.Accept, 'application/json');
});

test('client errors never expose credentials or provider response bodies', async () => {
  const { createPancakeClient } = require('../src/integrations/pancake/pancakeClient');
  const client = createPancakeClient(CONFIG, async () => new Response(
    `provider failed with ${CONFIG.apiKey}`,
    { status: 502, headers: { 'content-type': 'text/plain' } }
  ));

  await assert.rejects(client.listShops(), (error) => {
    assert.equal(error.code, 'pancake_http_error');
    assert.equal(error.status, 502);
    assert.equal(error.retryable, true);
    assert.equal(String(error.message).includes(CONFIG.apiKey), false);
    assert.equal(String(error.message).includes('provider failed'), false);
    return true;
  });
});

test('client classifies authentication and invalid payload failures', async () => {
  const { createPancakeClient } = require('../src/integrations/pancake/pancakeClient');
  const unauthorized = createPancakeClient(CONFIG, async () => new Response('{}', {
    status: 401,
    headers: { 'content-type': 'application/json' }
  }));
  await assert.rejects(unauthorized.listShops(), (error) => error.code === 'pancake_auth_failed' && !error.retryable);

  const invalidJson = createPancakeClient(CONFIG, async () => new Response('not json', {
    status: 200,
    headers: { 'content-type': 'text/plain' }
  }));
  await assert.rejects(invalidJson.listShops(), (error) => error.code === 'pancake_invalid_response');

  const rejected = createPancakeClient(CONFIG, async () => new Response(JSON.stringify({ success: false }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  }));
  await assert.rejects(rejected.listShops(), (error) => error.code === 'pancake_rejected');
});

test('client aborts a timed-out request with a retryable safe error', async () => {
  const { createPancakeClient } = require('../src/integrations/pancake/pancakeClient');
  const client = createPancakeClient({ ...CONFIG, timeoutMs: 5 }, (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => {
      const error = new Error('request aborted');
      error.name = 'AbortError';
      reject(error);
    });
  }));

  await assert.rejects(client.listShops(), (error) => (
    error.code === 'pancake_timeout' && error.retryable && !String(error.message).includes(CONFIG.apiKey)
  ));
});

test('connection service avoids external calls when disabled or incomplete', async () => {
  const { testPancakeConnection } = require('../src/integrations/pancake/pancakeConnectionService');
  let calls = 0;
  const client = { listShops: async () => { calls += 1; return { shops: [] }; } };
  const records = [];
  const repository = { recordConnectionCheck: async (record) => records.push(record) };

  const disabled = await testPancakeConnection({
    config: { mode: 'disabled', configured: false, apiKey: 'do-not-return', webhookSecret: 'also-secret' },
    client,
    repository
  });
  const incomplete = await testPancakeConnection({
    config: { mode: 'read_only', configured: false, apiKey: '', webhookSecret: '' },
    client,
    repository
  });

  assert.equal(disabled.healthStatus, 'disabled');
  assert.equal(incomplete.healthStatus, 'incomplete');
  assert.equal(calls, 0);
  assert.equal(JSON.stringify({ disabled, incomplete, records }).includes('do-not-return'), false);
  assert.equal(JSON.stringify({ disabled, incomplete, records }).includes('also-secret'), false);
});

test('connection service verifies the configured shop and persists safe state', async () => {
  const { testPancakeConnection } = require('../src/integrations/pancake/pancakeConnectionService');
  const records = [];
  const config = {
    mode: 'read_only', configured: true, apiBaseUrl: 'https://pos.pages.fm/api/v1',
    apiKey: 'secret', webhookSecret: 'webhook-secret', shopId: '123', warehouseId: 'warehouse-1',
    orderSourceId: 'website'
  };
  const connected = await testPancakeConnection({
    config,
    client: { listShops: async () => ({ shops: [{ id: 123, name: 'Maria Clara' }] }) },
    repository: { recordConnectionCheck: async (record) => records.push(record) },
    now: () => new Date('2026-07-04T00:00:00.000Z')
  });

  assert.equal(connected.healthStatus, 'connected');
  assert.deepEqual(connected.shop, { id: '123', name: 'Maria Clara' });
  assert.equal(records[0].healthStatus, 'connected');
  assert.equal(JSON.stringify({ connected, records }).includes('secret'), false);
});

test('connection service safely reports missing shops and provider failures', async () => {
  const { testPancakeConnection } = require('../src/integrations/pancake/pancakeConnectionService');
  const config = { mode: 'read_only', configured: true, apiKey: 'secret', webhookSecret: '', shopId: '999' };
  const repository = { recordConnectionCheck: async () => {} };
  const missing = await testPancakeConnection({
    config,
    client: { listShops: async () => ({ shops: [{ id: 123, name: 'Other shop' }] }) },
    repository
  });
  const failed = await testPancakeConnection({
    config,
    client: { listShops: async () => { const error = new Error('contains secret'); error.code = 'pancake_timeout'; throw error; } },
    repository
  });

  assert.equal(missing.healthStatus, 'shop_not_found');
  assert.equal(failed.healthStatus, 'unavailable');
  assert.equal(failed.lastErrorCode, 'pancake_timeout');
  assert.equal(JSON.stringify(failed).includes('contains secret'), false);
});

test('connection status exposes locally selected references and validation state', () => {
  const { publicStatus } = require('../src/integrations/pancake/pancakeConnectionService');
  const result = publicStatus({ mode: 'read_only', configured: false, apiKey: 'secret' }, {
    shopId: '7', warehouseId: 'w1', orderSourceId: 'web', currencyStatus: 'unknown',
    priceUnitStatus: 'confirmed_centavos', shopLocked: false, warehouseLocked: false, orderSourceLocked: false
  });
  assert.equal(result.shopId, '7');
  assert.equal(result.warehouseId, 'w1');
  assert.equal(result.priceUnitStatus, 'confirmed_centavos');
  assert.equal(JSON.stringify(result).includes('secret'), false);
});
