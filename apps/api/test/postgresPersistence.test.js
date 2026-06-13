const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

test('PostgreSQL persistence layer has schema migration seed and package wiring', async () => {
  const root = path.join(__dirname, '..');
  const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const schema = await fs.readFile(path.join(root, 'db', 'schema.sql'), 'utf8');
  const migrateScript = await fs.readFile(path.join(root, 'scripts', 'db-migrate.js'), 'utf8');
  const seedScript = await fs.readFile(path.join(root, 'scripts', 'db-seed.js'), 'utf8');
  const postgresDb = await fs.readFile(path.join(root, 'src', 'db', 'postgres.js'), 'utf8');
  const productRepository = await fs.readFile(path.join(root, 'src', 'products', 'catalogRepository.js'), 'utf8');
  const orderRepository = await fs.readFile(path.join(root, 'src', 'orders', 'orderRepository.js'), 'utf8');
  const siteContentRepository = await fs.readFile(path.join(root, 'src', 'siteContent', 'siteContentRepository.js'), 'utf8');

  assert.match(packageJson.dependencies.pg, /^\^8\./);
  assert.equal(packageJson.scripts['db:migrate'], 'node scripts/db-migrate.js');
  assert.equal(packageJson.scripts['db:seed'], 'node scripts/db-seed.js');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS products/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS product_images/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS product_variants/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS orders/);
  assert.match(schema, /jsonb/);
  assert.match(migrateScript, /schema\.sql/);
  assert.match(seedScript, /replaceEditableProducts/);
  assert.match(seedScript, /saveOrder/);
  assert.match(postgresDb, /DATABASE_URL/);
  assert.match(postgresDb, /new Pool/);
  assert.match(productRepository, /usePostgresProducts/);
  assert.match(orderRepository, /usePostgresOrders/);
  assert.match(siteContentRepository, /usePostgresSiteContent/);
  assert.match(siteContentRepository, /store_settings/);
});
