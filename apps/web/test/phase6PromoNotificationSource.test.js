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

  assert.match(source, /fetchActivePromoNotification/);
  assert.match(source, /promoNotification/);
  assert.match(source, /promo-notification/);
  assert.match(source, /sessionStorage/);
  assert.match(source, /maria-clara-promo-notification-dismissed/);
  assert.match(source, /setPromoNotification\(null\)/);
  assert.match(source, /aria-label="Close promo notification"/);
});
