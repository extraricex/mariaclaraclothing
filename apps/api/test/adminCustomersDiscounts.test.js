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
  delete require.cache[require.resolve('../src/routes/discounts')];
  delete require.cache[require.resolve('../src/orders/orderRepository')];
  delete require.cache[require.resolve('../src/discounts/discountRepository')];
  delete require.cache[require.resolve('../src/customers/customerAggregator')];
  try {
    delete require.cache[require.resolve('../src/promos/promoEngine')];
  } catch (_error) {
    // The promo engine is created by the Phase 1 implementation.
  }
  return require('../src/app').createApp();
}

function adminRequest(port, pathname, options = {}) {
  return fetch(`http://127.0.0.1:${port}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${ADMIN_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
}

const ORDER_ITEM = {
  productId: 'catalog-oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1',
  variantId: 'catalog-oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1-0',
  productName: 'CURIOSITY OFFWHITE — Oversized 240 GSM Shirt',
  size: 'Small',
  quantity: 1,
  unitPriceCents: 64900
};

function checkoutPayload(overrides = {}) {
  return {
    customer: { fullName: 'Juan Dela Cruz', phone: '09171234567', email: '' },
    address: {
      addressLine: '12 Test St, BUCANDALA IV, IMUS, CAVITE, Philippines',
      houseAddress: '12 Test St',
      barangay: 'BUCANDALA IV',
      city: 'IMUS',
      province: 'CAVITE',
      country: 'Philippines',
      postalCode: ''
    },
    shippingFeeCents: 8000,
    items: [ORDER_ITEM],
    ...overrides
  };
}

test('discounts: admin CRUD, public validation, checkout application and usage count', async () => {
  const previousOrdersFile = process.env.ORDERS_DATA_FILE;
  const previousDiscountsFile = process.env.DISCOUNTS_DATA_FILE;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-discounts-'));
  process.env.ORDERS_DATA_FILE = path.join(tempDir, 'orders.json');
  process.env.DISCOUNTS_DATA_FILE = path.join(tempDir, 'discounts.json');

  const app = createFreshApp();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  try {
    const unauthorized = await fetch(`http://127.0.0.1:${port}/api/admin/discounts`);
    assert.equal(unauthorized.status, 401);

    const createResponse = await adminRequest(port, '/api/admin/discounts', {
      method: 'POST',
      body: JSON.stringify({ code: 'maria10', type: 'percentage', value: 10, usageLimit: 2 })
    });
    assert.equal(createResponse.status, 201);
    const { discount } = await createResponse.json();
    assert.equal(discount.code, 'MARIA10');
    assert.equal(discount.usageCount, 0);

    const duplicateResponse = await adminRequest(port, '/api/admin/discounts', {
      method: 'POST',
      body: JSON.stringify({ code: 'MARIA10', type: 'percentage', value: 10 })
    });
    assert.equal(duplicateResponse.status, 400);
    assert.deepEqual(await duplicateResponse.json(), { error: 'Discount code already exists' });

    const validateResponse = await fetch(`http://127.0.0.1:${port}/api/discounts/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'maria10', subtotalCents: 64900 })
    });
    assert.equal(validateResponse.status, 200);
    const validated = await validateResponse.json();
    assert.equal(validated.discount.discountTotalCents, 6490);

    const invalidValidate = await fetch(`http://127.0.0.1:${port}/api/discounts/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'NOPE', subtotalCents: 64900 })
    });
    assert.equal(invalidValidate.status, 400);
    assert.deepEqual(await invalidValidate.json(), { error: 'Discount code is invalid' });

    const orderResponse = await fetch(`http://127.0.0.1:${port}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(checkoutPayload({ discountCode: 'MARIA10' }))
    });
    assert.equal(orderResponse.status, 201);
    const { orderNumber } = await orderResponse.json();

    const detail = await adminRequest(port, `/api/admin/orders/${orderNumber}`).then((r) => r.json());
    assert.equal(detail.order.discountCode, 'MARIA10');
    assert.equal(detail.order.discountTotalCents, 6490);
    assert.equal(detail.order.totalCents, 64900 - 6490 + 8000);

    const listAfterUse = await adminRequest(port, '/api/admin/discounts').then((r) => r.json());
    assert.equal(listAfterUse.discounts[0].usageCount, 1);

    const disableResponse = await adminRequest(port, '/api/admin/discounts/MARIA10', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'disabled' })
    });
    assert.equal(disableResponse.status, 200);

    const disabledOrder = await fetch(`http://127.0.0.1:${port}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(checkoutPayload({ discountCode: 'MARIA10' }))
    });
    assert.equal(disabledOrder.status, 400);
    assert.deepEqual(await disabledOrder.json(), { error: 'Discount code is invalid' });

    const deleteResponse = await adminRequest(port, '/api/admin/discounts/MARIA10', { method: 'DELETE' });
    assert.equal(deleteResponse.status, 200);
    const emptyList = await adminRequest(port, '/api/admin/discounts').then((r) => r.json());
    assert.equal(emptyList.discounts.length, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreEnv('ORDERS_DATA_FILE', previousOrdersFile);
    restoreEnv('DISCOUNTS_DATA_FILE', previousDiscountsFile);
  }
});

