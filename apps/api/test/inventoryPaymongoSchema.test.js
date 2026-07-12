const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('inventory outbox and PayMongo migration is durable, idempotent, and indexed', () => {
  const migration = fs.readFileSync(path.join(root, 'db/migrations/20260712_inventory_outbox_paymongo.sql'), 'utf8');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS pancake_inventory_outbox/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS pancake_inventory_state/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS pancake_inventory_sync_logs/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS paymongo_webhook_events/);
  assert.match(migration, /event_id text PRIMARY KEY/);
  assert.match(migration, /orders_provider_checkout_session_idx/);
});
