const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dataPath = path.join(__dirname, '..', 'data', 'products.json');
process.env.PRODUCTS_DATA_FILE = dataPath;

const { catalogProducts } = require('../src/products/catalogRepository');
const { listCatalogProducts, findCatalogProductBySlug } = require('../src/products/catalogPresenter');

test('catalog data is stored in an admin-editable JSON structure', () => {
  const products = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const product = products.find((item) => item.slug === 'oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1');

  assert.ok(Array.isArray(products));
  assert.equal(products.length, 15);
  assert.equal(product.name, 'CURIOSITY OFFWHITE — Oversized 240 GSM Shirt');
  assert.equal(product.priceCents, 64900);
  assert.equal(product.compareAtPriceCents, 92900);
  assert.ok(product.description.includes('premium cotton'));
  assert.deepEqual(product.collections, ['New Arrivals']);
  assert.equal(product.images[0].url, 'https://cdn.shopify.com/s/files/1/0781/7979/5224/files/arisoffback_3dfaaa41-4b08-46df-baaf-e7fc81a222a3.jpg?v=1774462005');
  assert.equal(product.images[0].altText, product.name);
  assert.equal(product.images[0].sortOrder, 0);
  assert.equal(product.variants[0].size, 'Small');
  assert.equal(product.variants[0].stockQuantity, 12);
});

test('product page content is editable from product data for future admin', async () => {
  const products = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const orange = products.find((item) => item.slug === 'oranges-mcc-box-tee');
  const storefrontProduct = await Promise.resolve(findCatalogProductBySlug('oranges-mcc-box-tee'));

  assert.equal(orange.productPage.heading, 'ORANGES MCC BOX TEE | CROPPED BOX SHIRT | 100% COTTON | CREW NECK');
  assert.ok(orange.productPage.intro.includes('Elevate your wardrobe'));
  assert.equal(orange.productPage.sections[0].title, 'Why you\u2019ll love it:');
  assert.deepEqual(orange.productPage.sections[0].items.slice(0, 3), [
    'Premium 240 GSM cotton',
    'Oversized streetwear fit',
    'Proudly made in the Philippines'
  ]);
  assert.equal(orange.productPage.sizeChartImageUrl, 'https://cdn.shopify.com/s/files/1/0781/7979/5224/files/croppedboxsizechart.jpg?v=1771987129');
  assert.equal(orange.images.length, 8);
  assert.equal(orange.images[2].url, 'https://cdn.shopify.com/s/files/1/0781/7979/5224/files/croppedboxsizechart.jpg?v=1771987129');
  assert.equal(orange.variants[0].sku, 'ORANGE01S');

  assert.equal(storefrontProduct.productPage.heading, orange.productPage.heading);
  assert.equal(storefrontProduct.productPage.sections[1].title, 'Quality Assurance:');
  assert.equal(storefrontProduct.images[2].url, orange.productPage.sizeChartImageUrl);
});

