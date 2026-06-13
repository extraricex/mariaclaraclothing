const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const nodeFs = require('node:fs');
const nodeOs = require('node:os');
const nodePath = require('node:path');

// Isolate the catalog so deduction never touches the committed data/products.json.
const REAL_PRODUCTS = nodePath.join(__dirname, '..', 'data', 'products.json');
process.env.PRODUCTS_DATA_FILE = nodePath.join(
  nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'mc-inv-')),
  'products.json'
);

const { loadEditableProducts, deductVariantStock } = require('../src/products/catalogRepository');

beforeEach(() => {
  nodeFs.copyFileSync(REAL_PRODUCTS, process.env.PRODUCTS_DATA_FILE);
});

function pickInStock(products) {
  for (const product of products) {
    for (const variant of product.variants) {
      if (Number(variant.stockQuantity) > 0) {
        return { slug: product.slug, size: variant.size, name: product.name, stock: Number(variant.stockQuantity) };
      }
    }
  }
  throw new Error('No in-stock variant in fixture');
}

function variantOf(products, slug, size) {
  return products.find((p) => p.slug === slug).variants.find((v) => v.size === size);
}

test('deductVariantStock reduces the ordered variant stock', async () => {
  const target = pickInStock(loadEditableProducts());
  await deductVariantStock([{ slug: target.slug, size: target.size, quantity: 1, productName: target.name }]);
  const after = variantOf(loadEditableProducts(), target.slug, target.size);
  assert.equal(Number(after.stockQuantity), target.stock - 1);
});

test('deductVariantStock blocks oversell and leaves stock unchanged', async () => {
  const target = pickInStock(loadEditableProducts());
  await assert.rejects(
    async () => deductVariantStock([{ slug: target.slug, size: target.size, quantity: target.stock + 1, productName: target.name }]),
    (err) => err.status === 409 && err.message === `${target.size} is sold out for ${target.name}`
  );
  const after = variantOf(loadEditableProducts(), target.slug, target.size);
  assert.equal(Number(after.stockQuantity), target.stock);
});
