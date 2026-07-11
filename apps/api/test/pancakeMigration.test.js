const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.join(__dirname, '..', 'db', 'migrations', '20260704_pancake_connection_foundation.sql');

test('Pancake foundation migration stores safe connection health without secrets', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS pancake_connections/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS pancake_connection_checks/);
  assert.match(sql, /CHECK \(mode IN \('disabled', 'read_only', 'shadow', 'live'\)\)/);
  assert.match(sql, /pancake_connection_checks_created_at_idx/);
  assert.doesNotMatch(sql, /api_key|webhook_secret/i);
});

test('fresh database schema includes the Pancake foundation tables', () => {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS pancake_connections/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS pancake_connection_checks/);
});
