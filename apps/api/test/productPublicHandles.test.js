const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../src/app');
const {
  findCatalogProductBySlug,
  loadEditableProducts,
  saveEditableProduct
} = require('../src/products/catalogRepository');

function fixture(slug, name, sku) {
  return {
    slug,
    name,
    description: `${name} description`,
    collections: ['Tees'],
    priceCents: 64900,
    images: [{ url: `/product/${slug}.png`, altText: name, sortOrder: 0 }],
    variants: [{ size: 'm', sku, stockQuantity: 3 }]
  };
}

test('public product handles keep internal slugs stable and retain previous URLs', async () => {
  const previousDataFile = process.env.PRODUCTS_DATA_FILE;
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'mcc-product-handles-'));
  const dataFile = path.join(tempDir, 'products.json');
  process.env.PRODUCTS_DATA_FILE = dataFile;
  await fsp.writeFile(dataFile, JSON.stringify([
    fixture('legacy-product-copy-copy', 'Clean Product Name', 'CLEAN-M'),
    fixture('second-legacy-product', 'Second Product', 'SECOND-M')
  ], null, 2));

  let server;
  try {
    const [initial] = loadEditableProducts();
    assert.equal(initial.slug, 'legacy-product-copy-copy');
    assert.equal(initial.publicHandle, 'clean-product-name');
    assert.deepEqual(initial.urlAliases, ['legacy-product-copy-copy']);

    const canonical = findCatalogProductBySlug('clean-product-name');
    const legacy = findCatalogProductBySlug('legacy-product-copy-copy');
    assert.equal(canonical.slug, 'legacy-product-copy-copy');
    assert.equal(legacy.publicHandle, 'clean-product-name');

    const updated = saveEditableProduct({ ...initial, publicHandle: 'clean-product-name-2026' }, initial.slug);
    assert.equal(updated.slug, initial.slug);
    assert.equal(updated.publicHandle, 'clean-product-name-2026');
    assert.ok(updated.urlAliases.includes('clean-product-name'));
    assert.ok(updated.urlAliases.includes('legacy-product-copy-copy'));
    assert.equal(findCatalogProductBySlug('clean-product-name').slug, initial.slug);
    assert.throws(
      () => saveEditableProduct({ ...updated, slug: 'renamed-internal-id' }, initial.slug),
      (error) => error.status === 400 && /cannot be changed/.test(error.message)
    );

    const second = loadEditableProducts().find((product) => product.slug === 'second-legacy-product');
    assert.throws(
      () => saveEditableProduct({ ...second, publicHandle: 'clean-product-name' }, second.slug),
      (error) => error.status === 409 && /already used/.test(error.message)
    );

    server = await new Promise((resolve, reject) => {
      const listener = createApp().listen(0, '127.0.0.1', () => resolve(listener));
      listener.on('error', reject);
    });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/products/clean-product-name`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-product-canonical-handle'), 'clean-product-name-2026');
    assert.equal(body.product.slug, 'legacy-product-copy-copy');
    assert.equal(body.product.publicHandle, 'clean-product-name-2026');

    const redirect = await fetch(`http://127.0.0.1:${server.address().port}/api/products/clean-product-name/route`, {
      redirect: 'manual'
    });
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.get('location'), '/product/clean-product-name-2026');

    const route = await fetch(`http://127.0.0.1:${server.address().port}/api/products/clean-product-name-2026/route`);
    assert.equal(route.status, 200);
    assert.equal(route.headers.get('x-accel-redirect'), '/index.html');
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (previousDataFile === undefined) delete process.env.PRODUCTS_DATA_FILE;
    else process.env.PRODUCTS_DATA_FILE = previousDataFile;
  }
});

test('public handle schema migration backfills clean canonical routes and legacy aliases', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '20260713_product_public_handles.sql'), 'utf8');
  const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');
  const seoMigrationName = '20260713_product_public_handles_seo.sql';
  const seoMigration = fs.readFileSync(path.join(migrationsDir, seoMigrationName), 'utf8');
  const orderedMigrations = fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort();
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  assert.match(migration, /ADD COLUMN IF NOT EXISTS public_handle/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS product_url_aliases/);
  assert.match(migration, /regexp_replace\(lower\(product_record\.name\)/);
  assert.match(migration, /INSERT INTO product_url_aliases/);
  assert.match(migration, /ALTER COLUMN public_handle SET NOT NULL/);
  assert.match(schema, /products_public_handle_lower_idx/);
  assert.match(seoMigration, /jsonb_set/);
  assert.match(seoMigration, /public_handle/);
  assert.ok(orderedMigrations.indexOf('20260713_product_public_handles.sql') < orderedMigrations.indexOf(seoMigrationName));
});
