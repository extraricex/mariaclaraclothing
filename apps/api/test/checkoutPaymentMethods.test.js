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
process.env.INVENTORY_MOVEMENTS_DATA_FILE = nodePathForProducts.join(
  nodeFsForProducts.mkdtempSync(nodePathForProducts.join(nodeOsForProducts.tmpdir(), 'mc-movements-')),
  'inventory-movements.json'
);
const XLSX = require('xlsx');
const { writeJntExportBuffer } = require('../src/jnt/jntExport');

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

async function findInStockItem(port) {
  const response = await fetch(`http://127.0.0.1:${port}/api/products`);
  const { products } = await response.json();
  for (const product of products) {
    const variant = (product.variants || []).find((candidate) => Number(candidate.stockQuantity) > 0);
    if (variant) {
      return {
        productId: product.id,
        variantId: variant.id,
        productName: product.name,
        size: variant.size,
        quantity: 1,
        unitPriceCents: variant.priceCents ?? product.priceCents
      };
    }
  }
  throw new Error('No in-stock product found in the catalog fixture.');
}

function checkoutPayload(item, paymentMethod) {
  return {
    customer: { firstName: 'Juan', lastName: 'Dela Cruz', fullName: 'Juan Dela Cruz', phone: '09171234567', email: '' },
    address: {
      addressLine: '12 Sampaguita St, BUCANDALA IV, IMUS, CAVITE, Philippines',
      houseAddress: '12 Sampaguita St',
      barangay: 'BUCANDALA IV',
      city: 'IMUS',
      province: 'CAVITE',
      country: 'Philippines',
      postalCode: ''
    },
    items: [item],
    shippingFeeCents: 8000,
    paymentMethod
  };
}

test('checkout rejects disabled payment methods and accepts enabled ones', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-checkout-payments-'));
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

  try {
    const item = await findInStockItem(port);

    const rejected = await fetch(`http://127.0.0.1:${port}/api/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(checkoutPayload(item, 'gcash'))
    });
    assert.equal(rejected.status, 400);
    assert.equal((await rejected.json()).error, 'Payment method is not available.');

    const enableResponse = await fetch(`http://127.0.0.1:${port}/api/admin/settings/payments`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ methods: [{ id: 'gcash', enabled: true, instructions: 'Send to 0917 000 0000.' }] })
    });
    assert.equal(enableResponse.status, 200);

    const accepted = await fetch(`http://127.0.0.1:${port}/api/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(checkoutPayload(item, 'gcash'))
    });
    assert.equal(accepted.status, 201);
    const { orderNumber } = await accepted.json();

    const orderResponse = await fetch(`http://127.0.0.1:${port}/api/admin/orders/${orderNumber}`, {
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` }
    });
    const { order } = await orderResponse.json();
    assert.equal(order.paymentMethod, 'gcash');

    const codOrder = await fetch(`http://127.0.0.1:${port}/api/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(checkoutPayload(item, 'cash_on_delivery'))
    });
    assert.equal(codOrder.status, 201);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreEnv('STORE_SETTINGS_FILE', previousSettingsFile);
    restoreEnv('ADMIN_CREDENTIALS_FILE', previousCredentialsFile);
    restoreEnv('ORDERS_DATA_FILE', previousOrdersFile);
    restoreEnv('ADMIN_TOKEN', previousAdminToken);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('J&T export writes a zero COD amount for prepaid orders', () => {
  const order = {
    orderNumber: 'MCC-1765000000000-AB12',
    customer: { fullName: 'Juan Dela Cruz', phone: '09171234567', email: '' },
    address: {
      addressLine: '12 Sampaguita St, BUCANDALA IV, IMUS, CAVITE, Philippines',
      houseAddress: '12 Sampaguita St',
      barangay: 'BUCANDALA IV',
      city: 'IMUS',
      province: 'CAVITE',
      country: 'Philippines',
      postalCode: ''
    },
    items: [{ productName: 'KAMALAYAN BLOOM BLACK', size: 'Medium', quantity: 1, unitPriceCents: 74900 }],
    totalCents: 74900,
    paymentMethod: 'gcash',
    notes: ''
  };

  const buffer = writeJntExportBuffer([order]);
  const sheet = XLSX.read(buffer, { type: 'buffer' }).Sheets.List;
  // columns A–M; data starts at row 9: K = parcel value, L = COD amount
  assert.equal(Number(sheet.K9?.v), 749);
  assert.equal(String(sheet.L9?.v), '0');
});
