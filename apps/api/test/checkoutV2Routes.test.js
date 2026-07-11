const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { createCheckoutRouter } = require('../src/routes/checkout');
const { createOrderRouter } = require('../src/routes/orders');
const { errorHandler } = require('../src/app');

function sampleSnapshot({ finalizable = true } = {}) {
  return {
    cartSessionId: 'cart-1',
    requestHash: 'request-secret',
    pricingFingerprint: 'pricing-secret',
    items: [{
      productId: 'catalog-shirt',
      variantId: 'catalog-shirt-0',
      productName: 'Server Shirt',
      unitPriceCents: 64900,
      quantity: 1,
      lineTotalCents: 64900
    }],
    itemCount: 1,
    address: finalizable ? { houseAddress: '12 Test St', province: 'CAVITE' } : null,
    shippingRegion: finalizable ? 'metro_manila_cavite' : '',
    shippingRegionLabel: finalizable ? 'Metro Manila & Cavite' : '',
    shippingFeeCents: finalizable ? 8000 : null,
    shippingStatus: finalizable ? 'ready' : 'pending_address',
    discountCode: '',
    discountSnapshot: { internalRule: true },
    subtotalCents: 64900,
    discountTotalCents: 0,
    totalCents: finalizable ? 72900 : 64900,
    freeShippingUnlocked: false,
    finalizable
  };
}

async function withOrderServer(dependencies, callback) {
  const app = express();
  app.use(express.json());
  app.use('/api/orders', createOrderRouter(dependencies));
  app.use(errorHandler);
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  try {
    await callback(server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function withServer(dependencies, callback) {
  const app = express();
  app.use(express.json());
  app.use('/api/checkout', createCheckoutRouter(dependencies));
  app.use(errorHandler);
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });

  try {
    await callback(server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function storeSettings(methods = [{ id: 'cash_on_delivery', enabled: true }]) {
  return { website: { maintenanceMode: false }, payments: { methods } };
}

function routeDependencies(snapshot, overrides = {}) {
  return {
    hasDatabaseUrl: () => true,
    buildAuthoritativeQuote: async () => snapshot,
    insertCheckoutQuote: async (_client, value, options) => ({
      id: '08f13376-57db-4af3-9a9b-6df79ead727a',
      cartSessionId: value.cartSessionId,
      requestHash: value.requestHash,
      snapshot: value,
      finalizable: value.finalizable,
      expiresAt: '2026-06-29T10:15:00.000Z',
      consumedOrderNumber: ''
    }),
    getPool: () => ({ query: async () => ({ rows: [] }) }),
    quoteTtlMs: 900000,
    ...overrides
  };
}

test('POST /api/checkout/quotes returns server totals without internal quote data', async () => {
  const snapshot = sampleSnapshot();
  let receivedInput;
  let receivedOptions;
  const dependencies = routeDependencies(snapshot, {
    buildAuthoritativeQuote: async (input) => {
      receivedInput = input;
      return snapshot;
    },
    insertCheckoutQuote: async (_client, value, options) => {
      receivedOptions = options;
      return {
        id: '08f13376-57db-4af3-9a9b-6df79ead727a',
        snapshot: value,
        expiresAt: '2026-06-29T10:15:00.000Z'
      };
    }
  });

  await withServer(dependencies, async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/checkout/quotes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        cartSessionId: 'cart-1',
        items: [{
          productId: 'catalog-shirt',
          variantId: 'catalog-shirt-0',
          quantity: 1,
          unitPriceCents: 1
        }],
        address: {
          houseAddress: '12 Test St',
          provinceCode: 'CAVITE',
          cityCode: 'CAVITE|IMUS',
          barangayCode: 'CAVITE|IMUS|BUCANDALA IV'
        }
      })
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(receivedInput.items[0].unitPriceCents, 1);
    assert.equal(receivedOptions.ttlMs, 900000);
    assert.equal(body.quote.id, '08f13376-57db-4af3-9a9b-6df79ead727a');
    assert.equal(body.quote.expiresAt, '2026-06-29T10:15:00.000Z');
    assert.equal(body.quote.shippingRegion, 'metro_manila_cavite');
    assert.equal(body.quote.finalizable, true);
    assert.equal(body.quote.items[0].unitPriceCents, 64900);
    assert.equal(body.quote.totalCents, 72900);
    assert.equal(body.quote.requestHash, undefined);
    assert.equal(body.quote.pricingFingerprint, undefined);
    assert.equal(body.quote.discountSnapshot, undefined);
  });
});

test('POST /api/checkout/quotes exposes a non-final preview quote', async () => {
  const snapshot = sampleSnapshot({ finalizable: false });
  await withServer(routeDependencies(snapshot), async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/checkout/quotes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cartSessionId: 'cart-1', items: [{ productId: 'catalog-shirt' }] })
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.quote.finalizable, false);
    assert.equal(body.quote.shippingFeeCents, null);
    assert.equal(body.quote.shippingStatus, 'pending_address');
  });
});

