const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../src/app');

test.beforeEach(async () => {
  process.env.ORDERS_DATA_FILE = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-orders-')), 'orders.json');
});

test.afterEach(() => {
  delete process.env.ORDERS_DATA_FILE;
});

test('GET /api/health returns ok status', async () => {
  const app = createApp();
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, { ok: true, service: 'maria-clara-clothing' });
  } finally {
    server.close();
  }
});

test('GET /collections/all serves the storefront collection page', async () => {
  const app = createApp();
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/collections/all`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', /text\/html/);
    assert.match(html, /id="new-arrivals"/);
    assert.match(html, /Maria Clara/);
  } finally {
    server.close();
  }
});

test('storefront APIs run from in-project catalog only', async () => {
  const app = createApp();
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  const { port } = server.address();

  try {
    const productsResponse = await fetch(`http://127.0.0.1:${port}/api/products`);
    const productsBody = await productsResponse.json();
    const orderResponse = await fetch(`http://127.0.0.1:${port}/api/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        customer: { fullName: 'Test Customer', phone: '09171234567', email: '' },
        address: {
          addressLine: '313 Pagasa Subdivision, Bucandala IV, Imus City, Cavite, Philippines',
          houseAddress: '313 Pagasa Subdivision',
          barangay: 'Bucandala IV',
          city: 'Imus City',
          province: 'Cavite',
          country: 'Philippines',
          postalCode: ''
        },
        shippingFeeCents: 0,
        checkoutChannel: 'storefront_checkout',
        paymentMethod: 'cash_on_delivery',
        shippingRegion: 'metro_manila_cavite',
        shippingRegionLabel: 'Metro Manila & Cavite Region',
        freeShippingUnlocked: true,
        discountTotalCents: 0,
        items: [{
          productId: 'catalog-oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1',
          variantId: 'catalog-oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1-0',
          productName: 'CURIOSITY OFFWHITE — Oversized 240 GSM Shirt',
          size: 'Small',
          quantity: 1,
          unitPriceCents: 64900
        }]
      })
    });
    const orderBody = await orderResponse.json();

    assert.equal(productsResponse.status, 200);
    assert.equal(productsBody.products.length, 15);
    assert.equal(productsBody.source, 'catalog');
    assert.equal(orderResponse.status, 201);
    assert.match(orderBody.orderNumber, /^DEMO-/);
    assert.equal(orderBody.syncStatus, 'frontend_only');
    assert.equal(orderBody.checkoutChannel, 'storefront_checkout');
    assert.equal(orderBody.paymentMethod, 'cash_on_delivery');
    assert.equal(orderBody.shippingRegion, 'metro_manila_cavite');
    assert.equal(orderBody.freeShippingUnlocked, true);
    assert.equal(orderBody.status, 'received');
    assert.equal(orderBody.fulfillmentStatus, 'unfulfilled');
    assert.equal(orderBody.paymentStatus, 'cod_pending');

    const confirmationResponse = await fetch(`http://127.0.0.1:${port}/api/orders/${encodeURIComponent(orderBody.orderNumber)}`);
    const confirmationBody = await confirmationResponse.json();

    assert.equal(confirmationResponse.status, 200);
    assert.equal(confirmationBody.order.orderNumber, orderBody.orderNumber);
    assert.equal(confirmationBody.order.customerName, 'Test Customer');
    assert.equal(confirmationBody.order.paymentMethod, 'Cash on Delivery');
    assert.equal(confirmationBody.order.shippingRegionLabel, 'Metro Manila & Cavite Region');
    assert.equal(confirmationBody.order.shippingFeeCents, 0);
    assert.equal(confirmationBody.order.totalCents, 64900);
  } finally {
    server.close();
  }
});

test('orders reject sold out product variants from the shared catalog', async () => {
  const app = createApp();
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        customer: { fullName: 'Test Customer', phone: '09171234567', email: '' },
        address: {
          addressLine: '313 Pagasa Subdivision, Bucandala IV, Imus City, Cavite, Philippines',
          houseAddress: '313 Pagasa Subdivision',
          barangay: 'Bucandala IV',
          city: 'Imus City',
          province: 'Cavite',
          country: 'Philippines',
          postalCode: ''
        },
        shippingFeeCents: 0,
        discountTotalCents: 0,
        items: [{
          productId: 'catalog-oranges-mcc-box-tee',
          variantId: 'catalog-oranges-mcc-box-tee-0',
          productName: 'MARIACLARA ORANGE — CROP BOX 240 GSM Shirt',
          size: 'Small',
          quantity: 1,
          unitPriceCents: 64900
        }]
      })
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error, 's is sold out for MARIACLARA ORANGE — CROP BOX 240 GSM Shirt');
  } finally {
    server.close();
  }
});

test('orders reject incomplete structured shipping addresses', async () => {
  const app = createApp();
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        customer: { fullName: 'Test Customer', phone: '09171234567', email: '' },
        address: {
          addressLine: '313 Pagasa Subdivision, Imus City, Cavite, Philippines',
          houseAddress: '313 Pagasa Subdivision',
          barangay: '',
          city: 'Imus City',
          province: 'Cavite',
          country: 'Philippines'
        },
        shippingFeeCents: 8000,
        discountTotalCents: 0,
        items: [{
          productId: 'catalog-oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1',
          variantId: 'catalog-oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1-0',
          productName: 'CURIOSITY OFFWHITE — Oversized 240 GSM Shirt',
          size: 'Small',
          quantity: 1,
          unitPriceCents: 64900
        }]
      })
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error, 'House address, barangay, city/municipality, and province are required');
  } finally {
    server.close();
  }
});

test('orders persist after app restart and remain fetchable by order number', async () => {
  const ordersDataFile = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-orders-')), 'orders.json');
  process.env.ORDERS_DATA_FILE = ordersDataFile;

  const firstApp = createFreshApp();
  const firstServer = await new Promise((resolve, reject) => {
    const listener = firstApp.listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  const firstPort = firstServer.address().port;

  let orderNumber;
  try {
    const response = await fetch(`http://127.0.0.1:${firstPort}/api/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        customer: { fullName: 'Persistent Customer', phone: '09170000000', email: '' },
        address: {
          addressLine: '44 Sample Street, Bucandala IV, Imus City, Cavite, Philippines',
          houseAddress: '44 Sample Street',
          barangay: 'Bucandala IV',
          city: 'Imus City',
          province: 'Cavite',
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
        items: [{
          productId: 'catalog-oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1',
          variantId: 'catalog-oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1-0',
          productName: 'CURIOSITY OFFWHITE — Oversized 240 GSM Shirt',
          size: 'Small',
          quantity: 1,
          unitPriceCents: 64900
        }]
      })
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    orderNumber = body.orderNumber;
  } finally {
    await new Promise((resolve) => firstServer.close(resolve));
  }

  const secondApp = createFreshApp();
  const secondServer = await new Promise((resolve, reject) => {
    const listener = secondApp.listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  const secondPort = secondServer.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${secondPort}/api/orders/${encodeURIComponent(orderNumber)}`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.order.orderNumber, orderNumber);
    assert.equal(body.order.customerName, 'Persistent Customer');
    assert.equal(body.order.shippingFeeCents, 8000);
    assert.equal(body.order.totalCents, 72900);
  } finally {
    await new Promise((resolve) => secondServer.close(resolve));
    delete process.env.ORDERS_DATA_FILE;
  }
});

function createFreshApp() {
  delete require.cache[require.resolve('../src/app')];
  delete require.cache[require.resolve('../src/routes/orders')];
  return require('../src/app').createApp();
}