test('promos: quote and checkout apply automatic buy more save more snapshots', async () => {
  const previousOrdersFile = process.env.ORDERS_DATA_FILE;
  const previousDiscountsFile = process.env.DISCOUNTS_DATA_FILE;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-promos-'));
  process.env.ORDERS_DATA_FILE = path.join(tempDir, 'orders.json');
  process.env.DISCOUNTS_DATA_FILE = path.join(tempDir, 'discounts.json');

  const app = createFreshApp();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  const promoItems = [{ ...ORDER_ITEM, quantity: 2 }];

  try {
    const createResponse = await adminRequest(port, '/api/admin/discounts', {
      method: 'POST',
      body: JSON.stringify({
        code: 'BMSM2026',
        name: 'Buy More Save More Promo',
        description: 'Save more when buying multiple items.',
        method: 'automatic',
        type: 'buy_more_save_more',
        status: 'active',
        minimumQuantity: 2,
        bannerText: 'Buy More Save More Promo',
        terms: 'Buy at least 2 items to save ₱100 and unlock free shipping.',
        rules: [
          {
            minimumQuantity: 2,
            discountType: 'fixed',
            discountValueCents: 10000,
            freeShipping: true
          }
        ]
      })
    });
    assert.equal(createResponse.status, 201);

    const quoteResponse = await fetch(`http://127.0.0.1:${port}/api/discounts/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: promoItems, shippingFeeCents: 8000 })
    });
    assert.equal(quoteResponse.status, 200);
    const { quote } = await quoteResponse.json();
    assert.equal(quote.subtotalCents, 129800);
    assert.equal(quote.discountTotalCents, 10000);
    assert.equal(quote.shippingFeeCents, 0);
    assert.equal(quote.freeShippingUnlocked, true);
    assert.equal(quote.totalCents, 119800);
    assert.equal(quote.discountSnapshot.name, 'Buy More Save More Promo');
    assert.equal(quote.discountSnapshot.type, 'buy_more_save_more');
    assert.equal(quote.discountSnapshot.discountAmountCents, 10000);
    assert.equal(quote.discountSnapshot.freeShippingApplied, true);

    const orderResponse = await fetch(`http://127.0.0.1:${port}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(checkoutPayload({
        items: promoItems,
        shippingFeeCents: 8000,
        freeShippingUnlocked: false,
        discountTotalCents: 0
      }))
    });
    assert.equal(orderResponse.status, 201);
    const { orderNumber } = await orderResponse.json();

    const detail = await adminRequest(port, `/api/admin/orders/${orderNumber}`).then((r) => r.json());
    assert.equal(detail.order.discountCode, 'BMSM2026');
    assert.equal(detail.order.discountTotalCents, 10000);
    assert.equal(detail.order.shippingFeeCents, 0);
    assert.equal(detail.order.freeShippingUnlocked, true);
    assert.equal(detail.order.totalCents, 119800);
    assert.equal(detail.order.discountSnapshot.name, 'Buy More Save More Promo');
    assert.equal(detail.order.discountSnapshot.type, 'buy_more_save_more');
    assert.equal(detail.order.discountSnapshot.freeShippingApplied, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreEnv('ORDERS_DATA_FILE', previousOrdersFile);
    restoreEnv('DISCOUNTS_DATA_FILE', previousDiscountsFile);
  }
});

test('customers: aggregates orders by phone with COD trust counts', async () => {
  const previousOrdersFile = process.env.ORDERS_DATA_FILE;
  const previousDiscountsFile = process.env.DISCOUNTS_DATA_FILE;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-customers-'));
  process.env.ORDERS_DATA_FILE = path.join(tempDir, 'orders.json');
  process.env.DISCOUNTS_DATA_FILE = path.join(tempDir, 'discounts.json');

  const app = createFreshApp();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  try {
    const unauthorized = await fetch(`http://127.0.0.1:${port}/api/admin/customers`);
    assert.equal(unauthorized.status, 401);

    const firstOrder = await fetch(`http://127.0.0.1:${port}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(checkoutPayload())
    }).then((r) => r.json());

    await fetch(`http://127.0.0.1:${port}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(checkoutPayload({ customer: { fullName: 'Juan Dela Cruz', phone: '+639171234567', email: 'juan@example.com' } }))
    });

    await adminRequest(port, `/api/admin/orders/${firstOrder.orderNumber}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'delivered' })
    });

    const { customers } = await adminRequest(port, '/api/admin/customers').then((r) => r.json());
    assert.equal(customers.length, 1);
    assert.equal(customers[0].phone, '+639171234567');
    assert.equal(customers[0].ordersCount, 2);
    assert.equal(customers[0].deliveredCount, 1);
    assert.equal(customers[0].cancelledCount, 0);
    assert.equal(customers[0].email, 'juan@example.com');
    assert.equal(customers[0].totalSpentCents, (64900 + 8000) * 2);

    const detail = await adminRequest(port, '/api/admin/customers/09171234567').then((r) => r.json());
    assert.equal(detail.customer.ordersCount, 2);
    assert.equal(detail.orders.length, 2);

    const missing = await adminRequest(port, '/api/admin/customers/09990000000');
    assert.equal(missing.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreEnv('ORDERS_DATA_FILE', previousOrdersFile);
    restoreEnv('DISCOUNTS_DATA_FILE', previousDiscountsFile);
  }
});