test('POST /api/checkout/quotes returns 503 when PostgreSQL is unavailable', async () => {
  await withServer(routeDependencies(sampleSnapshot(), {
    hasDatabaseUrl: () => false
  }), async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/checkout/quotes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    });
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(body.code, 'checkout_v2_unavailable');
  });
});

test('V2 order ignores client money and forwards the idempotency key', async () => {
  let input;
  const calls = [];
  await withOrderServer({
    getStoreSettings: async () => storeSettings(),
    resolveCustomerAccountId: async () => '',
    placeAuthoritativeCheckout: async (value) => {
      input = value;
      return { orderNumber: 'MCC-1', totalCents: 72900, confirmationToken: 'secret' };
    },
    exportPancakeOrderNow: async (orderNumber) => calls.push(['pancake', orderNumber]),
    authoritativeDependencies: () => ({})
  }, async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': 'idem-1234567890123456' },
      body: JSON.stringify({
        quoteId: 'quote-1', cartSessionId: 'cart-1', totalCents: 1,
        customer: { fullName: 'Maria Test', phone: '09171234567' },
        paymentMethod: 'cash_on_delivery'
      })
    });
    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.totalCents, 72900);
    assert.equal(body.confirmationToken, 'secret');
    assert.equal(input.idempotencyKey, 'idem-1234567890123456');
    assert.deepEqual(calls, [['pancake', 'MCC-1']]);
  });
});

test('V2 order rejects a payment method that is not enabled in server settings', async () => {
  let checkoutCalled = false;
  await withOrderServer({
    getStoreSettings: async () => storeSettings(),
    resolveCustomerAccountId: async () => '',
    placeAuthoritativeCheckout: async () => {
      checkoutCalled = true;
      return { orderNumber: 'MCC-1' };
    },
    authoritativeDependencies: () => ({})
  }, async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': 'idem-1234567890123456' },
      body: JSON.stringify({
        quoteId: 'quote-1', cartSessionId: 'cart-1',
        customer: { fullName: 'Maria Test', phone: '09171234567' },
        paymentMethod: 'gcash'
      })
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.code, 'payment_method_unavailable');
    assert.equal(checkoutCalled, false);
  });
});

test('V2 order accepts a non-COD payment method only when server settings enable it', async () => {
  let checkoutInput;
  await withOrderServer({
    getStoreSettings: async () => storeSettings([
      { id: 'cash_on_delivery', enabled: true },
      { id: 'gcash', enabled: true }
    ]),
    resolveCustomerAccountId: async () => '',
    placeAuthoritativeCheckout: async (input) => {
      checkoutInput = input;
      return { orderNumber: 'MCC-2', totalCents: 72900 };
    },
    exportPancakeOrderNow: async () => {},
    authoritativeDependencies: () => ({})
  }, async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': 'idem-1234567890123456' },
      body: JSON.stringify({
        quoteId: 'quote-1', cartSessionId: 'cart-1',
        customer: { fullName: 'Maria Test', phone: '09171234567' },
        paymentMethod: 'gcash'
      })
    });

    assert.equal(response.status, 201);
    assert.equal(checkoutInput.paymentMethod, 'gcash');
  });
});