test('admin product contract maps every product page detail to storefront fields', async () => {
  const contractPath = path.join(__dirname, '..', 'data', 'admin-contracts', 'products.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  const product = await Promise.resolve(findCatalogProductBySlug('oranges-mcc-box-tee'));

  assert.deepEqual(contract.storefrontFieldMap.name, {
    apiField: 'name',
    productPageDisplay: 'Product title'
  });
  assert.deepEqual(contract.storefrontFieldMap.priceCents, {
    apiField: 'priceCents',
    productPageDisplay: 'Sale price'
  });
  assert.deepEqual(contract.storefrontFieldMap.compareAtPriceCents, {
    apiField: 'compareAtPriceCents',
    productPageDisplay: 'Compare-at regular price'
  });
  assert.deepEqual(contract.storefrontFieldMap.images, {
    apiField: 'images',
    productPageDisplay: 'Product gallery and thumbnail order'
  });
  assert.deepEqual(contract.storefrontFieldMap.variants, {
    apiField: 'variants',
    productPageDisplay: 'Size selector, SKU, and stock availability'
  });
  assert.deepEqual(contract.storefrontFieldMap.productPage, {
    apiField: 'productPage',
    productPageDisplay: 'Description heading, intro, sections, size chart, media limit, sold-out text'
  });

  assert.equal(product.name, 'MARIACLARA ORANGE — CROP BOX 240 GSM Shirt');
  assert.equal(product.priceCents, 64900);
  assert.equal(product.compareAtPriceCents, 92900);
  assert.equal(product.images[0].sortOrder, 0);
  assert.equal(product.variants[0].sku, 'ORANGE01S');
  assert.equal(product.variants[0].stockQuantity, 0);
  assert.equal(product.productPage.soldOutText, 'Sold out');
});

test('catalog recreates Shopify product pricing and sizing structure', () => {
  const productNames = catalogProducts.map((product) => product.name);

  assert.ok(productNames.includes('KAMALAYAN BLOOM BLACK — Oversized 240 GSM Shirt'));
  assert.ok(productNames.includes('CURIOSITY OFFWHITE — Oversized 240 GSM Shirt'));
  assert.ok(productNames.includes('MARIACLARA ORANGE — CROP BOX 240 GSM Shirt'));

  const curiosity = catalogProducts.find((product) => product.slug === 'oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1');
  assert.equal(curiosity.price, 64900);
  assert.equal(curiosity.compareAtPrice, 92900);
  assert.equal(curiosity.images[2], 'https://cdn.shopify.com/s/files/1/0781/7979/5224/files/oversizedshirtchart.jpg?v=1776047669');

  const kamalayan = catalogProducts.find((product) => product.slug === 'oversized-fit-shirt-mc-curiosity-offwhite-maria-clara-clothing-oversized-fit-100-cotton-copy');
  assert.equal(kamalayan.price, 64900);
  assert.equal(kamalayan.compareAtPrice, 92900);
  assert.equal(kamalayan.collection, 'New Arrivals');
  assert.equal(kamalayan.image, 'https://cdn.shopify.com/s/files/1/0781/7979/5224/files/bloom2_f5c7395e-3383-499c-bdd1-618cef4b40ac.jpg?v=1774461974');
  assert.equal(kamalayan.images[1], 'https://cdn.shopify.com/s/files/1/0781/7979/5224/files/bloom1_5097625b-ac4c-4a58-8514-8959bf59ac2f.jpg?v=1774461974');
  assert.deepEqual(kamalayan.variants.map((variant) => [variant.size, variant.sku, variant.available]), [
    ['s', 'BLOOM-001S', false],
    ['m', 'BLOOM-001M', true],
    ['l', 'BLOOM-001L', true],
    ['xl', 'BLOOM-001XL', true],
    ['xxl', 'BLOOM-001XXL', false],
    ['xxxl', 'BLOOM-001XXXL', false]
  ]);

  const iconicOrange = catalogProducts.find((product) => product.slug === 'oranges-mcc-box-tee');
  assert.equal(iconicOrange.status, 'sold_out');
  assert.equal(iconicOrange.variants.every((variant) => variant.available === false), true);
  assert.equal(iconicOrange.images[2], 'https://cdn.shopify.com/s/files/1/0781/7979/5224/files/croppedboxsizechart.jpg?v=1771987129');

  const mandalaWhite = catalogProducts.find((product) => product.slug === 'mandala-white-v1');
  assert.equal(mandalaWhite, undefined);
});

test('catalog presenter exposes storefront product fields from in-project data', async () => {
  const products = await Promise.resolve(listCatalogProducts());
  const product = await Promise.resolve(findCatalogProductBySlug('oversized-fit-shirt-mc-curiosity-offwhite-maria-clara-clothing-oversized-fit-100-cotton-copy'));

  assert.equal(products.length, 15);
  assert.equal(product.name, 'KAMALAYAN BLOOM BLACK — Oversized 240 GSM Shirt');
  assert.equal(product.compareAtPriceCents, 92900);
  assert.equal(product.merchandisingStatus, 'sale');
  assert.equal(product.variants.length, 6);
  assert.equal(product.variants[0].stockQuantity, 0);
  assert.equal(product.variants[0].size, 's');
  assert.equal(product.variants[1].size, 'm');
  assert.equal(product.variants[1].stockQuantity, 12);
  assert.equal(product.variants[1].sku, 'BLOOM-001M');
  assert.equal(product.images[0].url, 'https://cdn.shopify.com/s/files/1/0781/7979/5224/files/bloom2_f5c7395e-3383-499c-bdd1-618cef4b40ac.jpg?v=1774461974');
  assert.equal(product.images[1].sortOrder, 1);
  assert.equal(product.images[2].url, 'https://cdn.shopify.com/s/files/1/0781/7979/5224/files/oversizedshirtchart.jpg?v=1776047669');

  const soldOut = await Promise.resolve(findCatalogProductBySlug('oranges-mcc-box-tee'));
  assert.equal(soldOut.merchandisingStatus, 'sold_out');
  assert.equal(soldOut.variants.every((variant) => variant.stockQuantity === 0), true);
});
