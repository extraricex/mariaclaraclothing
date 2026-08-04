import test from 'node:test';
import assert from 'node:assert/strict';
import { freeShippingOffer, selectSaleRecommendation } from '../src/lib/storefrontSupport.js';

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

test('sale recommendation uses the strongest in-stock shirt discount', () => {
  const products = [
    { id: 'full-price', slug: 'full-price', priceCents: 64900, compareAtPriceCents: 64900, variants: [{ stockQuantity: 4 }], images: [{ url: '/full.webp' }] },
    { id: 'sold-out', slug: 'sold-out', priceCents: 64900, compareAtPriceCents: 92900, variants: [{ stockQuantity: 0 }], images: [{ url: '/sold.webp' }] },
    { id: 'no-image', slug: 'no-image', priceCents: 64900, compareAtPriceCents: 92900, variants: [{ stockQuantity: 4 }], images: [] },
    { id: 'smaller-sale', slug: 'smaller-sale', priceCents: 64900, compareAtPriceCents: 84900, variants: [{ stockQuantity: 4 }], images: [{ url: '/small.webp' }] },
    { id: 'first', slug: 'first', priceCents: 64900, compareAtPriceCents: 92900, variants: [{ stockQuantity: 4 }], images: [{ url: '/first.webp' }] },
    { id: 'second', slug: 'second', priceCents: 64900, compareAtPriceCents: 92900, variants: [{ stockQuantity: 4 }], images: [{ url: '/second.webp' }] }
  ];

  assert.equal(selectSaleRecommendation(products, 0).id, 'first');
  assert.equal(selectSaleRecommendation(products, 0.999).id, 'second');
});

test('sale recommendation safely handles empty catalogs and random bounds', () => {
  const products = [
    { id: 'first', slug: 'first', priceCents: 64900, compareAtPriceCents: 92900, variants: [{ stockQuantity: 4 }], images: [{ url: '/first.webp' }] },
    { id: 'second', slug: 'second', priceCents: 64900, compareAtPriceCents: 92900, variants: [{ stockQuantity: 4 }], images: [{ url: '/second.webp' }] }
  ];

  assert.equal(selectSaleRecommendation([], 0.5), null);
  assert.equal(selectSaleRecommendation(products, -4).id, 'first');
  assert.equal(selectSaleRecommendation(products, 7).id, 'second');
});