test('V2 order still succeeds when realtime Pancake export fails', async () => {
  await withOrderServer({
    getStoreSettings: async () => storeSettings(),
    resolveCustomerAccountId: async () => '',
    placeAuthoritativeCheckout: async () => ({ orderNumber: 'MCC-2', totalCents: 72900 }),
    exportPancakeOrderNow: async () => { throw new Error('Pancake unavailable'); },
    authoritativeDependencies: () => ({}),
    logger: { error: () => {} }
  }, async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': 'idem-1234567890123456' },
      body: JSON.stringify({
        quoteId: 'quote-1', cartSessionId: 'cart-1',
        customer: { fullName: 'Maria Test', phone: '09171234567' },
        paymentMethod: 'cash_on_delivery'
      })
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.orderNumber, 'MCC-2');
  });
});

test('legacy order path queues and attempts realtime Pancake export', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'orders.js'), 'utf8');

  assert.match(source, /await enqueueOrderExport\(persistedOrder\)/);
  assert.match(source, /req\.exportPancakeOrderNow = dependencies\.exportPancakeOrderNow/);
  assert.match(source, /await \(req\.exportPancakeOrderNow \|\| exportPancakeOrderNow\)\(completedOrder\.orderNumber\)/);
});

test('public lookup returns no PII and private confirmation requires its header token', async () => {
  const order = {
    orderNumber: 'MCC-1',
    customer: { fullName: 'Maria Test', phone: '09171234567' },
    address: { addressLine: '12 Test St' },
    items: [{ productName: 'Server Shirt', quantity: 1 }],
    subtotalCents: 64900,
    discountTotalCents: 0,
    shippingFeeCents: 8000,
    totalCents: 72900,
    paymentMethod: 'cash_on_delivery',
    confirmationTokenHash: 'stored-hash',
    placedAt: '2026-06-29T00:00:00.000Z',
    status: 'received', fulfillmentStatus: 'unfulfilled', paymentStatus: 'cod_pending'
  };
  await withOrderServer({
    findOrderByNumber: async () => order,
    verifyConfirmationToken: (token, hash) => token === 'right-token' && hash === 'stored-hash'
  }, async (port) => {
    const publicResponse = await fetch(`http://127.0.0.1:${port}/api/orders/MCC-1`);
    const publicBody = await publicResponse.json();
    assert.deepEqual(Object.keys(publicBody.order).sort(), [
      'fulfillmentStatus', 'orderNumber', 'paymentStatus', 'placedAt', 'status', 'totalCents'
    ]);
    assert.equal(JSON.stringify(publicBody).includes('0917'), false);

    for (const token of ['', 'wrong']) {
      const denied = await fetch(`http://127.0.0.1:${port}/api/orders/MCC-1/confirmation`, {
        headers: token ? { 'X-Order-Confirmation': token } : {}
      });
      const deniedBody = await denied.json();
      assert.equal(denied.status, 404);
      assert.equal(deniedBody.code, 'confirmation_not_found');
    }

    const allowed = await fetch(`http://127.0.0.1:${port}/api/orders/MCC-1/confirmation`, {
      headers: { 'X-Order-Confirmation': 'right-token' }
    });
    const allowedBody = await allowed.json();
    assert.equal(allowed.status, 200);
    assert.equal(allowedBody.order.customerFirstName, 'Maria');
    assert.equal(allowedBody.order.paymentMethodLabel, 'Cash on Delivery');
    assert.equal(allowedBody.order.totalCents, 72900);
  });
});
