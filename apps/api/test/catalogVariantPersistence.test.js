const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'products', 'catalogRepository.js'), 'utf8');

test('product saves preserve mapped variant IDs by upserting on unique SKU', () => {
  assert.match(source, /ON CONFLICT \(sku\) DO UPDATE SET/);
  assert.match(source, /assertPostgresVariantSkusAvailable\(client, product\.variants, product\.slug\)/);
  assert.match(source, /WHERE product_variants\.product_slug=EXCLUDED\.product_slug/);
  assert.doesNotMatch(source, /product_slug=EXCLUDED\.product_slug,/);
  assert.match(source, /DELETE FROM product_variants WHERE product_slug=\$1 AND NOT \(sku=ANY\(\$2::text\[\]\)\)/);
  assert.match(source, /UPDATE pancake_variant_mappings m SET/);
  assert.doesNotMatch(source, /DELETE FROM product_variants WHERE product_slug = \$1/);
});
