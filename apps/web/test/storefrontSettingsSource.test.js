import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..', 'src');

test('storeSettings lib fetches the public endpoint with safe fallbacks', async () => {
  const source = await readFile(path.join(root, 'lib', 'storeSettings.js'), 'utf8');

  assert.match(source, /\/api\/storefront-settings/);
  assert.match(source, /DEFAULT_STOREFRONT_SETTINGS/);
  assert.match(source, /export function loadStorefrontSettings/);
  assert.match(source, /export function regionFee/);
  assert.match(source, /export function regionEstimate/);
  assert.match(source, /export function isFreeShipping/);
  assert.match(source, /export function freeShippingHint/);
});

test('checkout uses store settings for shipping and payment methods', async () => {
  const source = await readFile(path.join(root, 'pages', 'Checkout.jsx'), 'utf8');

  assert.match(source, /loadStorefrontSettings/);
  assert.match(source, /name="payment-method"/);
  assert.match(source, /setPaymentMethod/);
  assert.match(source, /method\.instructions/);
  assert.match(source, /regionFee\(/);
  assert.match(source, /isFreeShipping\(/);
  // the hard-coded fee/threshold paths must be gone
  assert.doesNotMatch(source, /feeForRegion/);
  assert.doesNotMatch(source, /cartQuantity\(items\) >= 2/);
  assert.doesNotMatch(source, /paymentMethod: 'cash_on_delivery'/);
});

test('storefront footer shows contact info from store settings', async () => {
  const source = await readFile(path.join(root, 'components', 'Shell.jsx'), 'utf8');

  assert.match(source, /loadStorefrontSettings/);
  assert.match(source, /contactEmail/);
  assert.match(source, /contactNumber/);
  assert.match(source, /socialLinks/);
});
