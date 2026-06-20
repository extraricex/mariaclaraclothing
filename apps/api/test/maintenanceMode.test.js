const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

// Isolate the catalog so order-creation stock deduction never mutates the committed fixture.
const nodeFsForProducts = require('node:fs');
const nodeOsForProducts = require('node:os');
const nodePathForProducts = require('node:path');
process.env.PRODUCTS_DATA_FILE = nodePathForProducts.join(
  nodeFsForProducts.mkdtempSync(nodePathForProducts.join(nodeOsForProducts.tmpdir(), 'mc-products-')),
  'products.json'
);
nodeFsForProducts.copyFileSync(
  nodePathForProducts.join(__dirname, '..', 'data', 'products.json'),
  process.env.PRODUCTS_DATA_FILE
);

const ADMIN_TOKEN = 'local-admin-token';

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function createFreshApp() {
  delete require.cache[require.resolve('../src/app')];
  delete require.cache[require.resolve('../src/routes/admin')];
  delete require.cache[require.resolve('../src/routes/orders')];
  delete require.cache[require.resolve('../src/routes/storeSettings')];
  delete require.cache[require.resolve('../src/settings/storeSettingsRepository')];
  delete require.cache[require.resolve('../src/orders/orderRepository')];
  return require('../src/app').createApp();
}

test('maintenance mode blocks checkout and is reversible', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-maintenance-'));
  const previousSettingsFile = process.env.STORE_SETTINGS_FILE;
  const previousCredentialsFile = process.env.ADMIN_CREDENTIALS_FILE;
  const previousOrdersFile = process.env.ORDERS_DATA_FILE;
  const previousAdminToken = process.env.ADMIN_TOKEN;

  process.env.STORE_SETTINGS_FILE = path.join(tempDir, 'store-settings.json');
  process.env.ADMIN_CREDENTIALS_FILE = path.join(tempDir, 'admin-credentials.json');
  process.env.ORDERS_DATA_FILE = path.join(tempDir, 'orders.json');
  process.env.ADMIN_TOKEN = ADMIN_TOKEN;

  const app = createFreshApp();
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const port = server.address().port;

  function putWebsite(body) {
    return fetch(`http://127.0.0.1:${port}/api/admin/settings/website`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  function postOrder() {
    return fetch(`http://127.0.0.1:${port}/api/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    });
  }

  try {
    assert.equal((await putWebsite({ maintenanceMode: true })).status, 200);

    const blocked = await postOrder();
    assert.equal(blocked.status, 503);
    assert.equal((await blocked.json()).error, 'Store is under maintenance.');

    const adminOk = await fetch(`http://127.0.0.1:${port}/api/admin/settings`, {
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` }
    });
    assert.equal(adminOk.status, 200);

    assert.equal((await putWebsite({ maintenanceMode: false })).status, 200);

    const after = await postOrder();
    assert.equal(after.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreEnv('STORE_SETTINGS_FILE', previousSettingsFile);
    restoreEnv('ADMIN_CREDENTIALS_FILE', previousCredentialsFile);
    restoreEnv('ORDERS_DATA_FILE', previousOrdersFile);
    restoreEnv('ADMIN_TOKEN', previousAdminToken);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
