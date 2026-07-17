import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readRecentlyViewed,
  recentlyViewedProducts,
  rememberRecentlyViewed
} from '../src/lib/recentlyViewed.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value)
  };
}

test('recently viewed stores only product identity and keeps newest unique records first', () => {
  const storage = memoryStorage();
  assert.equal(rememberRecentlyViewed({ id: 'one', publicHandle: 'first-piece', name: 'Private-free' }, storage, 10), true);
  assert.equal(rememberRecentlyViewed({ id: 'two', publicHandle: 'second-piece' }, storage, 20), true);
  assert.equal(rememberRecentlyViewed({ id: 'one', publicHandle: 'first-piece' }, storage, 30), true);
  assert.deepEqual(readRecentlyViewed(storage), [
    { productId: 'one', slug: 'first-piece', viewedAt: 30 },
    { productId: 'two', slug: 'second-piece', viewedAt: 20 }
  ]);
  assert.equal(JSON.stringify(readRecentlyViewed(storage)).includes('name'), false);
});

test('recently viewed resolves against the current real catalog and drops unavailable IDs', () => {
  const storage = memoryStorage();
  rememberRecentlyViewed({ id: 'missing', publicHandle: 'old' }, storage, 10);
  rememberRecentlyViewed({ id: 'one', publicHandle: 'one' }, storage, 20);
  rememberRecentlyViewed({ id: 'two', publicHandle: 'two' }, storage, 30);
  const catalog = [{ id: 'one', name: 'One' }, { id: 'two', name: 'Two' }];
  assert.deepEqual(recentlyViewedProducts(catalog, { storage, excludeProductId: 'two' }), [catalog[0]]);
});
