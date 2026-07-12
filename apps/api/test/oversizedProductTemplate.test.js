const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  OVERSIZED_DESCRIPTION,
  OVERSIZED_DETAILS,
  OVERSIZED_SHIPPING,
  OVERSIZED_SIZE_CHART,
  applyOversizedProductTemplate,
  isOversizedProduct
} = require('../src/products/oversizedProductTemplate');

test('oversized classifier includes fit evidence and excludes crop and regular products', () => {
  assert.equal(isOversizedProduct({ name: 'Oversized 240 GSM Shirt' }), true);
  assert.equal(isOversizedProduct({ name: 'Imperial Tee', description: 'Premium oversized fit shirt.' }), true);
  assert.equal(isOversizedProduct({ name: 'Crop Box Oversized Shirt', description: 'Oversized fit.' }), false);
  assert.equal(isOversizedProduct({ name: 'MariaClara Orange', description: 'CROPPED BOX SHIRT with an oversized fit.' }), false);
  assert.equal(isOversizedProduct({ name: 'Regular Fit Tee', description: 'Oversized styling note.' }), false);
  assert.equal(isOversizedProduct({ name: 'Cotton Shorts', description: 'Oversized shape.' }), false);
  assert.equal(isOversizedProduct({ name: 'Oversized Tee', description: 'Pair it with relaxed shorts.' }), true);
});

test('template changes only description and product-page content', () => {
  const original = {
    name: 'Sample Oversized Shirt', slug: 'sample-oversized', description: 'Old', priceCents: 64900,
    collections: ['New Arrivals'], images: [{ url: '/shirt.jpg' }],
    variants: [{ size: 's', sku: 'MCC-S', stockQuantity: 4, externalPosVariantId: 'pv-1' }],
    productPage: { soldOutText: 'Sold out', sizeChartImageUrl: '/old-chart.jpg' }
  };
  const updated = applyOversizedProductTemplate(original);
  assert.equal(updated.name, original.name);
  assert.equal(updated.slug, original.slug);
  assert.equal(updated.priceCents, original.priceCents);
  assert.deepEqual(updated.collections, original.collections);
  assert.deepEqual(updated.images, original.images);
  assert.deepEqual(updated.variants, original.variants);
  assert.equal(updated.description, OVERSIZED_DESCRIPTION);
  assert.equal(updated.productPage.detailsText, OVERSIZED_DETAILS);
  assert.equal(updated.productPage.shippingText, OVERSIZED_SHIPPING);
  assert.deepEqual(updated.productPage.sizeChart, OVERSIZED_SIZE_CHART);
  assert.equal(updated.productPage.sizeChartImageUrl, undefined);
  assert.equal(updated.productPage.soldOutText, 'Sold out');
});

test('catalog applies the template to 11 oversized products and leaves crop products unchanged', () => {
  const products = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'products.json'), 'utf8'));
  const templated = products.filter((product) => product.description === OVERSIZED_DESCRIPTION);
  assert.equal(templated.length, 11);
  assert.ok(templated.some((product) => product.name.includes('ABOT KAMAY')));
  assert.ok(templated.some((product) => product.name === 'IMPERIAL CHOCO TEE'));
  const crop = products.find((product) => product.name.includes('CROP BOX'));
  assert.notEqual(crop.description, OVERSIZED_DESCRIPTION);
});
