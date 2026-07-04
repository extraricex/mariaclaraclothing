import test from 'node:test';
import assert from 'node:assert/strict';
import { freeShippingOffer, selectNewArrivalRecommendation } from '../src/lib/storefrontSupport.js';

test('free-shipping offer is hidden when the promotion is disabled', () => {
  assert.equal(freeShippingOffer({ freeShippingEnabled: false, freeShippingMinimumItems: 2 }, 0), null);
});

test('free-shipping offer uses the configured threshold for an empty cart', () => {
  assert.deepEqual(freeShippingOffer({ freeShippingEnabled: true, freeShippingMinimumItems: 3 }, 0), {
    state: 'offer',
    title: 'GET 3+ ITEMS — FREE SHIPPING',
    body: 'Your shipping fee is on us.'
  });
});

test('free-shipping offer reports remaining items with correct pluralization', () => {
  const shipping = { freeShippingEnabled: true, freeShippingMinimumItems: 3 };
  assert.equal(freeShippingOffer(shipping, 1).title, 'ADD 2 MORE ITEMS');
  assert.equal(freeShippingOffer(shipping, 2).title, 'ADD 1 MORE ITEM');
});

test('free-shipping offer reports the unlocked state', () => {
  assert.deepEqual(freeShippingOffer({ freeShippingEnabled: true, freeShippingMinimumItems: 2 }, 2), {
    state: 'unlocked',
    title: 'FREE SHIPPING UNLOCKED',
    body: 'Your order qualifies automatically.'
  });
});

test('recommendation selector uses only imaged New Arrivals products', () => {
  const products = [
    { id: 'other', slug: 'other', collections: ['Freedom of Mind'], images: [{ url: '/other.webp' }] },
    { id: 'no-image', slug: 'no-image', collections: ['New Arrivals'], images: [] },
    { id: 'missing-slug', slug: '', collections: ['New Arrivals'], images: [{ url: '/missing.webp' }] },
    { id: 'first', slug: 'first', collection: 'New Arrivals', images: [{ url: '/first.webp' }] },
    { id: 'second', slug: 'second', collections: ['New Arrivals'], images: [{ url: '/second.webp' }] }
  ];

  assert.equal(selectNewArrivalRecommendation(products, 0).id, 'first');
  assert.equal(selectNewArrivalRecommendation(products, 0.999).id, 'second');
});

test('recommendation selector safely handles empty catalogs and random bounds', () => {
  const products = [
    { id: 'first', slug: 'first', collections: ['New Arrivals'], images: [{ url: '/first.webp' }] },
    { id: 'second', slug: 'second', collections: ['New Arrivals'], images: [{ url: '/second.webp' }] }
  ];

  assert.equal(selectNewArrivalRecommendation([], 0.5), null);
  assert.equal(selectNewArrivalRecommendation(products, -4).id, 'first');
  assert.equal(selectNewArrivalRecommendation(products, 7).id, 'second');
});
