const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.join(__dirname, '..', 'db', 'migrations', '20260704_pancake_catalog_mapping.sql');

test('Pancake catalog migration defines safe mapping tables and constraints', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  for (const table of [
    'pancake_shops', 'pancake_warehouses', 'pancake_order_sources',
    'pancake_catalog_variations', 'pancake_variant_mappings',
    'pancake_sync_conflicts', 'pancake_catalog_imports'
  ]) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.doesNotMatch(sql, /api_key|webhook_secret/i);
  assert.match(sql, /UNIQUE \(shop_id, pancake_variation_id\)/);
  assert.match(sql, /UNIQUE \(local_variant_id\)/);
  assert.match(sql, /WHERE status = 'running'/);
});

test('fresh schema contains the complete Pancake catalog foundation', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS pancake_catalog_imports/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS pancake_variant_mappings/);
});
