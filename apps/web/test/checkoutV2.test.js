import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCheckoutQuoteRequest,
  buildOrderRequest,
  fetchOrderConfirmation
} from '../src/lib/api.js';
import {
  clearCheckoutIdempotencyKey,
  getCheckoutIdempotencyKey
} from '../src/lib/cart.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
}

test('quote request sends only item identity, quantity, cart session, discount, and address codes', () => {
  assert.deepEqual(buildCheckoutQuoteRequest({
    cartSessionId: 'cart-1',
    items: [{ productId: 'P-1', variantId: 'V-1', quantity: 2, unitPriceCents: 1 }],
    discountCode: ' SAVE ',
    address: {
      houseAddress: '12 Test', provinceCode: 'CAVITE', cityCode: 'CAVITE|IMUS',
      barangayCode: 'B', province: 'client claim', shippingRegion: 'client claim'
    }
  }), {
    cartSessionId: 'cart-1',
    items: [{ productId: 'P-1', variantId: 'V-1', quantity: 2 }],
    discountCode: 'SAVE',
    address: {
      houseAddress: '12 Test', provinceCode: 'CAVITE', cityCode: 'CAVITE|IMUS', barangayCode: 'B'
    }
  });
});

test('checkout idempotency key is stable for one quote and resets after success', () => {
  const storage = memoryStorage();
  const first = getCheckoutIdempotencyKey('quote-1', storage, () => 'uuid-1');
  const retry = getCheckoutIdempotencyKey('quote-1', storage, () => 'uuid-2');
  assert.equal(first, 'uuid-1');
  assert.equal(retry, 'uuid-1');
  clearCheckoutIdempotencyKey(storage);
  assert.equal(getCheckoutIdempotencyKey('quote-2', storage, () => 'uuid-3'), 'uuid-3');
});

test('order request excludes browser totals and sends quote identity', () => {
  const request = buildOrderRequest({
    cartSessionId: 'cart-1',
    customer: { fullName: 'Phase One Customer', phone: '09171234567' },
    paymentMethod: 'cash_on_delivery',
    notes: ''
  }, 'quote-1', 'uuid-1');
  assert.equal(request.body.quoteId, 'quote-1');
  assert.equal(request.headers['Idempotency-Key'], 'uuid-1');
  assert.equal('shippingFeeCents' in request.body, false);
  assert.equal('totalCents' in request.body, false);
  assert.equal('items' in request.body, false);
});

test('confirmation fetch sends the token in a header and never a URL', async () => {
  let request;
  await fetchOrderConfirmation('MCC-1', 'secret-token', async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ order: { orderNumber: 'MCC-1' } }) };
  });
  assert.equal(request.url, '/api/orders/MCC-1/confirmation');
  assert.equal(request.options.headers['X-Order-Confirmation'], 'secret-token');
  assert.equal(request.url.includes('secret-token'), false);
});
