const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('admin product-card controls persist while the storefront receives display data only', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mcc-product-card-content-'));
  const productsFile = path.join(directory, 'products.json');
  const credentialsFile = path.join(directory, 'credentials.json');
  const settingsFile = path.join(directory, 'settings.json');
  const sourceProducts = path.join(__dirname, '..', 'data', 'products.json');
  await fs.copyFile(sourceProducts, productsFile);
  const products = JSON.parse(await fs.readFile(productsFile, 'utf8'));
  const first = products[0];

  const previous = Object.fromEntries([
    'APP_ENV', 'DATABASE_URL', 'ADMIN_TOKEN', 'ADMIN_CREDENTIALS_FILE',
    'PRODUCTS_DATA_FILE', 'STORE_SETTINGS_FILE'
  ].map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    APP_ENV: 'test',
    DATABASE_URL: '',
    ADMIN_TOKEN: 'product-card-content-admin-token',
    ADMIN_CREDENTIALS_FILE: credentialsFile,
    PRODUCTS_DATA_FILE: productsFile,
    STORE_SETTINGS_FILE: settingsFile
  });

  const { createApp } = require('../src/app');
  const server = await new Promise((resolve, reject) => {
    const listener = createApp().listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = {
    Authorization: 'Bearer product-card-content-admin-token',
    'Content-Type': 'application/json'
  };

  try {
    const beforeResponse = await fetch(`${base}/api/admin/products/${encodeURIComponent(first.slug)}`, { headers });
    assert.equal(beforeResponse.status, 200);
    const before = (await beforeResponse.json()).product;

    const cardContent = {
      text: 'A short sourced product-card note.',
      rating: 4.8,
      source: 'Previous website',
      showText: true,
      showRating: true,
      showSource: true
    };
    const updateResponse = await fetch(`${base}/api/admin/products/${encodeURIComponent(first.slug)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        ...before,
        productPage: { ...(before.productPage || {}), cardContent }
      })
    });
    assert.equal(updateResponse.status, 200);
    const updated = (await updateResponse.json()).product;
    assert.deepEqual(updated.productPage.cardContent, cardContent);

    const storefrontResponse = await fetch(`${base}/api/products/${encodeURIComponent(first.slug)}`);
    assert.equal(storefrontResponse.status, 200);
    const storefront = (await storefrontResponse.json()).product;
    assert.deepEqual(storefront.productPage.cardContent, cardContent);
    assert.equal('showText' in storefront.productPage.cardContent, true);
    assert.equal('adminOnly' in storefront.productPage.cardContent, false);

    const invalidResponse = await fetch(`${base}/api/admin/products/${encodeURIComponent(first.slug)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        ...updated,
        productPage: {
          ...(updated.productPage || {}),
          cardContent: { ...cardContent, source: '', showSource: false }
        }
      })
    });
    assert.equal(invalidResponse.status, 400);
    const invalid = await invalidResponse.json();
    assert.match(invalid.error, /visible source is required/i);

    const invalidPrecisionResponse = await fetch(`${base}/api/admin/products/${encodeURIComponent(first.slug)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        ...updated,
        productPage: {
          ...(updated.productPage || {}),
          cardContent: { ...cardContent, rating: 4.85 }
        }
      })
    });
    assert.equal(invalidPrecisionResponse.status, 400);
    const invalidPrecision = await invalidPrecisionResponse.json();
    assert.match(invalidPrecision.error, /0\.1 increments/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
    await fs.rm(directory, { recursive: true, force: true });
  }
});
