import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectionSeoDescriptor,
  NOINDEX_FOLLOW_ROBOTS,
  productSeoDescriptor,
  productStructuredData,
  routeSeoDescriptor
} from '../src/lib/seo.js';

const product = {
  id: 'prod-1',
  slug: 'internal-mandala',
  publicHandle: 'mandala-white-v1',
  name: 'MANDALA WHITE V1',
  description: '<p>Confirmed oversized cotton shirt details.</p>',
  category: 'T-Shirts',
  status: 'active',
  priceCents: 64900,
  metafields: { color: ['White'], material: ['Cotton'], fit: ['Oversized fit'], fabricWeight: ['240 GSM'] },
  images: [{ url: '/products/mandala-front.webp', altText: 'Mandala White V1 shirt, front view' }],
  variants: [
    { id: 'small', size: 's', sku: 'MANDALA-S', priceCents: null, stockQuantity: 2 },
    { id: 'medium', size: 'm', sku: 'MANDALA-M', priceCents: 69900, stockQuantity: 0 }
  ],
  reviewSettings: { reviewsEnabled: true, showRatingSummary: true },
  reviewSummary: { totalReviews: 3, averageRating: 4.7 },
  seo: { indexable: true }
};

test('private routes and filtered shop routes receive safe index directives', () => {
  assert.equal(routeSeoDescriptor('/admin/products', '').noindex, true);
  assert.equal(routeSeoDescriptor('/account/settings', '').noindex, true);
  assert.equal(routeSeoDescriptor('/shop', '?q=shirt').robots, NOINDEX_FOLLOW_ROBOTS);
  assert.match(routeSeoDescriptor('/shop', '?q=shirt').canonical, /^\/shop$/);
});

test('product variant schema uses PHP numeric prices and real availability', () => {
  const schema = productStructuredData(product, { origin: 'https://mariaclaraclothing.com' });
  assert.equal(schema['@type'], 'ProductGroup');
  assert.equal(schema.hasVariant.length, 2);
  assert.equal(schema.hasVariant[0].offers.priceCurrency, 'PHP');
  assert.equal(schema.hasVariant[0].offers.price, 649);
  assert.equal(typeof schema.hasVariant[0].offers.price, 'number');
  assert.equal(schema.hasVariant[0].offers.availability, 'https://schema.org/InStock');
  assert.equal(schema.hasVariant[1].offers.availability, 'https://schema.org/OutOfStock');
  assert.equal(schema.hasVariant[0].url, 'https://mariaclaraclothing.com/product/mandala-white-v1?size=s');
  assert.equal(schema.hasVariant[0].offers.url, 'https://mariaclaraclothing.com/product/mandala-white-v1?size=s');
  assert.equal(schema.hasVariant[0].size, 'S');
  assert.deepEqual(schema.additionalProperty, [
    { '@type': 'PropertyValue', name: 'Fit', value: 'Oversized fit' },
    { '@type': 'PropertyValue', name: 'Fabric weight', value: '240 GSM' }
  ]);
  assert.deepEqual(schema.aggregateRating, { '@type': 'AggregateRating', ratingValue: 4.7, reviewCount: 3 });
});

test('review markup is omitted when reviews are not visibly published', () => {
  const schema = productStructuredData(product, {
    origin: 'https://mariaclaraclothing.com',
    includeReviews: false
  });
  assert.equal(schema.aggregateRating, undefined);
});

test('product canonicals stay clean when a Merchant Center size query is used', () => {
  const descriptor = productSeoDescriptor(product, { origin: 'https://mariaclaraclothing.com' });
  assert.equal(descriptor.canonical, 'https://mariaclaraclothing.com/product/mandala-white-v1');
  assert.doesNotMatch(descriptor.canonical, /[?&]size=/);
  assert.equal(descriptor.title, 'Mandala White V1 — Oversized T-Shirt | Maria Clara Clothing');
  assert.match(descriptor.description, /^Shop Mandala White V1 by Maria Clara Clothing:/);
});

