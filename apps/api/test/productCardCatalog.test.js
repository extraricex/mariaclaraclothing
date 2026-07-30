const test = require('node:test');
const assert = require('node:assert/strict');
const { productCardSummary } = require('../src/routes/products');
const { createApp } = require('../src/app');

test('product card catalog excludes product-page content while preserving listing data', () => {
  const summary = productCardSummary({
    id: 'catalog-shirt',
    slug: 'shirt',
    publicHandle: 'shirt',
    name: 'Test Shirt',
    description: 'Heavy cotton test description',
    priceCents: 64900,
    compareAtPriceCents: 79900,
    collection: 'New Arrivals',
    collections: ['New Arrivals'],
    category: 'T-Shirts',
    productType: 'Oversized',
    vendor: 'Maria Clara Clothing',
    tags: ['black'],
    featured: true,
    publicationStatus: 'active',
    merchandisingStatus: 'active',
    isSoldOut: false,
    successfulOrderCount: 8,
    createdAt: '2026-07-31T00:00:00.000Z',
    seo: { title: 'Large SEO payload', imageAltText: 'Black oversized shirt' },
    productPage: { blocks: [{ body: 'Large product-page payload' }] },
    images: [
      { id: 'one', url: '/one.webp', altText: 'Front' },
      { id: 'two', url: '/two.webp', altText: 'Back' },
      { id: 'three', url: '/three.webp', altText: 'Detail' }
    ],
    variants: [{ id: 'small', size: 'S', sku: 'SKU-S', stockQuantity: 4 }]
  });

  assert.equal(summary.priceCents, 64900);
  assert.equal(summary.images.length, 2);
  assert.equal(summary.variants[0].stockQuantity, 4);
  assert.match(summary.searchText, /heavy cotton/);
  assert.equal(summary.imageAltText, 'Black oversized shirt');
  assert.equal('description' in summary, false);
  assert.equal('productPage' in summary, false);
  assert.equal('seo' in summary, false);
});

test('card catalog is small, cacheable, and revalidates with an ETag', async () => {
  const server = await new Promise((resolve, reject) => {
    const listener = createApp().listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  const url = `http://127.0.0.1:${server.address().port}/api/products?view=card`;
  try {
    const response = await fetch(url);
    const payload = await response.text();
    const etag = response.headers.get('etag');
    assert.equal(response.status, 200);
    assert.ok(Buffer.byteLength(payload) < 60 * 1024);
    assert.match(response.headers.get('cache-control') || '', /max-age=15/);
    assert.ok(etag);

    const revalidated = await fetch(url, { headers: { 'If-None-Match': etag } });
    assert.equal(revalidated.status, 304);
  } finally {
    server.close();
  }
});
