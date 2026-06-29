import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

test('cart page renders product upsells backed by storefront products', async () => {
  const source = await readFile(path.join(import.meta.dirname, '..', 'src', 'pages', 'Cart.jsx'), 'utf8');

  assert.match(source, /fetchProducts/);
  assert.match(source, /cartUpsells/);
  assert.match(source, /You may also love this/);
  assert.match(source, /Add to cart/);
  assert.match(source, /addToCart/);
  assert.match(source, /stockQuantity/);
  assert.match(source, /items\.some/);
});

test('cart item product photos fit inside their thumbnail frame', async () => {
  const source = await readFile(path.join(import.meta.dirname, '..', 'src', 'pages', 'Cart.jsx'), 'utf8');

  assert.match(source, /className="product-photo-blend h-full w-full object-contain"/);
  assert.doesNotMatch(source, /alt=\{item\.productName\} className="h-full w-full object-cover"/);
});
