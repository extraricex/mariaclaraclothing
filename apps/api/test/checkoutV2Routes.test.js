const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createCheckoutRouter } = require('../src/routes/checkout');
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
