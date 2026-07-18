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

test('createOrder posts JSON to the official create-order endpoint and extracts the Pancake ID', async () => {
  const { createPancakeClient } = require('../src/integrations/pancake/pancakeClient');
  const calls = [];
  const client = createPancakeClient(CONFIG, async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ success: true, data: { id: 987654 } }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  });

  const result = await client.createOrder('123', { custom_id: 'MCC-1001', items: [{ variation_id: 'pv-1', quantity: 1 }] });

  assert.deepEqual(result, { pancakeOrderId: '987654', body: { success: true, data: { id: 987654 } } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://pos.pages.fm/api/v1/shops/123/orders?api_key=secret+key%2Fvalue');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.Accept, 'application/json');
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].options.body), { custom_id: 'MCC-1001', items: [{ variation_id: 'pv-1', quantity: 1 }] });
});

test('Pancake client lists orders with updated cursor pagination', async () => {
  const { createPancakeClient } = require('../src/integrations/pancake/pancakeClient');
  const calls = [];
  const client = createPancakeClient({
    apiBaseUrl: 'https://pos.pages.fm/api/v1',
    apiKey: 'secret',
    timeoutMs: 1000
  }, async (url, options) => {
    calls.push({ url, options });
    return { ok: true, text: async () => JSON.stringify({ data: [{ id: 'PK-1' }], page_number: 1, page_size: 50, total_pages: 1, total_entries: 1 }) };
  });

  const body = await client.listOrders('shop-1', {
    pageNumber: 1,
    pageSize: 50,
    updatedSince: '2026-07-10T00:00:00.000Z',
    updatedUntil: '2026-07-10T00:15:00.000Z'
  });
  assert.equal(body.data[0].id, 'PK-1');
  assert.match(calls[0].url, /\/shops\/shop-1\/orders/);
  assert.match(calls[0].url, /updateStatus=updated_at/);
  assert.match(calls[0].url, /startDateTime=1783641600/);
  assert.match(calls[0].url, /endDateTime=1783642500/);
  assert.match(calls[0].url, /option_sort=last_updated_order_asc/);
  assert.doesNotMatch(calls[0].url, /updated_since/);
});

test('Pancake client searches by website order number and keeps only an exact custom ID', async () => {
  const { createPancakeClient } = require('../src/integrations/pancake/pancakeClient');
  const calls = [];
  const client = createPancakeClient(CONFIG, async (url) => {
    calls.push(url);
    return new Response(JSON.stringify({
      data: [
        { id: 'PK-EXACT', custom_id: 'MCC-1001' },
        { id: 'MCC-1001' },
        { id: 'PK-NOT-EXACT', custom_id: 'MCC-10010' }
      ],
      page_number: 1,
      page_size: 100,
      total_pages: 1,
      total_entries: 2
    }), { status: 200 });
  });

  const matches = await client.findOrdersByCustomId('shop-1', 'MCC-1001');

  assert.deepEqual(matches.map((item) => item.id), ['PK-EXACT', 'MCC-1001']);
  assert.match(calls[0], /search=MCC-1001/);
});

test('Pancake client uses the official Philippine geographic hierarchy endpoints', async () => {
  const { createPancakeClient } = require('../src/integrations/pancake/pancakeClient');
  const calls = [];
  const client = createPancakeClient(CONFIG, async (url) => {
    calls.push(url);
    const record = url.includes('/provinces')
      ? { id: '63_826', name: 'Cavite', name_en: 'Cavite', new_id: null }
      : url.includes('/districts')
        ? { id: '63_8261588', name: 'Imus', province_id: '63_826' }
        : { id: '63_82615881238', name: 'Bucandala iv', province_id: '63_826', district_id: '63_8261588' };
    return new Response(JSON.stringify({ success: true, data: [record] }), { status: 200 });
  });

  assert.equal((await client.listProvinces('63'))[0].id, '63_826');
  assert.equal((await client.listDistricts('63_826'))[0].provinceId, '63_826');
  assert.equal((await client.listCommunes('63_826', '63_8261588'))[0].districtId, '63_8261588');
  assert.match(calls[0], /\/geo\/provinces\?.*country_code=63/);
  assert.match(calls[1], /\/geo\/districts\?.*province_id=63_826/);
  assert.match(calls[2], /\/geo\/communes\?.*province_id=63_826.*district_id=63_8261588/);
});

test('Pancake client updates an order with JSON body', async () => {
  const { createPancakeClient } = require('../src/integrations/pancake/pancakeClient');
  const calls = [];
  const client = createPancakeClient({
    apiBaseUrl: 'https://pos.pages.fm/api/v1',
    apiKey: 'secret',
    timeoutMs: 1000
  }, async (url, options) => {
    calls.push({ url, options });
    return { ok: true, text: async () => JSON.stringify({ data: { id: 'PK-1' } }) };
  });

  await client.updateOrder('shop-1', 'PK-1', { status: 2 });
  assert.equal(calls[0].options.method, 'PUT');
  assert.equal(JSON.parse(calls[0].options.body).status, 2);
  assert.match(calls[0].url, /\/shops\/shop-1\/orders\/PK-1/);
});

test('Pancake client retrieves one order for idempotent status reconciliation', async () => {
  const { createPancakeClient } = require('../src/integrations/pancake/pancakeClient');
  const calls = [];
  const client = createPancakeClient(CONFIG, async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ success: true, data: { id: 'PK-1', status: 7 } }), { status: 200 });
  });

  const order = await client.getOrder('shop-1', 'PK-1');
  assert.deepEqual(order, { id: 'PK-1', status: 7 });
  assert.equal(calls[0].options.method, 'GET');
  assert.match(calls[0].url, /\/shops\/shop-1\/orders\/PK-1/);
});

test('Pancake client uses official mapped product and bulk quantity update endpoints', async () => {
  const { createPancakeClient } = require('../src/integrations/pancake/pancakeClient');
  const calls = [];
  const client = createPancakeClient(CONFIG, async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  });
  await client.updateProduct('shop-1', 'product-1', { product: { name: 'Shirt', weight: 250 } });
  await client.updateVariationQuantities('shop-1', {
    is_actual_remain_quantity: false,
    variations_warehouses: [{ variation_id: 'variant-1', remain_quantity: 3, warehouse_id: 'warehouse-1' }]
  });
  assert.match(calls[0].url, /\/shops\/shop-1\/products\/product-1/);
  assert.equal(calls[0].options.method, 'PUT');
  assert.match(calls[1].url, /\/shops\/shop-1\/variations\/update_quantity/);
  assert.equal(calls[1].options.method, 'POST');
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
