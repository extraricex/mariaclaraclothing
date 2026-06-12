import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('admin sidebar renders an expandable orders dropdown with draft and abandoned checkout links', async () => {
  const source = await readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'AdminLayout.jsx'), 'utf8');

  assert.match(source, /ORDER_SUBNAV/);
  assert.match(source, /Draft/);
  assert.match(source, /Abandoned Checkout/);
  assert.match(source, /\/admin\/orders\/draft/);
  assert.match(source, /\/admin\/orders\/abandoned-checkout/);
  assert.match(source, /ordersMenuOpen/);
  assert.match(source, /aria-expanded=\{ordersMenuOpen\}/);
  assert.doesNotMatch(source, /aria-disabled="true"/);
});
