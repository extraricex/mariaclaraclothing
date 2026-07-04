import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const sourceRoot = path.join(import.meta.dirname, '..', 'src');

test('admin routes and navigation expose the Pancake POS foundation page', async () => {
  const app = await readFile(path.join(sourceRoot, 'App.jsx'), 'utf8');
  const layout = await readFile(path.join(sourceRoot, 'admin', 'AdminLayout.jsx'), 'utf8');
  assert.match(app, /import PancakePos from '\.\/admin\/PancakePos\.jsx'/);
  assert.match(app, /path="pancake" element=\{<PancakePos \/>\}/);
  assert.match(layout, /to: '\/admin\/pancake', label: 'Pancake POS'/);
});

test('Pancake admin page is read-only, responsive, and can test the safe connection', async () => {
  const page = await readFile(path.join(sourceRoot, 'admin', 'PancakePos.jsx'), 'utf8');
  assert.match(page, /\/api\/admin\/integrations\/pancake\/status/);
  assert.match(page, /\/api\/admin\/integrations\/pancake\/test-connection/);
  assert.match(page, /Test connection/);
  assert.match(page, /Read-only foundation/);
  assert.match(page, /grid-cols-1/);
  assert.match(page, /Credentials are managed on the API server/);
  assert.doesNotMatch(page, /PANCAKE_API_KEY|PANCAKE_WEBHOOK_SECRET|type="password"/);
});

test('Pancake admin page exposes responsive Phase 2 catalog mapping controls', async () => {
  const page = await readFile(path.join(sourceRoot, 'admin', 'PancakePos.jsx'), 'utf8');
  for (const endpoint of ['/catalog/status', '/catalog/import', '/catalog/mappings', '/references', '/references/selection']) {
    assert.match(page, new RegExp(endpoint.replaceAll('/', '\\/')));
  }
  for (const label of ['Import catalog', 'Read-only', 'Mapping coverage', 'Currency', 'Price unit', 'Shop', 'Warehouse', 'Order source', 'Safe conflict code']) {
    assert.match(page, new RegExp(label, 'i'));
  }
  assert.match(page, /grid-cols-1/);
  assert.match(page, /overflow-x-auto/);
  assert.match(page, /conflictOnly/);
  assert.doesNotMatch(page, /PANCAKE_API_KEY|PANCAKE_WEBHOOK_SECRET|type="password"/);
});
