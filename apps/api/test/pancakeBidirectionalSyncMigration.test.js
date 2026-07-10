const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('Pancake bidirectional sync migration creates durable link event log and snapshot tables', () => {
  const sql = fs.readFileSync(path.join(root, 'db', 'migrations', '20260710_pancake_bidirectional_sync.sql'), 'utf8');

  for (const table of ['pancake_order_links', 'pancake_sync_events', 'pancake_sync_logs', 'pancake_order_snapshots']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(sql, /UNIQUE \(pancake_order_id\)/);
  assert.match(sql, /UNIQUE \(direction, entity_type, entity_id, event_key\)/);
  assert.match(sql, /next_attempt_at/);
  assert.match(sql, /payload_hash/);
  assert.match(sql, /safe_error_code/);
  assert.doesNotMatch(sql, /api_key|PANCAKE_API_KEY|webhook_secret/i);
});

test('base schema includes Pancake bidirectional sync tables', () => {
  const sql = fs.readFileSync(path.join(root, 'db', 'schema.sql'), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS pancake_order_links/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS pancake_sync_events/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS pancake_sync_logs/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS pancake_order_snapshots/);
});
