import test from 'node:test';
import assert from 'node:assert/strict';
import {
  availableUpsellVariants,
  isUpsellProductAvailable,
  selectStableCheckoutUpsells
} from '../src/lib/checkoutUpsell.js';

function product(id, stock = 3) {
  return {
    id: `catalog-${id}`,
    slug: id,
    name: `Product ${id}`,
    merchandisingStatus: stock > 0 ? 'sale' : 'sold_out',
    variants: [{ id: `${id}-small`, size: 'Small', stockQuantity: stock }]
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
}

test('checkout upsells exclude cart, sold-out, and demo products and remain stable in one session', () => {
  const storage = memoryStorage();
  const demo = { ...product('test-product'), name: 'Test Product' };
  const products = [product('one'), product('two'), product('three'), product('four'), product('five'), product('sold', 0), demo];
  const input = {
    products,
    cartItems: [{ productId: 'catalog-one' }],
    cartSessionId: 'cart-session',
    storage,
    limit: 4
  };
  const first = selectStableCheckoutUpsells({ ...input, random: () => 0.2 });
  const second = selectStableCheckoutUpsells({ ...input, random: () => 0.9 });

  assert.deepEqual(second.map((item) => item.id), first.map((item) => item.id));
  assert.equal(first.some((item) => item.id === 'catalog-one'), false);
  assert.equal(first.some((item) => item.id === 'catalog-sold'), false);
  assert.equal(first.some((item) => item.id === demo.id), false);
  assert.equal(first.length, 4);
});

test('adding a recommended product removes it and fills from another available product', () => {
  const storage = memoryStorage();
  const products = [product('one'), product('two'), product('three'), product('four'), product('five')];
  const first = selectStableCheckoutUpsells({
    products, cartItems: [], cartSessionId: 'cart-session', storage, limit: 3, random: () => 0
  });
  const added = first[0];
  const refreshed = selectStableCheckoutUpsells({
    products,
    cartItems: [{ productId: added.id }],
    cartSessionId: 'cart-session',
    storage,
    limit: 3,
    random: () => 0
  });

  assert.equal(refreshed.some((item) => item.id === added.id), false);
  assert.equal(refreshed.length, 3);
  assert.equal(availableUpsellVariants(product('one')).length, 1);
  assert.equal(isUpsellProductAvailable(product('sold', 0)), false);
});
