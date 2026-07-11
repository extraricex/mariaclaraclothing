const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('catalog repository keeps complete replacement transactional and secret-free', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'integrations', 'pancake', 'pancakeCatalogRepository.js'), 'utf8');
  assert.match(source, /transaction\(async \(client\)/);
  assert.match(source, /DELETE FROM pancake_catalog_variations/);
  assert.match(source, /INSERT INTO pancake_variant_mappings/);
  assert.match(source, /UPDATE product_variants/);
  assert.match(source, /INSERT INTO pancake_sync_conflicts/);
  assert.doesNotMatch(source, /api_key|webhook_secret/i);
});
