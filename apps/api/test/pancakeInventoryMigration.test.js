const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.join(__dirname, '..', 'db', 'migrations', '20260707_pancake_inventory_tracking.sql');

test('Pancake inventory migration defines reconciliation audit without secrets', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS pancake_inventory_reconciliations/);
  assert.match(sql, /status text NOT NULL CHECK \(status IN \('running','complete','blocked','failed'\)\)/);
  assert.match(sql, /checked_count integer NOT NULL DEFAULT 0/);
  assert.match(sql, /updated_count integer NOT NULL DEFAULT 0/);
  assert.match(sql, /conflict_count integer NOT NULL DEFAULT 0/);
  assert.match(sql, /safe_error_code text NOT NULL DEFAULT ''/);
  assert.doesNotMatch(sql, /api_key|webhook_secret/i);
});

test('fresh schema contains Pancake inventory reconciliation foundation', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS pancake_inventory_reconciliations/);
  assert.match(sql, /pancake_reconcile/);
});
