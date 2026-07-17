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

test('quote request sends item identity plus structured address codes and readable labels', () => {
  assert.deepEqual(buildCheckoutQuoteRequest({
    cartSessionId: 'cart-1',
    items: [{ productId: 'P-1', variantId: 'V-1', quantity: 2, unitPriceCents: 1 }],
    discountCode: ' SAVE ',
    address: {
      houseAddress: '12 Test', provinceCode: 'CAVITE', cityCode: 'CAVITE|IMUS',
      barangayCode: 'B', postalCode: '4103', province: 'Cavite', city: 'Imus City',
      barangay: 'Bucandala IV', shippingRegion: 'client claim'
    }
  }), {
    cartSessionId: 'cart-1',
    items: [{ productId: 'P-1', variantId: 'V-1', quantity: 2 }],
    discountCode: 'SAVE',
    address: {
      houseAddress: '12 Test', provinceCode: 'CAVITE', provinceName: 'Cavite',
      cityCode: 'CAVITE|IMUS', cityName: 'Imus City', barangayCode: 'B',
      barangayName: 'Bucandala IV', postalCode: '4103'
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

test('checkout idempotency key falls back when crypto.randomUUID is unavailable', () => {
  const storage = memoryStorage();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      getRandomValues(bytes) {
        for (let index = 0; index < bytes.length; index += 1) bytes[index] = index + 1;
        return bytes;
      }
    }
  });

  try {
    const key = getCheckoutIdempotencyKey('quote-no-randomuuid', storage);
    assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
    else delete globalThis.crypto;
  }
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
