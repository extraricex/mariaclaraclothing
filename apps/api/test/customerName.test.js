const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { customerFullName, normalizeCustomerName } = require('../src/customers/customerName');

test('customer names preserve separate values and a combined display name', () => {
  assert.deepEqual(normalizeCustomerName({
    firstName: ' Maria ', lastName: ' Dela Cruz ', fullName: 'stale value'
  }), {
    firstName: 'Maria', lastName: 'Dela Cruz', fullName: 'Maria Dela Cruz'
  });
});

test('legacy orders with only fullName remain readable', () => {
  assert.deepEqual(normalizeCustomerName({ fullName: 'Maria Clara Santos' }), {
    firstName: 'Maria', lastName: 'Clara Santos', fullName: 'Maria Clara Santos'
  });
  assert.equal(customerFullName({ customer_name: 'Legacy Customer' }), 'Legacy Customer');
});

test('customer account schema and migration persist separate name fields', () => {
  const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  const migration = fs.readFileSync(
    path.join(__dirname, '../db/migrations/20260713_customer_name_parts.sql'),
    'utf8'
  );

  assert.match(schema, /first_name\s+TEXT/i);
  assert.match(schema, /last_name\s+TEXT/i);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS first_name TEXT/i);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS last_name TEXT/i);
  assert.match(migration, /UPDATE customer_accounts/i);
});
