import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('admin exposes a responsive Meta order reconciliation screen', async () => {
  const root = path.join(import.meta.dirname, '..', 'src');
  const [app, layout, analytics, page] = await Promise.all([
    readFile(path.join(root, 'App.jsx'), 'utf8'),
    readFile(path.join(root, 'admin', 'AdminLayout.jsx'), 'utf8'),
    readFile(path.join(root, 'admin', 'Analytics.jsx'), 'utf8'),
    readFile(path.join(root, 'admin', 'MetaReconciliation.jsx'), 'utf8')
  ]);

  assert.match(app, /MetaReconciliation/);
  assert.match(app, /path="analytics\/meta-reconciliation"/);
  assert.match(layout, /META_RECONCILIATION_NAV_ITEM/);
  assert.match(layout, /\/admin\/analytics\/meta-reconciliation/);
  assert.match(analytics, /Reconcile website, Pancake, and Meta orders/);
  assert.match(page, /\/api\/admin\/analytics\/meta-reconciliation/);
  assert.match(page, /Asia\/Manila/);
  assert.match(page, /Live Pancake comparison/);
  assert.match(page, /ads_read/);
  assert.match(page, /automatic Event Setup rules/);
  assert.match(page, /hidden overflow-x-auto lg:block/);
  assert.match(page, /grid gap-3 lg:hidden/);
  assert.match(page, /Customer email, phone, and address are intentionally excluded/);
  assert.match(page, /eventCoverage/);
  assert.match(page, /Browser and CAPI event coverage/);
  for (const eventName of ['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'AddPaymentInfo']) {
    assert.match(page, new RegExp(eventName));
  }
});
