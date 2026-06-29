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

const ORDER_ITEM = {
  productId: 'catalog-oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1',
  variantId: 'catalog-oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1-0',
  productName: 'CURIOSITY OFFWHITE — Oversized 240 GSM Shirt',
  size: 'Small',
  quantity: 1,
  unitPriceCents: 64900
};

test('admin cart sessions list anonymous drafts and abandoned checkout sessions, then hide converted sessions', async () => {
  const previousOrdersDataFile = process.env.ORDERS_DATA_FILE;
  const previousCartSessionsDataFile = process.env.CART_SESSIONS_DATA_FILE;
  process.env.ORDERS_DATA_FILE = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'mcc-cart-orders-')), 'orders.json');
  process.env.CART_SESSIONS_DATA_FILE = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'mcc-cart-sessions-')), 'cart-sessions.json');

  const app = createFreshApp();
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  const { port } = server.address();

  try {
    const draftResponse = await fetch(`http://127.0.0.1:${port}/api/cart-sessions/browser-draft`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: [ORDER_ITEM] })
    });
    const draftBody = await draftResponse.json();

    assert.equal(draftResponse.status, 200);
    assert.equal(draftBody.session.customerName, 'Anonymous');
    assert.equal(draftBody.session.status, 'draft');

    const abandonedResponse = await fetch(`http://127.0.0.1:${port}/api/cart-sessions/browser-checkout`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        checkoutStarted: true,
        customer: { fullName: 'Abandoned Customer', phone: '09171234567', email: 'buyer@example.com' },
        address: { addressLine: '1 Checkout St, Imus, Cavite' },
        items: [ORDER_ITEM]
      })
    });
    const abandonedBody = await abandonedResponse.json();

    assert.equal(abandonedResponse.status, 200);
    assert.equal(abandonedBody.session.customerName, 'Abandoned Customer');
    assert.equal(abandonedBody.session.status, 'abandoned_checkout');

    const draftsResponse = await fetch(`http://127.0.0.1:${port}/api/admin/cart-sessions?status=draft`, adminRequest());
    const draftsBody = await draftsResponse.json();

    assert.equal(draftsResponse.status, 200);
    assert.deepEqual(draftsBody.sessions.map((session) => session.sessionId), ['browser-draft']);
    assert.equal(draftsBody.sessions[0].itemCount, 1);
    assert.equal(draftsBody.sessions[0].subtotalCents, 64900);

    const deleteDraftResponse = await fetch(
      `http://127.0.0.1:${port}/api/admin/cart-sessions/browser-draft`,
      adminRequest({ method: 'DELETE' })
    );
    assert.equal(deleteDraftResponse.status, 200);
    assert.deepEqual(await deleteDraftResponse.json(), {
      deleted: { sessionId: 'browser-draft', status: 'draft' }
    });

    const abandonedListResponse = await fetch(`http://127.0.0.1:${port}/api/admin/cart-sessions?status=abandoned_checkout`, adminRequest());
    const abandonedListBody = await abandonedListResponse.json();

    assert.equal(abandonedListResponse.status, 200);
    assert.deepEqual(abandonedListBody.sessions.map((session) => session.sessionId), ['browser-checkout']);
    assert.equal(abandonedListBody.sessions[0].phone, '09171234567');

    const orderResponse = await fetch(`http://127.0.0.1:${port}/api/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        cartSessionId: 'browser-checkout',
        customer: { fullName: 'Abandoned Customer', phone: '09171234567', email: 'buyer@example.com' },
        address: {
          addressLine: '1 Checkout St, BUCANDALA IV, IMUS, CAVITE, Philippines',
          houseAddress: '1 Checkout St',
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
        items: [ORDER_ITEM]
      })
    });

    assert.equal(orderResponse.status, 201);

    const clearCartResponse = await fetch(`http://127.0.0.1:${port}/api/cart-sessions/browser-checkout`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: [] })
    });

    assert.equal(clearCartResponse.status, 200);

    const cartSessionStore = JSON.parse(await fs.readFile(process.env.CART_SESSIONS_DATA_FILE, 'utf8'));
    const convertedSession = cartSessionStore.sessions.find((session) => session.sessionId === 'browser-checkout');
    assert.equal(convertedSession.status, 'converted');
    assert.ok(convertedSession.convertedOrderNumber);

    const deleteConvertedResponse = await fetch(
      `http://127.0.0.1:${port}/api/admin/cart-sessions/browser-checkout`,
      adminRequest({ method: 'DELETE' })
    );
    assert.equal(deleteConvertedResponse.status, 409);

    const abandonedAfterOrderResponse = await fetch(`http://127.0.0.1:${port}/api/admin/cart-sessions?status=abandoned_checkout`, adminRequest());
    const abandonedAfterOrderBody = await abandonedAfterOrderResponse.json();

    assert.equal(abandonedAfterOrderResponse.status, 200);
    assert.deepEqual(abandonedAfterOrderBody.sessions, []);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreEnv('ORDERS_DATA_FILE', previousOrdersDataFile);
    restoreEnv('CART_SESSIONS_DATA_FILE', previousCartSessionsDataFile);
  }
});

function adminRequest(options = {}) {
  return {
    ...options,
    headers: {
      ...options.headers,
      authorization: 'Bearer local-admin-token'
    }
  };
}

function createFreshApp() {
  delete require.cache[require.resolve('../src/app')];
  delete require.cache[require.resolve('../src/routes/admin')];
  delete require.cache[require.resolve('../src/routes/orders')];
  delete require.cache[require.resolve('../src/routes/cartSessions')];
  delete require.cache[require.resolve('../src/cartSessions/cartSessionRepository')];
  delete require.cache[require.resolve('../src/orders/orderRepository')];
  return require('../src/app').createApp();
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
