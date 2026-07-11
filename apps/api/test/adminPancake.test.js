const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

function cookieHeader(response) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie') || ''];
  return values.map((value) => value.split(';')[0]).filter(Boolean).join('; ');
}

function freshApp() {
  for (const modulePath of [
    '../src/app', '../src/routes/admin', '../src/routes/adminPancake', '../src/config/env',
    '../src/integrations/pancake/pancakeConnectionRepository',
    '../src/integrations/pancake/pancakeConnectionService'
  ]) {
    try { delete require.cache[require.resolve(modulePath)]; } catch (_error) { /* module is created during TDD */ }
  }
  return require('../src/app').createApp();
}

async function listen(app, run) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await run(server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('Pancake admin status requires authentication and never returns secrets', async () => {
  const previous = Object.fromEntries(['PANCAKE_MODE', 'PANCAKE_API_KEY', 'PANCAKE_SHOP_ID', 'PANCAKE_WEBHOOK_SECRET']
    .map((name) => [name, process.env[name]]));
  process.env.PANCAKE_MODE = 'disabled';
  process.env.PANCAKE_API_KEY = 'api-secret-never-return';
  process.env.PANCAKE_SHOP_ID = '123';
  process.env.PANCAKE_WEBHOOK_SECRET = 'webhook-secret-never-return';
  try {
    await listen(freshApp(), async (port) => {
      const url = `http://127.0.0.1:${port}/api/admin/integrations/pancake/status`;
      assert.equal((await fetch(url)).status, 401);
      const response = await fetch(url, { headers: { authorization: 'Bearer local-admin-token' } });
      assert.equal(response.status, 200);
      const text = await response.text();
      assert.equal(text.includes('api-secret-never-return'), false);
      assert.equal(text.includes('webhook-secret-never-return'), false);
      const body = JSON.parse(text);
      assert.equal(body.pancake.mode, 'disabled');
      assert.equal(body.pancake.apiKeyConfigured, true);
    });
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

test('Pancake connection test inherits admin cookie CSRF protection', async () => {
  const previous = Object.fromEntries(['PANCAKE_MODE', 'PANCAKE_API_KEY', 'PANCAKE_SHOP_ID']
    .map((name) => [name, process.env[name]]));
  process.env.PANCAKE_MODE = 'disabled';
  delete process.env.PANCAKE_API_KEY;
  delete process.env.PANCAKE_SHOP_ID;
  try {
    await listen(freshApp(), async (port) => {
      const login = await fetch(`http://127.0.0.1:${port}/api/admin/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'admin' })
      });
      const loginBody = await login.json();
      const cookie = cookieHeader(login);
      const url = `http://127.0.0.1:${port}/api/admin/integrations/pancake/test-connection`;
      assert.equal((await fetch(url, { method: 'POST', headers: { cookie } })).status, 403);
      const allowed = await fetch(url, {
        method: 'POST', headers: { cookie, 'x-csrf-token': loginBody.csrfToken }
      });
      assert.equal(allowed.status, 200);
      assert.equal((await allowed.json()).pancake.healthStatus, 'disabled');
    });
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

test('Pancake admin subrouter can report an injected successful connection', async () => {
  const { createAdminPancakeRouter } = require('../src/routes/adminPancake');
  const app = express();
  app.use(express.json());
  app.use(createAdminPancakeRouter({
    config: {
      mode: 'read_only', configured: true, apiBaseUrl: 'https://pos.pages.fm/api/v1',
      apiKey: 'secret', webhookSecret: '', shopId: '123', warehouseId: '', orderSourceId: ''
    },
    client: { listShops: async () => ({ shops: [{ id: 123, name: 'Maria Clara' }] }) },
    repository: {
      getConnectionStatus: async () => null,
      recordConnectionCheck: async () => {}
    }
  }));
  await listen(app, async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/test-connection`, { method: 'POST' });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.pancake.healthStatus, 'connected');
    assert.deepEqual(body.pancake.shop, { id: '123', name: 'Maria Clara' });
  });
});

test('Pancake admin status includes bidirectional sync summary', async () => {
  const { createAdminPancakeRouter } = require('../src/routes/adminPancake');
  const app = express();
  app.use(express.json());
  app.use(createAdminPancakeRouter({
    config: {
      mode: 'read_only', configured: true, apiKeyConfigured: true, apiBaseUrl: 'https://pos.pages.fm/api/v1',
      apiKey: 'secret', webhookSecret: '', shopId: '123'
    },
    repository: { getConnectionStatus: async () => ({ healthStatus: 'connected' }), recordConnectionCheck: async () => {} },
    orderSyncRepository: {
      getOrderSyncSummary: async () => ({
        pendingCount: 1,
        failedCount: 2,
        blockedCount: 3,
        linkedCount: 4
      })
    }
  }));
  await listen(app, async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/status`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.pancake.orderSync, {
      pendingCount: 1,
      failedCount: 2,
      blockedCount: 3,
      linkedCount: 4
    });
  });
});

test('Pancake admin subrouter exposes validated catalog import mapping and selection APIs', async () => {
  const { createAdminPancakeRouter } = require('../src/routes/adminPancake');
  const calls = [];
  const catalogService = {
    getCatalogStatus: async () => ({ status: 'complete' }),
    runCatalogImport: async () => ({ status: 'complete', summary: { verifiedCount: 2 } }),
    saveReferenceSelection: async ({ selection }) => { calls.push(selection); return selection; },
    getInventoryStatus: async () => ({ status: 'complete', summary: { updatedCount: 3 } }),
    runInventoryReconciliation: async () => ({ status: 'complete', summary: { checkedCount: 4, updatedCount: 3 } })
  };
  const orderService = {
    getOrderExportStatus: async () => ({ status: 'ready', summary: { queuedCount: 1 }, recent: [] }),
    runOrderShadowBuild: async () => ({ status: 'complete', summary: { checkedCount: 1, builtCount: 1, blockedCount: 0, failedCount: 0 } })
  };
  const catalogRepository = {
    listMappings: async (filters) => ({ items: [], ...filters }),
    listReferences: async () => ({ shops: [], warehouses: [], orderSources: [] })
  };
  const app = express();
  app.use(express.json());
  app.use(createAdminPancakeRouter({
    config: { mode: 'read_only', apiKeyConfigured: true, apiBaseUrl: 'https://pos.pages.fm/api/v1', apiKey: 'secret' },
    repository: { getConnectionStatus: async () => null, recordConnectionCheck: async () => {} },
    client: { listShops: async () => ({ shops: [] }) }, catalogService, catalogRepository, orderService
  }));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  await listen(app, async (port) => {
    const base = `http://127.0.0.1:${port}`;
    assert.equal((await fetch(`${base}/catalog/status`)).status, 200);
    assert.equal((await fetch(`${base}/catalog/import`, { method: 'POST' })).status, 200);
    assert.equal((await fetch(`${base}/inventory/status`)).status, 200);
    const inventory = await (await fetch(`${base}/inventory/reconcile`, { method: 'POST' })).json();
    assert.deepEqual(inventory.inventory.summary, { checkedCount: 4, updatedCount: 3 });
    const orders = await (await fetch(`${base}/orders/status`)).json();
    assert.deepEqual(orders.orders.summary, { queuedCount: 1 });
    const shadow = await (await fetch(`${base}/orders/shadow-build`, { method: 'POST' })).json();
    assert.deepEqual(shadow.orders.summary, { checkedCount: 1, builtCount: 1, blockedCount: 0, failedCount: 0 });
    const mappings = await (await fetch(`${base}/catalog/mappings?page=2&pageSize=25&conflictOnly=true&search=SKU`)).json();
    assert.deepEqual(mappings.mappings, { items: [], page: 2, pageSize: 25, conflictOnly: true, search: 'SKU' });
    assert.equal((await fetch(`${base}/catalog/mappings?page=0`)).status, 400);
    assert.equal((await fetch(`${base}/references`)).status, 200);
    const selection = await fetch(`${base}/references/selection`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ shopId: ' 7 ', warehouseId: ' w1 ', orderSourceId: ' web ' }) });
    assert.equal(selection.status, 200);
    assert.deepEqual(calls[0], { shopId: '7', warehouseId: 'w1', orderSourceId: 'web' });
  });
});
