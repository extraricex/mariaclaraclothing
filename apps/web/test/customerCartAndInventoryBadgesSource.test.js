import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..', 'src');

test('customer cart count is a compact red notification badge near the cart icon', async () => {
  const source = await readFile(path.join(root, 'components', 'Shell.jsx'), 'utf8');

  assert.match(source, /cart-count-badge/);
  assert.match(source, /bg-\[#d71920\]/);
  assert.match(source, /right-0/);
  assert.match(source, /top-0/);
  assert.doesNotMatch(source, /-right-4/);
  assert.doesNotMatch(source, /-top-2/);
});

test('product stock alerts use the original top image badge treatment', async () => {
  const source = await readFile(path.join(root, 'components', 'ProductCard.jsx'), 'utf8');

  assert.match(source, /className="absolute left-1\/2 top-3 -translate-x-1\/2"/);
  assert.doesNotMatch(source, /product-stock-alert/);
  assert.doesNotMatch(source, /bottom-3/);
  assert.match(source, /Sold out/);
  assert.match(source, /Limited pieces/);
});

test('product cards keep total-stock limited pieces logic', async () => {
  const source = await readFile(path.join(root, 'components', 'ProductCard.jsx'), 'utf8');

  assert.doesNotMatch(source, /function hasLimitedStock/);
  assert.match(source, /stock > 0 && stock <= settings\.inventory\.lowStockThreshold/);
  assert.doesNotMatch(source, /bg-\[#b7791f\]/);
  assert.doesNotMatch(source, /border-\[#f6d88b\]/);
});
