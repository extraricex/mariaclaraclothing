const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('conversion audit migration fixes verified copy and preserves canonical URL aliases', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '20260716_conversion_audit_corrections.sql'), 'utf8');
  assert.match(migration, /CURIOSITY OFFWHITE/);
  assert.match(migration, /<strong>Color:<\/strong>/);
  assert.match(migration, /Off-white/);
  assert.match(migration, /MANDALA WHITE V1/);
  assert.match(migration, /MANDALA BLACK V1/);
  assert.match(migration, /versatile black color/);
  assert.match(migration, /daruma-offwhite-premium-oversized-240-gsm-cotton-t-shirt/);
  assert.match(migration, /mandala-black-v1-premium-oversized-240-gsm-cotton-t-shirt/);
  assert.match(migration, /mariaclara-rockstar-premium-regular-fit-240-gsm-cotton-t-shirt/);
  assert.match(migration, /wanna-gray-premium-regular-fit-240-gsm-cotton-t-shirt/);
  assert.match(migration, /INSERT INTO product_url_aliases/);
  assert.match(migration, /jsonb_set\(COALESCE\(seo/);
});
