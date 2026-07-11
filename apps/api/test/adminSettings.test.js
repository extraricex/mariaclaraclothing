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

async function withSettingsServer(run, envOverrides = {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-admin-settings-'));
  const previousAppEnv = process.env.APP_ENV;
  const previousSettingsFile = process.env.STORE_SETTINGS_FILE;
  const previousCredentialsFile = process.env.ADMIN_CREDENTIALS_FILE;
  const previousAdminToken = process.env.ADMIN_TOKEN;
  const previousAdminPassword = process.env.ADMIN_PASSWORD;

  process.env.STORE_SETTINGS_FILE = path.join(tempDir, 'store-settings.json');
  process.env.ADMIN_CREDENTIALS_FILE = path.join(tempDir, 'admin-credentials.json');
  delete process.env.ADMIN_TOKEN;
  delete process.env.ADMIN_PASSWORD;
  Object.assign(process.env, envOverrides);

  const app = createFreshApp();
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const port = server.address().port;

  try {
    await run(port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreEnv('APP_ENV', previousAppEnv);
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
      adminRequest('PUT', {
        storeName: 'Maria Clara MNL',
        contactEmail: 'hello@mariaclara.ph',
        messengerUrl: 'https://m.me/mariaclaraclothing'
      })
    );
    assert.equal(generalResponse.status, 200);
    const general = await generalResponse.json();
    assert.equal(general.settings.general.storeName, 'Maria Clara MNL');
    assert.equal(general.settings.general.messengerUrl, 'https://m.me/mariaclaraclothing');

    const invalidMessenger = await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/general`,
      adminRequest('PUT', { messengerUrl: 'https://example.com/chat' })
    );
    assert.equal(invalidMessenger.status, 400);
    assert.match((await invalidMessenger.json()).error, /Messenger URL/);

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

test('admin can change the password and the token rotates', async () => {
  await withSettingsServer(async (port) => {
    const wrongCurrent = await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/security/password`,
      adminRequest('POST', { currentPassword: 'nope', newPassword: 'brand-new-password' })
    );
    assert.equal(wrongCurrent.status, 401);
    assert.equal((await wrongCurrent.json()).error, 'Current password is invalid');

    const tooShort = await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/security/password`,
      adminRequest('POST', { currentPassword: 'admin', newPassword: 'short' })
    );
    assert.equal(tooShort.status, 400);
    assert.equal((await tooShort.json()).error, 'Password must be at least 8 characters.');

    const changed = await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/security/password`,
      adminRequest('POST', { currentPassword: 'admin', newPassword: 'brand-new-password' })
    );
    assert.equal(changed.status, 200);
    const { token: newToken } = await changed.json();
    assert.ok(newToken);
    assert.notEqual(newToken, ADMIN_TOKEN);

    const oldTokenResponse = await fetch(`http://127.0.0.1:${port}/api/admin/settings`, adminRequest());
    assert.equal(oldTokenResponse.status, 401);

    const newTokenResponse = await fetch(`http://127.0.0.1:${port}/api/admin/settings`, adminRequest('GET', undefined, newToken));
    assert.equal(newTokenResponse.status, 200);

    const oldLogin = await fetch(`http://127.0.0.1:${port}/api/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'admin' })
    });
    assert.equal(oldLogin.status, 401);

    const newLogin = await fetch(`http://127.0.0.1:${port}/api/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'brand-new-password' })
    });
    assert.equal(newLogin.status, 200);
    assert.equal((await newLogin.json()).token, newToken);
  });
});

test('development admin login accepts configured local password even after stored credentials exist', async () => {
  await withSettingsServer(async (port) => {
    const changed = await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/security/password`,
      adminRequest('POST', { currentPassword: 'admin', newPassword: 'brand-new-password' })
    );
    assert.equal(changed.status, 200);

    const login = await fetch(`http://127.0.0.1:${port}/api/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'admin' })
    });
    assert.equal(login.status, 200);
    assert.ok((await login.json()).csrfToken);
  }, { APP_ENV: 'development', ADMIN_PASSWORD: 'admin' });
});

