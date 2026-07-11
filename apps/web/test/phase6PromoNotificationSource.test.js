import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..', 'src');

test('web API exposes active promo notification helper', async () => {
  const source = await readFile(path.join(root, 'lib', 'api.js'), 'utf8');

  assert.match(source, /export function fetchActivePromoNotification/);
  assert.match(source, /\/api\/discounts\/active-notification/);
});

test('customer shell renders dismissible active promo notification', async () => {
  const source = await readFile(path.join(root, 'components', 'Shell.jsx'), 'utf8');

  assert.doesNotMatch(source, /fetchActivePromoNotification/);
  assert.doesNotMatch(source, /promoNotification/);
  assert.doesNotMatch(source, /promo-notification/);
  assert.doesNotMatch(source, /maria-clara-promo-notification-dismissed/);
  assert.doesNotMatch(source, /aria-label="Close promo notification"/);
});
