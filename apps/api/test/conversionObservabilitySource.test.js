const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('conversion observability migration preserves expanded event names and issue resolutions', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '20260725_conversion_observability.sql'), 'utf8');
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  for (const source of [migration, schema]) {
    assert.match(source, /shipping_info_completed/);
    assert.match(source, /place_order/);
    assert.match(source, /checkout_error/);
    assert.match(source, /thank_you_view/);
    assert.match(source, /browser_category/);
    assert.match(source, /reference_hash/);
    assert.match(source, /checkout_issue_resolutions/);
  }
});

test('PostgreSQL analytics insert has one value for each target column', () => {
  const repository = fs.readFileSync(path.join(__dirname, '..', 'src', 'analytics', 'storefrontAnalyticsRepository.js'), 'utf8');
  const insert = repository.match(/INSERT INTO storefront_analytics_events \(\s*([\s\S]*?)\s*\) VALUES \(([^)]+)\)/);
  assert.ok(insert);
  const columns = insert[1].split(',').map((value) => value.trim()).filter(Boolean);
  const values = insert[2].split(',').map((value) => value.trim()).filter(Boolean);
  assert.equal(columns.length, 23);
  assert.equal(values.length, columns.length);
  assert.equal(values.at(-1), '$23');
});
