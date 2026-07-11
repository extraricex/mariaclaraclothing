import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addToCart,
  clearCart,
  getCart,
  updateQuantity
} from '../src/lib/cart.js';

function installBrowserMocks() {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
  globalThis.window = {
    dispatchEvent() {},
    addEventListener() {},
    removeEventListener() {}
  };
  globalThis.Event = class Event {
    constructor(type) {
      this.type = type;
    }
  };
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
}

const mediumItem = {
  productId: 'catalog-shirt',
  slug: 'shirt',
  variantId: 'catalog-shirt-medium',
  productName: 'MC Curiosity Oversized Fit Shirt',
  size: 'Medium',
  quantity: 1,
  maxStock: 1,
  unitPriceCents: 74900,
  imageUrl: ''
};

test('cart add and quantity updates cannot exceed variant max stock', () => {
  installBrowserMocks();
  clearCart();

  assert.deepEqual(addToCart(mediumItem), {
    ok: true,
    quantity: 1,
    maxStock: 1,
    limited: false,
    reason: ''
  });
  assert.deepEqual(addToCart(mediumItem), {
    ok: false,
    quantity: 1,
    maxStock: 1,
    limited: true,
    reason: 'max_stock'
  });
  assert.equal(getCart()[0].quantity, 1);

  assert.deepEqual(updateQuantity(mediumItem.variantId, 2), {
    ok: false,
    quantity: 1,
    maxStock: 1,
    limited: true,
    reason: 'max_stock'
  });
  assert.equal(getCart()[0].quantity, 1);
});
