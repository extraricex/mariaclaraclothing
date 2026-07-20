const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.join(__dirname, '../db/migrations/20260720_paymongo_pancake_expiry_cleanup.sql');
const schemaPath = path.join(__dirname, '../db/schema.sql');

test('PayMongo expiry cleanup records unpaid Pancake exports and orphan events as skipped', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8');
  assert.match(migration, /status IN \([^)]*'skipped'/);
  assert.match(migration, /safe_error_code='paymongo_payment_expired'/);
  assert.match(migration, /event\.pancake_order_id=''/);
  assert.match(migration, /event\.event_key LIKE 'paymongo-expired:%'/);
  assert.match(migration, /safe_error_code='paymongo_payment_expired_no_export'/);
});

test('canonical schema permits a skipped Pancake synchronization event', () => {
  const schema = fs.readFileSync(schemaPath, 'utf8');
  assert.match(schema, /pancake_sync_events[\s\S]*status IN \([^)]*'skipped'/);
});
