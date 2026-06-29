const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { normalizeEditableProduct } = require('../src/products/catalogRepository');
const { buildAuthoritativeQuote } = require('../src/checkout/checkoutQuoteService');

function product(weight) {
  return normalizeEditableProduct({
    slug: 'weighted-shirt', name: 'Weighted Shirt', description: 'Test', collections: ['Catalog'],
    priceCents: 64900, parcelWeightGrams: weight,
    images: [{ url: '/shirt.jpg', altText: 'Shirt', sortOrder: 0 }],
    variants: [{ size: 's', sku: 'WEIGHT-S', stockQuantity: 5 }]
  });
}

test('products normalize parcel weight in grams with a safe default', () => {
  assert.equal(product(320).parcelWeightGrams, 320);
  assert.equal(product(undefined).parcelWeightGrams, 250);
  assert.throws(() => product(0), /parcel weight/i);
  assert.throws(() => product(100001), /parcel weight/i);
});

test('authoritative quote snapshots unit and total parcel weight', async () => {
  const catalogProduct = {
    id: 'catalog-weighted-shirt', slug: 'weighted-shirt', name: 'Weighted Shirt',
    priceCents: 64900, parcelWeightGrams: 320, images: [{ url: '/shirt.jpg' }],
    variants: [{ id: 'catalog-weighted-shirt-0', sku: 'WEIGHT-S', size: 's', stockQuantity: 5 }]
  };
  const quote = await buildAuthoritativeQuote({
    cartSessionId: 'cart-weight',
    items: [{ productId: catalogProduct.id, variantId: catalogProduct.variants[0].id, quantity: 2 }]
  }, {
    findProduct: async () => catalogProduct,
    getSettings: async () => ({ shipping: { regions: [], freeShippingEnabled: false } }),
    quotePromos: async ({ items }) => ({
      discountCode: '', discountTotalCents: 0, discountSnapshot: {}, shippingFeeCents: 0,
      freeShippingUnlocked: false,
      subtotalCents: items.reduce((sum, item) => sum + item.lineTotalCents, 0)
    })
  });
  assert.equal(quote.items[0].unitWeightGrams, 320);
  assert.equal(quote.items[0].lineWeightGrams, 640);
  assert.equal(quote.parcelWeightGrams, 640);
});

test('parcel migration adds product and order weight columns', async () => {
  const migration = await fs.readFile(
    path.join(__dirname, '..', 'db', 'migrations', '20260629_parcel_operations.sql'), 'utf8'
  );
  assert.match(migration, /products ADD COLUMN IF NOT EXISTS parcel_weight_grams/);
  assert.match(migration, /orders ADD COLUMN IF NOT EXISTS parcel_weight_grams/);
  assert.match(migration, /parcel_weight_override_grams/);
});
