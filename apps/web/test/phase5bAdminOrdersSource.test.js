import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const webRoot = path.join(import.meta.dirname, '..', 'src');
const repoRoot = path.join(import.meta.dirname, '..', '..', '..');

test('admin order API summary exposes saved promo fields for the order list', async () => {
  const source = await readFile(path.join(repoRoot, 'apps', 'api', 'src', 'routes', 'admin.js'), 'utf8');

  assert.match(source, /discountCode:\s*order\.discountCode/);
  assert.match(source, /discountTotalCents:\s*order\.discountTotalCents/);
  assert.match(source, /discountSnapshot:\s*order\.discountSnapshot/);
});

test('admin orders list supports inline status changes and promo display', async () => {
  const source = await readFile(path.join(webRoot, 'admin', 'Orders.jsx'), 'utf8');

  assert.match(source, /adminSend/);
  assert.match(source, /updateOrderStatus/);
  assert.match(source, /PATCH', `\/api\/admin\/orders\/\$\{encodeURIComponent\(order\.orderNumber\)\}`/);
  assert.match(source, /setOrders\(\(previous\) => previous\.map/);
  assert.match(source, /Promo/);
  assert.match(source, /promoLabel/);
  assert.match(source, /discountSnapshot/);
  assert.match(source, /discountTotalCents/);
});

test('admin order detail shows saved promo snapshot and discount-aware totals', async () => {
  const source = await readFile(path.join(webRoot, 'admin', 'OrderDetail.jsx'), 'utf8');

  assert.match(source, /promoSnapshot/);
  assert.match(source, /Promo snapshot/);
  assert.match(source, /discountTotalCents/);
  assert.match(source, /Discount/);
  assert.match(source, /freeShippingApplied/);
  assert.match(source, /appliedRule/);
  assert.match(source, /subtotalCents - discountTotalCents \+ Number\(order\.shippingFeeCents/);
  assert.match(source, /storedTotalCents = Number\(order\.totalCents\)/);
  assert.match(source, /\? storedTotalCents\s*:\s*calculatedTotalCents/);
});
