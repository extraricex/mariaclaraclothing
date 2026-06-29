const test = require('node:test');
const assert = require('node:assert/strict');
const {
  claimIdempotency,
  completeIdempotency,
  hashIdempotencyKey
} = require('../src/checkout/checkoutIdempotencyRepository');
const { placeAuthoritativeCheckout } = require('../src/checkout/authoritativeCheckoutService');

function requestFixture(overrides = {}) {
  return {
    quoteId: 'quote-1',
    cartSessionId: 'cart-1',
    idempotencyKey: 'idem-1234567890123456',
    customer: { fullName: 'Maria Test', phone: '09171234567', email: '' },
    paymentMethod: 'cash_on_delivery',
    notes: '',
    requestContext: {},
    ...overrides
  };
}

function storedResponse() {
  return { orderNumber: 'MCC-1', totalCents: 72900, currency: 'PHP', items: [] };
}

function createDependencies({ idempotency, quoteOverrides, refreshOverrides } = {}) {
  const calls = [];
  const quote = {
    id: 'quote-1',
    cartSessionId: 'cart-1',
    finalizable: true,
    expiresAt: '2026-06-28T04:15:00.000Z',
    consumedOrderNumber: '',
    snapshot: {
      cartSessionId: 'cart-1',
      pricingFingerprint: 'price-hash',
      discountCode: 'SAVE',
      discountSnapshot: { code: 'SAVE' },
      subtotalCents: 64900,
      discountTotalCents: 0,
      shippingFeeCents: 8000,
      shippingRegion: 'metro_manila_cavite',
      shippingRegionLabel: 'Metro Manila & Cavite',
      shippingStatus: 'ready',
      freeShippingUnlocked: false,
      totalCents: 72900,
      finalizable: true,
      items: [{
        productId: 'catalog-shirt', variantId: 'catalog-shirt-0', sku: 'SHIRT-S',
        productName: 'Real Shirt', size: 'Small', quantity: 1, unitPriceCents: 64900,
        lineTotalCents: 64900
      }],
      address: {
        houseAddress: '12 Test', barangay: 'BUCANDALA IV', city: 'IMUS', province: 'CAVITE',
        provinceCode: 'CAVITE', cityCode: 'CAVITE|IMUS', barangayCode: 'CAVITE|IMUS|BUCANDALA IV',
        addressLine: '12 Test, BUCANDALA IV, IMUS, CAVITE, Philippines'
      }
    },
    ...quoteOverrides
  };
  const dependencies = {
    calls,
    now: () => new Date('2026-06-28T04:00:00.000Z'),
    confirmationSecret: 'x'.repeat(32),
    idempotencyTtlMs: 86400000,
    hashRequest: () => 'same',
    hashKey: () => 'key-hash',
    createOrderNumber: () => 'MCC-1',
    transaction: async (callback) => { calls.push('transaction'); return callback({ id: 'client' }); },
    claimIdempotency: async () => {
      calls.push('claimIdempotency');
      return idempotency || { status: 'in_progress', requestHash: 'same' };
    },
    loadQuote: async () => { calls.push('loadQuote'); return quote; },
    refreshQuote: async () => { calls.push('refreshQuote'); return { ...quote.snapshot, ...refreshOverrides }; },
    deductStock: async () => calls.push('deductStock'),
    saveOrder: async () => calls.push('saveOrder'),
    appendMovements: async () => calls.push('appendMovements'),
    convertCart: async () => calls.push('convertCart'),
    claimPromo: async () => calls.push('claimPromo'),
    insertMeta: async () => calls.push('insertMeta'),
    consumeQuote: async () => calls.push('consumeQuote'),
    completeIdempotency: async () => calls.push('completeIdempotency'),
    deriveToken: () => 'derived-confirmation-token',
    hashToken: () => 'a'.repeat(64)
  };
  return dependencies;
}

test('completed matching retry returns before quote and stock validation', async () => {
  const deps = createDependencies({
    idempotency: { status: 'completed', requestHash: 'same', orderNumber: 'MCC-1', response: storedResponse() }
  });
  const result = await placeAuthoritativeCheckout(requestFixture(), deps);
  assert.equal(result.orderNumber, 'MCC-1');
  assert.equal(result.confirmationToken, 'derived-confirmation-token');
  assert.equal(deps.calls.includes('loadQuote'), false);
  assert.equal(deps.calls.includes('deductStock'), false);
});

test('same key with a different normalized request is rejected', async () => {
  const deps = createDependencies({ idempotency: { status: 'completed', requestHash: 'other' } });
  await assert.rejects(
    placeAuthoritativeCheckout(requestFixture(), deps),
    (error) => error.code === 'idempotency_conflict' && error.status === 409
  );
});

test('checkout rejects expired, consumed, mismatched, and changed quotes', async () => {
  await assert.rejects(
    placeAuthoritativeCheckout(requestFixture(), createDependencies({
      quoteOverrides: { expiresAt: '2026-06-28T03:59:00.000Z' }
    })),
    (error) => error.code === 'quote_expired'
  );
  await assert.rejects(
    placeAuthoritativeCheckout(requestFixture(), createDependencies({
      quoteOverrides: { consumedOrderNumber: 'MCC-old' }
    })),
    (error) => error.code === 'quote_consumed'
  );
  await assert.rejects(
    placeAuthoritativeCheckout(requestFixture({ cartSessionId: 'cart-other' }), createDependencies()),
    (error) => error.code === 'quote_mismatch'
  );
  await assert.rejects(
    placeAuthoritativeCheckout(requestFixture(), createDependencies({
      refreshOverrides: { pricingFingerprint: 'new-price', totalCents: 80000 }
    })),
    (error) => error.code === 'quote_changed' && error.details.totalCents === 80000
  );
});

test('successful checkout performs every commerce write in one transaction', async () => {
  const deps = createDependencies();
  const result = await placeAuthoritativeCheckout(requestFixture(), deps);
  assert.deepEqual(deps.calls, [
    'transaction', 'claimIdempotency', 'loadQuote', 'refreshQuote', 'deductStock',
    'saveOrder', 'appendMovements', 'convertCart', 'claimPromo', 'insertMeta',
    'consumeQuote', 'completeIdempotency'
  ]);
  assert.equal(result.confirmationToken, 'derived-confirmation-token');
  assert.equal(result.totalCents, 72900);
  assert.equal(result.status, 'confirmed');
});

test('idempotency repository hashes keys, locks claims, and stores token-free responses', async () => {
  assert.match(hashIdempotencyKey(' idem-1 '), /^[0-9a-f]{64}$/);
  const calls = [];
  const client = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (/SELECT/.test(sql)) return {
        rows: [{ key_hash: 'key', request_hash: 'request', status: 'in_progress', response: {} }]
      };
      return { rows: [], rowCount: 1 };
    }
  };
  const claim = await claimIdempotency(client, {
    keyHash: 'key', requestHash: 'request', expiresAt: new Date('2026-06-29T00:00:00Z')
  });
  assert.equal(claim.status, 'in_progress');
  assert.match(calls[0].sql, /ON CONFLICT \(key_hash\) DO NOTHING/);
  assert.match(calls[1].sql, /FOR UPDATE/);

  await completeIdempotency(client, {
    keyHash: 'key', orderNumber: 'MCC-1', response: storedResponse()
  });
  assert.match(calls[2].sql, /status = 'completed'/);
  assert.equal(calls[2].values[2].includes('confirmationToken'), false);
});
