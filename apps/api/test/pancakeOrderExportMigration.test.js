const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.join(__dirname, '..', 'db', 'migrations', '20260707_pancake_order_shadow_export.sql');

test('Pancake order shadow migration defines export audit without secrets', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS pancake_order_exports/);
  assert.match(sql, /order_number text NOT NULL/);
  assert.match(sql, /UNIQUE \(order_number\)/);
  assert.match(sql, /status text NOT NULL CHECK \(status IN \('queued','shadow_built','blocked','failed','sent'\)\)/);
  assert.match(sql, /request_payload jsonb NOT NULL DEFAULT '\{\}'::jsonb/);
  assert.match(sql, /safe_error_code text NOT NULL DEFAULT ''/);
  assert.match(sql, /pancake_order_exports_status_idx/);
  assert.doesNotMatch(sql, /api_key|webhook_secret/i);
});

test('fresh schema contains Pancake order shadow export foundation', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS pancake_order_exports/);
  assert.match(sql, /pancake_order_exports_order_number_key/);
});