test('client schema uses only conflict-free inferred facts when explicit metafields are absent', () => {
  const inferred = productStructuredData({
    ...product,
    name: 'CURIOSITY BLACK — Oversized 240 GSM Shirt',
    description: 'A black oversized 240 GSM premium cotton shirt.',
    metafields: {},
    seo: {},
    variants: [product.variants[0]]
  }, { origin: 'https://mariaclaraclothing.com' });
  assert.equal(inferred.color, 'Black');
  assert.equal(inferred.material, 'Premium Cotton');
  assert.deepEqual(inferred.additionalProperty, [
    { '@type': 'PropertyValue', name: 'Fit', value: 'Oversized fit' },
    { '@type': 'PropertyValue', name: 'Fabric weight', value: '240 GSM' }
  ]);

  const conflicting = productStructuredData({
    ...product,
    name: 'CURIOSITY BLACK — Oversized Shirt',
    description: 'This design is shown in white.',
    metafields: {},
    seo: {},
    variants: [product.variants[0]]
  }, { origin: 'https://mariaclaraclothing.com' });
  assert.equal(conflicting.color, undefined);
});

test('contradictory explicit product facts are omitted instead of trusting one source', () => {
  const contradictoryProduct = {
    ...product,
    name: 'MARIACLARA ROCKSTAR',
    description: 'A gray oversized 240 GSM cotton shirt.',
    metafields: {
      color: ['Red'],
      material: ['Polyester'],
      fit: ['Regular fit'],
      fabricWeight: ['180 GSM']
    },
    productPage: {
      detailsText: 'Color: Red\nMaterial: Polyester\nFit: Regular fit\nFabric weight: 180 GSM'
    },
    seo: {},
    variants: [product.variants[0]]
  };
  const schema = productStructuredData(contradictoryProduct, {
    origin: 'https://mariaclaraclothing.com'
  });
  const descriptor = productSeoDescriptor(contradictoryProduct, {
    origin: 'https://mariaclaraclothing.com'
  });

  assert.equal(schema.color, undefined);
  assert.equal(schema.material, undefined);
  assert.equal(schema.additionalProperty, undefined);
  assert.doesNotMatch(schema.description, /\b(?:red|gr(?:a|e)y|polyester|cotton|180\s*gsm|240\s*gsm|oversized|regular[ -]?fit)\b/i);
  assert.equal(descriptor.title, 'MariaClara Rockstar — T-Shirt | Maria Clara Clothing');
  assert.equal(
    descriptor.description,
    'Shop MariaClara Rockstar by Maria Clara Clothing: T-Shirt. Check current price, sizes, and availability online.'
  );
});

test('canonical overrides cannot leave the storefront origin or product route family', () => {
  const external = productSeoDescriptor({
    ...product,
    seo: { ...product.seo, canonicalUrl: 'https://example.com/copied-product' }
  }, { origin: 'https://mariaclaraclothing.com' });
  assert.equal(external.canonical, 'https://mariaclaraclothing.com/product/mandala-white-v1');

  const wrongRoute = productSeoDescriptor({
    ...product,
    seo: { ...product.seo, canonicalUrl: '/collections/freedom-of-mind' }
  }, { origin: 'https://mariaclaraclothing.com' });
  assert.equal(wrongRoute.canonical, 'https://mariaclaraclothing.com/product/mandala-white-v1');
});

test('empty collections are noindex and populated collections expose an ItemList', () => {
  const collection = { name: 'Freedom of Mind', slug: 'freedom-of-mind', indexable: true };
  assert.equal(collectionSeoDescriptor(collection, []).noindex, true);
  const descriptor = collectionSeoDescriptor(collection, [product], { origin: 'https://mariaclaraclothing.com' });
  assert.equal(descriptor.noindex, false);
  assert.equal(descriptor.structuredData[1].mainEntity.numberOfItems, 1);
  assert.equal(descriptor.structuredData[1].mainEntity.itemListElement[0].url, 'https://mariaclaraclothing.com/product/mandala-white-v1');
});
