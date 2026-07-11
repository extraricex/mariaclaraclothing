import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('admin order detail editor exposes contact and address editing while locking inventory items', async () => {
  const source = await readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'OrderDetail.jsx'), 'utf8');

  assert.match(source, /customer:\s*\{/);
  assert.match(source, /fullName:\s*order\.customer\?\.fullName/);
  assert.match(source, /phone:\s*order\.customer\?\.phone/);
  assert.match(source, /email:\s*order\.customer\?\.email/);
  assert.match(source, /items:\s*\(order\.items/);
  assert.match(source, /changes\.customer\s*=\s*form\.customer/);
  assert.doesNotMatch(source, /changes\.items\s*=/);
  assert.match(source, /House \/ Street/);
  assert.match(source, /City \/ Municipality/);
  assert.match(source, /Barangay/);
  assert.match(source, /Province/);
  assert.match(source, /Unit price/);
  assert.doesNotMatch(source, /updateItem/);
  assert.doesNotMatch(source, /removeItem/);
  assert.doesNotMatch(source, /addItem/);
  assert.match(source, /order-detail-shell/);
  assert.match(source, /order-detail-grid/);
  assert.match(source, /order-status-badge/);
  assert.match(source, /Payment pending/);
  assert.match(source, /Unfulfilled/);
  assert.match(source, /Mark as fulfilled/);
  assert.match(source, /Mark as paid/);
  assert.match(source, /Timeline/);
  assert.match(source, /Leave a comment/);
  assert.match(source, /Conversion summary/);
  assert.match(source, /Order risk/);
  assert.match(source, /J&T readiness/);
  assert.match(source, /Notes/);
  assert.match(source, /Customer/);
  assert.match(source, /Billing address/);
  assert.match(source, /Print/);
  assert.match(source, /More actions/);
  assert.doesNotMatch(source, /productSearchQuery/);
  assert.doesNotMatch(source, /Search products to add/);
});

test('admin order detail uses Pancake-style operational sections with real order fields', async () => {
  const source = await readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'OrderDetail.jsx'), 'utf8');

  assert.match(source, /order-detail-workspace/);
  assert.match(source, /order-detail-main-grid/);
  assert.match(source, /Products/);
  assert.match(source, /Order value/);
  assert.match(source, /Payments/);
  assert.match(source, /Extra notes/);
  assert.match(source, /Information/);
  assert.match(source, /Delivery/);
  assert.match(source, /Shipping/);
  assert.match(source, /order-detail-sticky-actions/);
  assert.match(source, /Amount due/);
  assert.match(source, /COD amount/);
  assert.match(source, /No email provided/);
  assert.match(source, /No tracking number yet/);
  assert.match(source, /Number of variations/);
  assert.match(source, /Total quantity/);
  assert.match(source, /Message \/ Checkout note/);
  assert.match(source, /Internal/);
  assert.match(source, /Printing/);
  assert.match(source, /Conversation/);
  assert.match(source, /customerPurchaseValueCents/);
  assert.match(source, /setOrderStatusFromAction/);
});

test('admin order detail uses Grafana-style dark dashboard panels and metrics', async () => {
  const source = await readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'OrderDetail.jsx'), 'utf8');

  assert.match(source, /admin-order-dashboard/);
  assert.match(source, /admin-order-panel/);
  assert.match(source, /admin-order-metric/);
  assert.match(source, /orderMetricCards/);
  assert.match(source, /Pancake POS sync/);
  assert.match(source, /Not synced to Pancake POS/);
  assert.match(source, /Back to Orders/);
  assert.match(source, /bg-\[var\(--admin-bg\)\]/);
  assert.match(source, /bg-\[var\(--admin-panel\)\]/);
  assert.match(source, /border-\[var\(--admin-line\)\]/);
  assert.doesNotMatch(source, /bg-slate-100/);
});

test('admin order detail uses compact balanced grid and clean product display fields', async () => {
  const source = await readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'OrderDetail.jsx'), 'utf8');

  assert.match(source, /adminProductDisplay\.js/);
  assert.match(source, /adminProductDisplayParts/);
  assert.match(source, /cleanName/);
  assert.match(source, /color/);
  assert.match(source, /productCode/);
  assert.match(source, /title=\{item\.productName\}/);
  assert.match(source, /line-clamp-2/);
  assert.match(source, /truncate/);
  assert.match(source, /md:hidden/);
  assert.match(source, /hidden md:grid/);
  assert.match(source, /minmax\(0,1\.6fr\)/);
  assert.match(source, /Action/);
  assert.match(source, /xl:grid-cols-12/);
  assert.match(source, /grid-flow-row-dense/);
  assert.match(source, /xl:col-span-7/);
  assert.match(source, /xl:col-span-5/);
  assert.match(source, /xl:col-span-4/);
  assert.match(source, /text-right/);
});

test('admin order detail renders Pancake sync diagnostics', async () => {
  const source = await readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'OrderDetail.jsx'), 'utf8');

  assert.match(source, /Pancake POS sync details/);
  assert.match(source, /pancakeSyncDetail/);
  assert.match(source, /Pancake POS order ID/);
  assert.match(source, /Last sync time/);
  assert.match(source, /Last Pancake update time/);
  assert.match(source, /Last sync error/);
  assert.match(source, /Product mapping status/);
  assert.match(source, /Inventory sync status/);
});
