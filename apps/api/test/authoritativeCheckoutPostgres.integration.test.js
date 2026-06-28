const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

test('authoritative checkout migration defines durable quote and idempotency state', async () => {
  const migration = await fs.readFile(
    path.join(__dirname, '..', 'db', 'migrations', '20260628_authoritative_checkout.sql'),
    'utf8'
  );
  const schema = await fs.readFile(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');

  for (const sql of [migration, schema]) {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS checkout_quotes/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS checkout_idempotency/);
    assert.match(sql, /confirmation_token_hash/);
    assert.match(sql, /CHECK \(status IN \('in_progress', 'completed'\)\)/);
    assert.match(sql, /consumed_order_number/);
  }
});
