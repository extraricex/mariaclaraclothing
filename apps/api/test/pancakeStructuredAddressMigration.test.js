const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('structured Pancake address migration persists mappings and created-before-verified state', () => {
  const sql = fs.readFileSync(path.join(
    __dirname, '..', 'db', 'migrations', '20260718_pancake_structured_address.sql'
  ), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS pancake_geo_mappings/);
  assert.match(sql, /website_parent_code/);
  assert.match(sql, /pancake_parent_id/);
  assert.match(sql, /'created_unverified'/);
  assert.match(sql, /'waiting_payment'/);
  assert.match(sql, /provider_verification/);
  assert.match(sql, /verified_at/);
});
