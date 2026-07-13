const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadEditableProducts, normalizeEditableProduct } = require('../src/products/catalogRepository');
const { planProductCsvImport, productsToCsv } = require('../src/products/productCsv');

const HEADER = 'product_name,slug,public_handle,status,description,product_details,shipping_details,size_chart_json,image_urls,price_php,compare_at_price_php,category,collections,tags,product_type,vendor,weight_grams,size,sku,variant_price_php,stock,pancake_product_id,pancake_variant_id';

test('CSV product import previews valid rows and never activates imported Pancake mappings', () => {
  const current = loadEditableProducts();
  const csv = [
    HEADER,
    'Audit Shirt,audit-shirt,audit-shirt,draft,Audit description,Premium cotton,Nationwide shipping,"[]",/product/audit.png,599.00,,T-Shirts,Audit Collection,audit,Tshirt,Maria Clara,250,Small,AUDIT-S,,3,pancake-product,pancake-variant',
    'Audit Shirt,audit-shirt,audit-shirt,draft,Audit description,Premium cotton,Nationwide shipping,"[]",/product/audit.png,599.00,,T-Shirts,Audit Collection,audit,Tshirt,Maria Clara,250,Medium,AUDIT-M,,2,pancake-product,pancake-variant-2'
  ].join('\n');
  const plan = planProductCsvImport(csv, { mode: 'create_only', currentProducts: current });

  assert.equal(plan.preview.validRows, 2);
  assert.equal(plan.preview.productCount, 1);
  assert.equal(plan.products[0].status, 'draft');
  assert.ok(plan.products[0].id);
  assert.equal(plan.products[0].variants[0].externalPosVariantId, '');
  assert.ok(plan.preview.rows.every((row) => row.warnings.some((warning) => /read-only/.test(warning))));
});

test('CSV product import reports duplicate SKUs, unsafe formula SKUs, and existing records', () => {
  const current = loadEditableProducts();
  const existingSku = current[0].variants[0].sku;
  const csv = [
    HEADER,
    `Existing,existing-copy,existing-copy,draft,Description,Details,Shipping,"[]",/product/a.png,599.00,,T-Shirts,Tests,,Tshirt,Maria Clara,250,Small,${existingSku},,1,,`,
    'Formula,formula-shirt,formula-shirt,draft,Description,Details,Shipping,"[]",/product/b.png,599.00,,T-Shirts,Tests,,Tshirt,Maria Clara,250,Small,=2+2,,1,,',
    'Duplicate,duplicate-shirt,duplicate-shirt,draft,Description,Details,Shipping,"[]",/product/c.png,599.00,,T-Shirts,Tests,,Tshirt,Maria Clara,250,Small,DUPLICATE-S,,1,,',
    'Duplicate,duplicate-shirt,duplicate-shirt,draft,Description,Details,Shipping,"[]",/product/c.png,599.00,,T-Shirts,Tests,,Tshirt,Maria Clara,250,Medium,DUPLICATE-S,,1,,'
  ].join('\n');
  const plan = planProductCsvImport(csv, { mode: 'create_only', currentProducts: current });

  assert.equal(plan.preview.productCount, 0);
  assert.equal(plan.preview.invalidRows, 4);
  assert.deepEqual(plan.preview.duplicateSkus, [{ sku: 'DUPLICATE-S', count: 2 }]);
  assert.ok(plan.preview.rows.some((row) => row.errors.some((error) => /already exists/.test(error))));
  assert.ok(plan.preview.rows.some((row) => row.errors.some((error) => /formula/.test(error))));
});

test('CSV product export preserves variant inventory and prevents spreadsheet formula execution', () => {
  const product = normalizeEditableProduct({
    slug: 'export-safe-shirt', name: '=Unsafe display', description: 'Export test', collections: ['Tests'],
    priceCents: 59900, status: 'draft', images: [{ url: '/product/export.png', altText: 'Export', sortOrder: 0 }],
    variants: [{ size: 'Small', sku: '@UNSAFE-S', stockQuantity: 4 }]
  });
  const csv = productsToCsv([product], [{
    productSlug: product.slug, status: 'missing_mapping', variantMappings: []
  }]);

  assert.match(csv, /"'=Unsafe display"/);
  assert.match(csv, /"'@UNSAFE-S"/);
  assert.match(csv, /"4"/);
  assert.doesNotMatch(csv, /API_KEY|SECRET_KEY/);
});

test('stable IDs differ for independent product and variant copies', () => {
  const original = normalizeEditableProduct({
    slug: 'stable-original', name: 'Stable Original', description: 'Stable', collections: ['Tests'],
    priceCents: 59900, images: [{ url: '/product/stable.png', altText: 'Stable', sortOrder: 0 }],
    variants: [{ size: 'Small', sku: 'STABLE-S', stockQuantity: 1 }]
  });
  const copy = normalizeEditableProduct({
    ...original, id: undefined, slug: 'stable-original-copy', name: 'Stable Original Copy',
    variants: original.variants.map((variant) => ({ ...variant, id: undefined, sku: 'STABLE-S-COPY', stockQuantity: 0 }))
  });
  assert.notEqual(copy.id, original.id);
  assert.notEqual(copy.variants[0].id, original.variants[0].id);
  assert.equal(copy.variants[0].stockQuantity, 0);
});

test('spreadsheet package is pinned to the patched upstream release and npm lock has no legacy registry xlsx', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.match(packageJson.dependencies.xlsx, /xlsx-0\.20\.3/);
});
