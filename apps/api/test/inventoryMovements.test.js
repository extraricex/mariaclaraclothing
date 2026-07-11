const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const nodeFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ORDER_ITEM = {
  productId: 'catalog-oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1',
  variantId: 'catalog-oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1-0',
  productName: 'CURIOSITY OFFWHITE — Oversized 240 GSM Shirt',
  size: 'Small',
  quantity: 2,
  unitPriceCents: 64900
};

test('successful order creation records inventory movement deductions', async () => {
  const previousProductsFile = process.env.PRODUCTS_DATA_FILE;
  const previousOrdersFile = process.env.ORDERS_DATA_FILE;
  const previousMovementsFile = process.env.INVENTORY_MOVEMENTS_DATA_FILE;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-inventory-movements-'));

  process.env.PRODUCTS_DATA_FILE = path.join(tempDir, 'products.json');
  process.env.ORDERS_DATA_FILE = path.join(tempDir, 'orders.json');
  process.env.INVENTORY_MOVEMENTS_DATA_FILE = path.join(tempDir, 'inventory-movements.json');
  nodeFs.copyFileSync(path.join(__dirname, '..', 'data', 'products.json'), process.env.PRODUCTS_DATA_FILE);

  const app = createFreshApp();
  const { listInventoryMovements } = require('../src/inventory/inventoryMovementRepository');
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  try {
    const orderResponse = await jsonRequest(port, '/api/orders', {
      method: 'POST',
      body: JSON.stringify(checkoutPayload([ORDER_ITEM]))
    });

    assert.equal(orderResponse.status, 201);
    const movements = await listInventoryMovements({ orderNumber: orderResponse.body.orderNumber });

    assert.equal(movements.length, 1);
    assert.equal(movements[0].orderNumber, orderResponse.body.orderNumber);
    assert.equal(movements[0].source, 'order');
    assert.equal(movements[0].reason, 'order_created');
    assert.equal(movements[0].productSlug, 'oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1');
    assert.equal(movements[0].productName, 'CURIOSITY OFFWHITE — Oversized 240 GSM Shirt');
    assert.equal(movements[0].sku, 'ARISOFF-S');
    assert.equal(movements[0].size, 's');
    assert.equal(movements[0].quantityChange, -2);
    assert.match(movements[0].createdAt, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreEnv('PRODUCTS_DATA_FILE', previousProductsFile);
    restoreEnv('ORDERS_DATA_FILE', previousOrdersFile);
    restoreEnv('INVENTORY_MOVEMENTS_DATA_FILE', previousMovementsFile);
  }
});

test('failed checkout does not record inventory movements', async () => {
  const previousProductsFile = process.env.PRODUCTS_DATA_FILE;
  const previousOrdersFile = process.env.ORDERS_DATA_FILE;
  const previousMovementsFile = process.env.INVENTORY_MOVEMENTS_DATA_FILE;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-inventory-failed-'));

  process.env.PRODUCTS_DATA_FILE = path.join(tempDir, 'products.json');
  process.env.ORDERS_DATA_FILE = path.join(tempDir, 'orders.json');
  process.env.INVENTORY_MOVEMENTS_DATA_FILE = path.join(tempDir, 'inventory-movements.json');
  nodeFs.copyFileSync(path.join(__dirname, '..', 'data', 'products.json'), process.env.PRODUCTS_DATA_FILE);

  const app = createFreshApp();
  const { listInventoryMovements } = require('../src/inventory/inventoryMovementRepository');
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  try {
    const orderResponse = await jsonRequest(port, '/api/orders', {
      method: 'POST',
      body: JSON.stringify(checkoutPayload([]))
    });

    assert.equal(orderResponse.status, 400);
    assert.deepEqual(await listInventoryMovements(), []);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreEnv('PRODUCTS_DATA_FILE', previousProductsFile);
    restoreEnv('ORDERS_DATA_FILE', previousOrdersFile);
    restoreEnv('INVENTORY_MOVEMENTS_DATA_FILE', previousMovementsFile);
  }
});

test('inventory movement queries accept Pancake reconciliation reason', async () => {
  const previousMovementsFile = process.env.INVENTORY_MOVEMENTS_DATA_FILE;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-pancake-movement-'));
  process.env.INVENTORY_MOVEMENTS_DATA_FILE = path.join(tempDir, 'inventory-movements.json');

  try {
    const { appendInventoryMovements, queryInventoryMovements } = freshInventoryRepository();
    await appendInventoryMovements({
      id: 'pancake-move-1',
      source: 'pancake',
      reason: 'pancake_reconcile',
      productSlug: 'shirt',
      productName: 'Shirt',
      sku: 'SKU-1',
      size: 'M',
      quantityChange: 3,
      createdAt: '2026-07-07T00:00:00.000Z'
    });

    const result = await queryInventoryMovements({ reason: 'pancake_reconcile' }, {
      now: new Date('2026-07-07T00:00:00.000Z')
    });

    assert.equal(result.summary.totalMovements, 1);
    assert.equal(result.movements[0].source, 'pancake');
    assert.equal(result.movements[0].reason, 'pancake_reconcile');
  } finally {
    restoreEnv('INVENTORY_MOVEMENTS_DATA_FILE', previousMovementsFile);
  }
});

function createFreshApp() {
  [
    '../src/app',
    '../src/routes/orders',
    '../src/orders/orderRepository',
    '../src/products/catalogRepository',
    '../src/inventory/inventoryMovementRepository'
  ].forEach((modulePath) => {
    try {
      delete require.cache[require.resolve(modulePath)];
    } catch (_error) {
      // Module may not exist before the implementation step.
    }
  });
  return require('../src/app').createApp();
}

function freshInventoryRepository() {
  delete require.cache[require.resolve('../src/inventory/inventoryMovementRepository')];
  return require('../src/inventory/inventoryMovementRepository');
}

function checkoutPayload(items) {
  return {
    customer: { fullName: 'Inventory Customer', phone: '09176660000', email: 'inventory@example.com' },
    address: {
      addressLine: '9 Inventory Street, BUCANDALA IV, IMUS, CAVITE, Philippines',
      houseAddress: '9 Inventory Street',
      barangay: 'BUCANDALA IV',
      city: 'IMUS',
      province: 'CAVITE',
      country: 'Philippines',
      postalCode: ''
    },
    shippingFeeCents: 8000,
    checkoutChannel: 'storefront_checkout',
    paymentMethod: 'cash_on_delivery',
    shippingRegion: 'metro_manila_cavite',
    shippingRegionLabel: 'Metro Manila & Cavite Region',
    freeShippingUnlocked: false,
    discountTotalCents: 0,
    items
  };
}

function jsonRequest(port, pathname, options = {}) {
  return fetch(`http://127.0.0.1:${port}${pathname}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  }).then(async (response) => ({
    status: response.status,
    body: await response.json()
  }));
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
