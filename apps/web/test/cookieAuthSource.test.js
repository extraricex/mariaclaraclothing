import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const source = (relativePath) => readFile(path.join(import.meta.dirname, '..', 'src', relativePath), 'utf8');

test('admin client uses cookie credentials and CSRF without browser-stored bearer tokens', async () => {
  const adminApi = await source('lib/adminApi.js');
  assert.match(adminApi, /credentials:\s*'same-origin'/);
  assert.match(adminApi, /mc_admin_csrf/);
  assert.match(adminApi, /X-CSRF-Token/);
  assert.match(adminApi, /\/api\/admin\/logout/);
  assert.doesNotMatch(adminApi, /localStorage/);
  assert.doesNotMatch(adminApi, /Authorization/);
  assert.doesNotMatch(adminApi, /maria-clara-admin-token/);
});

test('customer client uses cookie credentials and CSRF without browser-stored bearer tokens', async () => {
  const customerAuth = await source('lib/customerAuth.js');
  assert.match(customerAuth, /credentials:\s*'same-origin'/);
  assert.match(customerAuth, /mc_customer_csrf/);
  assert.match(customerAuth, /X-CSRF-Token/);
  assert.match(customerAuth, /\/api\/customer\/logout/);
  assert.doesNotMatch(customerAuth, /localStorage/);
  assert.doesNotMatch(customerAuth, /Authorization/);
  assert.doesNotMatch(customerAuth, /maria-clara-customer-token/);
});

test('checkout relies on the customer session cookie instead of a bearer header', async () => {
  const checkout = await source('pages/Checkout.jsx');
  assert.doesNotMatch(checkout, /getCustomerToken/);
  assert.doesNotMatch(checkout, /['"]Authorization['"]\s*:/);
});
