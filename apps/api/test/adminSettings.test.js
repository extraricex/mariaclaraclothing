const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

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
  delete require.cache[require.resolve('../src/settings/storeSettingsRepository')];
  try {
    delete require.cache[require.resolve('../src/routes/storeSettings')];
  } catch (_error) {
    // route file does not exist until the public endpoint task
  }
  return require('../src/app').createApp();
}

function adminRequest(method = 'GET', body, token = ADMIN_TOKEN) {
  return {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  };
}

async function withSettingsServer(run) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-admin-settings-'));
  const previousSettingsFile = process.env.STORE_SETTINGS_FILE;
  const previousCredentialsFile = process.env.ADMIN_CREDENTIALS_FILE;
  const previousAdminToken = process.env.ADMIN_TOKEN;
  const previousAdminPassword = process.env.ADMIN_PASSWORD;

  process.env.STORE_SETTINGS_FILE = path.join(tempDir, 'store-settings.json');
  process.env.ADMIN_CREDENTIALS_FILE = path.join(tempDir, 'admin-credentials.json');
  delete process.env.ADMIN_TOKEN;
  delete process.env.ADMIN_PASSWORD;

  const app = createFreshApp();
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const port = server.address().port;

  try {
    await run(port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreEnv('STORE_SETTINGS_FILE', previousSettingsFile);
    restoreEnv('ADMIN_CREDENTIALS_FILE', previousCredentialsFile);
    restoreEnv('ADMIN_TOKEN', previousAdminToken);
    restoreEnv('ADMIN_PASSWORD', previousAdminPassword);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test('admin settings require authentication', async () => {
  await withSettingsServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/settings`);
    assert.equal(response.status, 401);
  });
});

test('admin settings expose defaults and save sections', async () => {
  await withSettingsServer(async (port) => {
    const defaultsResponse = await fetch(`http://127.0.0.1:${port}/api/admin/settings`, adminRequest());
    assert.equal(defaultsResponse.status, 200);
    const defaults = await defaultsResponse.json();
    assert.equal(defaults.settings.general.storeName, 'Maria Clara Clothing');
    assert.equal(defaults.settings.shipping.regions.length, 3);
    assert.equal(defaults.settings.payments.methods.length, 3);
    assert.equal(JSON.stringify(defaults).includes('passwordHash'), false);

    const shippingResponse = await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/shipping`,
      adminRequest('PUT', {
        regions: [{ id: 'metro_manila_cavite', feeCents: 9900 }],
        freeShippingEnabled: true,
        freeShippingMinimumItems: 4
      })
    );
    assert.equal(shippingResponse.status, 200);
    const shipping = await shippingResponse.json();
    assert.equal(shipping.settings.shipping.regions.find((region) => region.id === 'metro_manila_cavite').feeCents, 9900);
    assert.equal(shipping.settings.shipping.freeShippingMinimumItems, 4);

    const generalResponse = await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/general`,
      adminRequest('PUT', { storeName: 'Maria Clara MNL', contactEmail: 'hello@mariaclara.ph' })
    );
    assert.equal(generalResponse.status, 200);
    assert.equal((await generalResponse.json()).settings.general.storeName, 'Maria Clara MNL');

    const badFee = await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/shipping`,
      adminRequest('PUT', { regions: [{ id: 'luzon', feeCents: -5 }] })
    );
    assert.equal(badFee.status, 400);

    const badSection = await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/everything`,
      adminRequest('PUT', {})
    );
    assert.equal(badSection.status, 400);
    assert.equal((await badSection.json()).error, 'Settings section is invalid.');

    const codOff = await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/payments`,
      adminRequest('PUT', { methods: [{ id: 'cash_on_delivery', enabled: false }] })
    );
    assert.equal(codOff.status, 400);
    assert.equal((await codOff.json()).error, 'Cash on Delivery cannot be disabled.');
  });
});
