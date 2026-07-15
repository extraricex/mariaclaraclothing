const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const nodeFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ADMIN_TOKEN = 'local-admin-token';
const ORDER_ITEM = {
  productId: 'catalog-oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1',
  variantId: 'catalog-oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1-0',
  productName: 'CURIOSITY OFFWHITE — Oversized 240 GSM Shirt',
  size: 'Small',
  quantity: 1,
  unitPriceCents: 64900
};

function createFreshApp() {
  [
    '../src/app',
    '../src/routes/admin',
    '../src/routes/discounts',
    '../src/routes/orders',
    '../src/orders/orderRepository',
    '../src/inventory/inventoryMovementRepository',
    '../src/discounts/discountRepository',
    '../src/products/catalogRepository',
    '../src/promos/promoEngine'
  ].forEach((modulePath) => {
    delete require.cache[require.resolve(modulePath)];
  });
  return require('../src/app').createApp();
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function adminRequest(options = {}) {
  return {
    ...options,
    headers: {
      authorization: `Bearer ${ADMIN_TOKEN}`,
      'content-type': 'application/json',
      ...(options.headers || {})
    }
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

function checkoutPayload(items) {
  return {
    customer: { firstName: 'Full', lastName: 'Flow Customer', fullName: 'Full Flow Customer', phone: '09175550000', email: 'flow@example.com' },
    address: {
      addressLine: '7 Flow Street, BUCANDALA IV, IMUS, CAVITE, Philippines',
      houseAddress: '7 Flow Street',
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

test('promo notification, quote, checkout, and admin order promo data stay connected', async () => {
  const previousProductsFile = process.env.PRODUCTS_DATA_FILE;
  const previousOrdersFile = process.env.ORDERS_DATA_FILE;
  const previousDiscountsFile = process.env.DISCOUNTS_DATA_FILE;
  const previousMovementsFile = process.env.INVENTORY_MOVEMENTS_DATA_FILE;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-flow-'));
  process.env.PRODUCTS_DATA_FILE = path.join(tempDir, 'products.json');
  process.env.ORDERS_DATA_FILE = path.join(tempDir, 'orders.json');
  process.env.DISCOUNTS_DATA_FILE = path.join(tempDir, 'discounts.json');
  process.env.INVENTORY_MOVEMENTS_DATA_FILE = path.join(tempDir, 'inventory-movements.json');
  nodeFs.copyFileSync(path.join(__dirname, '..', 'data', 'products.json'), process.env.PRODUCTS_DATA_FILE);

  const app = createFreshApp();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  try {
    const createPromo = await jsonRequest(port, '/api/admin/discounts', adminRequest({
      method: 'POST',
      body: JSON.stringify({
        code: 'FLOW2026',
        name: 'Full Flow Promo',
        method: 'automatic',
        type: 'buy_more_save_more',
        status: 'active',
        minimumQuantity: 2,
        bannerText: 'Full flow banner',
        terms: 'Buy two items to unlock the flow promo.',
        rules: [
          {
            minimumQuantity: 2,
            discountType: 'fixed',
            discountValueCents: 10000,
            freeShipping: true
          }
        ]
      })
    }));
    assert.equal(createPromo.status, 201);

    const notification = await jsonRequest(port, '/api/discounts/active-notification');
    assert.equal(notification.status, 200);
    assert.equal(notification.body.notification.promoId, 'FLOW2026');
    assert.equal(notification.body.notification.text, 'Full flow banner');

    const items = [{ ...ORDER_ITEM, quantity: 2 }];
    const quote = await jsonRequest(port, '/api/discounts/quote', {
      method: 'POST',
      body: JSON.stringify({ items, shippingFeeCents: 8000 })
    });
    assert.equal(quote.status, 200);
    assert.equal(quote.body.quote.discountCode, 'FLOW2026');
    assert.equal(quote.body.quote.discountTotalCents, 10000);
    assert.equal(quote.body.quote.shippingFeeCents, 0);
    assert.equal(quote.body.quote.discountSnapshot.name, 'Full Flow Promo');

    const orderResponse = await jsonRequest(port, '/api/orders', {
      method: 'POST',
      body: JSON.stringify(checkoutPayload(items))
    });
    assert.equal(orderResponse.status, 201);
    const { orderNumber } = orderResponse.body;

    const confirmation = await jsonRequest(port, `/api/orders/${encodeURIComponent(orderNumber)}`);
    assert.equal(confirmation.status, 200);
    assert.equal(confirmation.body.order.totalCents, 119800);
    assert.equal(confirmation.body.order.discountCode, undefined);
    assert.equal(JSON.stringify(confirmation.body).includes('flow@example.com'), false);

    const adminList = await jsonRequest(port, '/api/admin/orders?q=flow', adminRequest());
    assert.equal(adminList.status, 200);
    assert.equal(adminList.body.orders.length, 1);
    assert.equal(adminList.body.orders[0].orderNumber, orderNumber);
    assert.equal(adminList.body.orders[0].discountCode, 'FLOW2026');
    assert.equal(adminList.body.orders[0].discountSnapshot.name, 'Full Flow Promo');

    const adminDetail = await jsonRequest(port, `/api/admin/orders/${encodeURIComponent(orderNumber)}`, adminRequest());
    assert.equal(adminDetail.status, 200);
    assert.equal(adminDetail.body.order.discountCode, 'FLOW2026');
    assert.equal(adminDetail.body.order.discountSnapshot.freeShippingApplied, true);

    const statusUpdate = await jsonRequest(port, `/api/admin/orders/${encodeURIComponent(orderNumber)}`, adminRequest({
      method: 'PATCH',
      body: JSON.stringify({ status: 'packed' })
    }));
    assert.equal(statusUpdate.status, 200);
    assert.equal(statusUpdate.body.order.status, 'packed');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreEnv('PRODUCTS_DATA_FILE', previousProductsFile);
    restoreEnv('ORDERS_DATA_FILE', previousOrdersFile);
    restoreEnv('DISCOUNTS_DATA_FILE', previousDiscountsFile);
    restoreEnv('INVENTORY_MOVEMENTS_DATA_FILE', previousMovementsFile);
  }
});
