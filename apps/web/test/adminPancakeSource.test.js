import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const sourceRoot = path.join(import.meta.dirname, '..', 'src');

test('admin routes and navigation expose the Pancake POS foundation page', async () => {
  const app = await readFile(path.join(sourceRoot, 'App.jsx'), 'utf8');
  const layout = await readFile(path.join(sourceRoot, 'admin', 'AdminLayout.jsx'), 'utf8');
  assert.match(app, /const PancakePos = lazy\(\(\) => import\('\.\/admin\/PancakePos\.jsx'\)\)/);
  assert.match(app, /path="pancake" element=\{<PancakePos \/>\}/);
  assert.match(layout, /to: '\/admin\/pancake', label: 'Pancake POS'/);
});

test('Pancake admin page is simplified, responsive, and can test the safe connection', async () => {
  const page = await readFile(path.join(sourceRoot, 'admin', 'PancakePos.jsx'), 'utf8');
  assert.match(page, /\/api\/admin\/integrations\/pancake\/status/);
  assert.match(page, /\/api\/admin\/integrations\/pancake\/test-connection/);
  assert.match(page, /Test connection/);
  assert.match(page, /Live mode sends new website orders to Pancake immediately/);
  assert.match(page, /Background polling keeps catalog and inventory aligned automatically/);
  assert.match(page, /Refresh status/);
  assert.match(page, /Advanced mapping and reference settings/);
  assert.match(page, /admin-page-header/);
  assert.match(page, /admin-metric-card/);
  assert.match(page, /admin-table-shell/);
  assert.match(page, /grid-cols-1/);
  assert.match(page, /Credentials are managed on the API server/);
  assert.doesNotMatch(page, /PANCAKE_API_KEY|PANCAKE_WEBHOOK_SECRET|type="password"/);
});

test('Pancake admin page keeps catalog mapping controls inside advanced details', async () => {
  const page = await readFile(path.join(sourceRoot, 'admin', 'PancakePos.jsx'), 'utf8');
  for (const endpoint of ['/catalog/status', '/catalog/import', '/catalog/mappings', '/references', '/references/selection']) {
    assert.match(page, new RegExp(endpoint.replaceAll('/', '\\/')));
  }
  for (const label of ['Catalog & inventory', 'Advanced mapping and reference settings', 'Mapping coverage', 'Price unit', 'Shop', 'Warehouse', 'Order source', 'Safe conflict code']) {
    assert.match(page, new RegExp(label, 'i'));
  }
  assert.match(page, /<details/);
  assert.match(page, /grid-cols-1/);
  assert.match(page, /overflow-x-auto/);
  assert.match(page, /conflictOnly/);
  assert.doesNotMatch(page, /PANCAKE_API_KEY|PANCAKE_WEBHOOK_SECRET|type="password"/);
});

test('Pancake admin page exposes inventory reconciliation controls', async () => {
  const page = await readFile(path.join(sourceRoot, 'admin', 'PancakePos.jsx'), 'utf8');
  for (const endpoint of ['/inventory/status', '/inventory/reconcile']) {
    assert.match(page, new RegExp(endpoint.replaceAll('/', '\\/')));
  }
  for (const label of ['Auto sync', 'Catalog & inventory', 'Inventory checked', 'Stock updates']) {
    assert.match(page, new RegExp(label, 'i'));
  }
  assert.match(page, /adminSend\('POST', `\$\{base\}\/inventory\/reconcile`/);
  assert.doesNotMatch(page, />Run sync now</);
  assert.doesNotMatch(page, /create Pancake order now|PANCAKE_API_KEY|PANCAKE_WEBHOOK_SECRET|type="password"/i);
});

test('Pancake admin page exposes modern order sync controls with live status copy', async () => {
  const page = await readFile(path.join(sourceRoot, 'admin', 'PancakePos.jsx'), 'utf8');
  for (const endpoint of ['/orders/status', '/orders/shadow-build']) {
    assert.match(page, new RegExp(endpoint.replaceAll('/', '\\/')));
  }
  for (const label of ['Order sync', 'Sent means the live Pancake order', 'Queued', 'Sent', 'Failed', 'Blocked']) {
    assert.match(page, new RegExp(label, 'i'));
  }
  assert.match(page, /adminSend\('POST', `\$\{base\}\/orders\/shadow-build`/);
  assert.doesNotMatch(page, /create Pancake order now|live order export|PANCAKE_API_KEY|PANCAKE_WEBHOOK_SECRET|type="password"/i);
});
