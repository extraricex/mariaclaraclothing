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

test('product stock alerts sit near the bottom of the product image', async () => {
  const source = await readFile(path.join(root, 'components', 'ProductCard.jsx'), 'utf8');

  assert.match(source, /className="product-stock-alert absolute bottom-2 left-1\/2 -translate-x-1\/2/);
  assert.doesNotMatch(source, /top-3/);
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

test('customer variant quantity controls respect per-size stock limits', async () => {
  const [product, cart, shell, checkout] = await Promise.all([
    readFile(path.join(root, 'pages', 'Product.jsx'), 'utf8'),
    readFile(path.join(root, 'pages', 'Cart.jsx'), 'utf8'),
    readFile(path.join(root, 'components', 'Shell.jsx'), 'utf8'),
    readFile(path.join(root, 'pages', 'Checkout.jsx'), 'utf8')
  ]);

  assert.match(product, /variantStock/);
  assert.match(product, /maxStock: variantStock/);
  assert.match(product, /Only 1 piece left for this size\./);
  assert.match(product, /Maximum available quantity added\./);
  assert.match(product, /disabled=\{variantSoldOut \|\| quantity >= variantStock\}/);
  assert.match(cart, /maxStock: Number\(variant\.stockQuantity \|\| 0\)/);
  assert.match(cart, /Only \$\{item\.maxStock\} \$\{item\.size\} left in stock\./);
  assert.match(cart, /disabled=\{Number\(item\.maxStock\) > 0 && Number\(item\.quantity\) >= Number\(item\.maxStock\)\}/);
  assert.match(shell, /Maximum available quantity added\./);
  assert.match(shell, /disabled=\{Number\(item\.maxStock\) > 0 && Number\(item\.quantity\) >= Number\(item\.maxStock\)\}/);
  assert.match(checkout, /Maximum available quantity added\./);
  assert.match(checkout, /disabled=\{Number\(item\.maxStock\) > 0 && Number\(item\.quantity\) >= Number\(item\.maxStock\)\}/);
});