test('admin can rotate the token without changing the password', async () => {
  await withSettingsServer(async (port) => {
    const rotated = await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/security/rotate-token`,
      adminRequest('POST', {})
    );
    assert.equal(rotated.status, 200);
    const { token } = await rotated.json();
    assert.ok(token);
    assert.notEqual(token, ADMIN_TOKEN);

    assert.equal((await fetch(`http://127.0.0.1:${port}/api/admin/settings`, adminRequest())).status, 401);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/admin/settings`, adminRequest('GET', undefined, token))).status, 200);

    const login = await fetch(`http://127.0.0.1:${port}/api/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'admin' })
    });
    assert.equal(login.status, 200);
    assert.equal((await login.json()).token, token);
  });
});

test('public storefront settings expose only the safe subset', async () => {
  await withSettingsServer(async (port) => {
    await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/payments`,
      adminRequest('PUT', { methods: [{ id: 'gcash', enabled: true, instructions: 'Send to 0917 000 0000.' }] })
    );
    await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/security/password`,
      adminRequest('POST', { currentPassword: 'admin', newPassword: 'brand-new-password' })
    );

    const response = await fetch(`http://127.0.0.1:${port}/api/storefront-settings`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');

    const body = await response.json();
    assert.equal(body.settings.storeName, 'Maria Clara Clothing');
    assert.equal(body.settings.messengerUrl, 'https://m.me/mariaclaraclothing');
    assert.equal(body.settings.hero.title, 'Premium');
    assert.equal(body.settings.hero.primaryButtonText, 'Shop new arrivals');
    assert.deepEqual(body.settings.storefrontCollections, ['New Arrivals']);
    assert.ok(body.settings.sizeChart.imageUrl);
    assert.equal(body.settings.shipping.regions.length, 3);
    assert.deepEqual(
      body.settings.paymentMethods.map((method) => method.id),
      ['cash_on_delivery', 'gcash']
    );
    assert.equal(body.settings.paymentMethods.find((method) => method.id === 'gcash').instructions, 'Send to 0917 000 0000.');
    assert.equal(body.settings.hero.secondaryButtonLink, '#freedom-of-mind');

    const raw = JSON.stringify(body);
    assert.equal(raw.includes('bank_transfer'), false);
    assert.equal(raw.includes('passwordHash'), false);
    assert.equal(raw.includes('"token"'), false);
  });
});

test('admin can create and list persistent storefront collections', async () => {
  await withSettingsServer(async (port) => {
    const unauthenticated = await fetch(`http://127.0.0.1:${port}/api/admin/collections`);
    assert.equal(unauthenticated.status, 401);

    const before = await fetch(`http://127.0.0.1:${port}/api/admin/collections`, adminRequest());
    assert.equal(before.status, 200);
    assert.deepEqual((await before.json()).collections, ['New Arrivals']);

    const created = await fetch(
      `http://127.0.0.1:${port}/api/admin/collections`,
      adminRequest('POST', { name: '  Summer   Drop  ' })
    );
    assert.equal(created.status, 201);
    assert.deepEqual((await created.json()).collections, ['New Arrivals', 'Summer Drop']);

    const duplicate = await fetch(
      `http://127.0.0.1:${port}/api/admin/collections`,
      adminRequest('POST', { name: 'summer drop' })
    );
    assert.equal(duplicate.status, 409);
    assert.match((await duplicate.json()).error, /already exists/i);

    const publicBody = await (await fetch(`http://127.0.0.1:${port}/api/storefront-settings`)).json();
    assert.deepEqual(publicBody.settings.storefrontCollections, ['New Arrivals', 'Summer Drop']);
    assert.ok(publicBody.settings.collectionCountdowns['Summer Drop']);
  });
});

