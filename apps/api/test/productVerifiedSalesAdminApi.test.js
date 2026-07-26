const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('admin historical adjustment is audited while website sold quantity remains computed', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mcc-product-commerce-admin-'));
  const productsFile = path.join(directory, 'products.json');
  const ordersFile = path.join(directory, 'orders.json');
  const settingsFile = path.join(directory, 'settings.json');
  const credentialsFile = path.join(directory, 'credentials.json');
  const inventoryMovementsFile = path.join(directory, 'inventory-movements.json');
  const sourceProducts = path.join(__dirname, '..', 'data', 'products.json');
  await fs.copyFile(sourceProducts, productsFile);
  const products = JSON.parse(await fs.readFile(productsFile, 'utf8'));
  const first = products[0];
  const productId = `catalog-${first.slug}`;
  await fs.writeFile(ordersFile, JSON.stringify({
    orders: [
      { orderNumber: 'REAL-1', status: 'confirmed', paymentStatus: 'cod_pending', items: [{ productId, quantity: 42 }] },
      { orderNumber: 'CANCEL-1', status: 'cancelled', paymentStatus: 'cod_pending', items: [{ productId, quantity: 50 }] },
      { orderNumber: 'TEST-1', status: 'confirmed', paymentStatus: 'paid', isTestOrder: true, items: [{ productId, quantity: 60 }] }
    ]
  }));

  const previous = Object.fromEntries([
    'APP_ENV', 'DATABASE_URL', 'ADMIN_TOKEN', 'ADMIN_CREDENTIALS_FILE',
    'PRODUCTS_DATA_FILE', 'ORDERS_DATA_FILE', 'STORE_SETTINGS_FILE',
    'INVENTORY_MOVEMENTS_DATA_FILE'
  ].map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    APP_ENV: 'test',
    DATABASE_URL: '',
    ADMIN_TOKEN: 'verified-sales-admin-token',
    ADMIN_CREDENTIALS_FILE: credentialsFile,
    PRODUCTS_DATA_FILE: productsFile,
    ORDERS_DATA_FILE: ordersFile,
    STORE_SETTINGS_FILE: settingsFile,
    INVENTORY_MOVEMENTS_DATA_FILE: inventoryMovementsFile
  });

  const { createApp } = require('../src/app');
  const server = await new Promise((resolve, reject) => {
    const listener = createApp().listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = {
    Authorization: 'Bearer verified-sales-admin-token',
    'Content-Type': 'application/json'
  };

  try {
    const beforeResponse = await fetch(`${base}/api/admin/products/${encodeURIComponent(first.slug)}`, { headers });
    assert.equal(beforeResponse.status, 200);
    const before = (await beforeResponse.json()).product;
    assert.equal(before.commerceStatsCalculated.websiteEligibleUnitsSold, 42);
    assert.equal(before.commerceStatsCalculated.finalDisplayedSoldCount, 42);

    const updateResponse = await fetch(`${base}/api/admin/products/${encodeURIComponent(first.slug)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        ...before,
        commerceStats: {
          ...before.commerceStats,
          historicalSoldQuantity: 120,
          historicalSoldSource: 'Verified TikTok Shop sales as of July 2026',
          historicalSoldNote: 'Matched to the July 2026 shop export.'
        }
      })
    });
    assert.equal(updateResponse.status, 200);
    const updated = (await updateResponse.json()).product;
    assert.equal(updated.commerceStatsCalculated.websiteEligibleUnitsSold, 42);
    assert.equal(updated.commerceStatsCalculated.finalDisplayedSoldCount, 162);
    assert.equal(updated.commerceStats.historicalSoldUpdatedBy, 'admin');
    assert.ok(updated.commerceStats.historicalSoldUpdatedAt);

    const publicResponse = await fetch(`${base}/api/products/${encodeURIComponent(first.slug)}`);
    assert.equal(publicResponse.status, 200);
    const storefront = (await publicResponse.json()).product;
    assert.equal(storefront.websiteSoldQuantity, 42);
    assert.equal(storefront.historicalSoldQuantity, 120);
    assert.equal(storefront.displayedSoldQuantity, 162);
    assert.equal(storefront.soldDisplayText, '162 sold');
    assert.equal('historicalSoldSource' in storefront, false);
    assert.equal('historicalSoldNote' in storefront, false);

    const stored = JSON.parse(await fs.readFile(productsFile, 'utf8'))
      .find((product) => product.slug === first.slug);
    assert.equal(stored.historicalSoldQuantity, 120);
    assert.equal('websiteSoldQuantity' in stored, false);
    assert.equal('commerceStatsCalculated' in stored, false);

    const invalidResponse = await fetch(`${base}/api/admin/products/${encodeURIComponent(first.slug)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        ...updated,
        commerceStats: { ...updated.commerceStats, historicalSoldQuantity: -1 }
      })
    });
    assert.equal(invalidResponse.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
    await fs.rm(directory, { recursive: true, force: true });
  }
});