test('website settings flow through the admin and public endpoints', async () => {
  await withSettingsServer(async (port) => {
    const tickerPut = await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/website`,
      adminRequest('PUT', { ticker: ['Big drop Friday'] })
    );
    assert.equal(tickerPut.status, 200);
    const afterTicker = await tickerPut.json();
    assert.deepEqual(afterTicker.settings.website.ticker, ['Big drop Friday']);
    assert.equal(afterTicker.settings.website.maintenanceMode, false);

    const seoPut = await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/website`,
      adminRequest('PUT', { seo: { title: 'MC Streetwear', description: 'Heavyweight tees.' } })
    );
    assert.equal(seoPut.status, 200);
    const afterSeo = await seoPut.json();
    assert.equal(afterSeo.settings.website.seo.title, 'MC Streetwear');
    assert.deepEqual(afterSeo.settings.website.ticker, ['Big drop Friday']);

    const badTicker = await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/website`,
      adminRequest('PUT', { ticker: [] })
    );
    assert.equal(badTicker.status, 400);
    assert.equal((await badTicker.json()).error, 'Ticker must have 1 to 8 items.');

    const publicResponse = await fetch(`http://127.0.0.1:${port}/api/storefront-settings`);
    const publicBody = await publicResponse.json();
    assert.deepEqual(publicBody.settings.ticker, ['Big drop Friday']);
    assert.equal(publicBody.settings.seo.title, 'MC Streetwear');
    assert.equal(publicBody.settings.maintenanceMode, false);
    assert.ok(Array.isArray(publicBody.settings.infoPages.faq));
    assert.ok(publicBody.settings.infoPages.faq[0].heading);
  });
});

test('low stock threshold drives product summaries and product settings', async () => {
  await withSettingsServer(async (port) => {
    const beforeResponse = await fetch(`http://127.0.0.1:${port}/api/admin/products`, adminRequest());
    const before = await beforeResponse.json();

    const putResponse = await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/inventory`,
      adminRequest('PUT', { lowStockThreshold: 999 })
    );
    assert.equal(putResponse.status, 200);
    assert.equal((await putResponse.json()).settings.inventory.lowStockThreshold, 999);

    const productSettings = await (await fetch(`http://127.0.0.1:${port}/api/admin/products/settings`, adminRequest())).json();
    assert.equal(productSettings.settings.lowStockThreshold, 999);

    const after = await (await fetch(`http://127.0.0.1:${port}/api/admin/products`, adminRequest())).json();
    assert.ok(after.summary.lowStock > before.summary.lowStock);
    assert.equal(after.summary.lowStock + after.summary.soldOut, after.summary.total);
    assert.ok(after.products.every((product) =>
      product.inventoryQuantity === 0 ? product.stockStatus === 'sold_out' : product.stockStatus === 'low_stock'));

    const publicBody = await (await fetch(`http://127.0.0.1:${port}/api/storefront-settings`)).json();
    assert.equal(publicBody.settings.inventory.lowStockThreshold, 999);

    const badPut = await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/inventory`,
      adminRequest('PUT', { lowStockThreshold: 0 })
    );
    assert.equal(badPut.status, 400);
    assert.equal((await badPut.json()).error, 'Low stock threshold must be an integer between 1 and 999.');
  });
});

test('admin saves revisioned collection countdowns and public settings expose them', async () => {
  await withSettingsServer(async (port) => {
    const countdownPath = '/api/admin/settings/collection-countdowns/New%20Arrivals';
    const unauthenticated = await fetch(`http://127.0.0.1:${port}${countdownPath}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true, message: 'Soon', durationSeconds: 60 })
    });
    assert.equal(unauthenticated.status, 401);

    const firstResponse = await fetch(
      `http://127.0.0.1:${port}${countdownPath}`,
      adminRequest('PUT', {
        enabled: true,
        message: 'Collection closes soon',
        durationSeconds: 7200,
        revision: 500
      })
    );
    assert.equal(firstResponse.status, 200);
    const first = await firstResponse.json();
    assert.deepEqual(first.countdown, {
      enabled: true,
      message: 'Collection closes soon',
      durationSeconds: 7200,
      revision: 1
    });

    const secondResponse = await fetch(
      `http://127.0.0.1:${port}${countdownPath}`,
      adminRequest('PUT', {
        enabled: true,
        message: 'Collection closes soon',
        durationSeconds: 7200
      })
    );
    assert.equal(secondResponse.status, 200);
    assert.equal((await secondResponse.json()).countdown.revision, 2);

    const publicBody = await (await fetch(
      `http://127.0.0.1:${port}/api/storefront-settings`
    )).json();
    assert.equal(publicBody.settings.collectionCountdowns['New Arrivals'].revision, 2);

    const unknown = await fetch(
      `http://127.0.0.1:${port}/api/admin/settings/collection-countdowns/Unknown`,
      adminRequest('PUT', { enabled: true, message: 'Soon', durationSeconds: 60 })
    );
    assert.equal(unknown.status, 400);
    assert.equal((await unknown.json()).error, 'Collection is invalid.');
  });
});
