import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..', 'src');

test('cart lib exposes a cart drawer open event helper', async () => {
  const source = await readFile(path.join(root, 'lib', 'cart.js'), 'utf8');

  assert.match(source, /export const CART_DRAWER_EVENT/);
  assert.match(source, /export function openCartDrawer/);
  assert.match(source, /window\.dispatchEvent\(new Event\(CART_DRAWER_EVENT\)\)/);
});

test('product add-to-cart opens the cart drawer', async () => {
  const source = await readFile(path.join(root, 'pages', 'Product.jsx'), 'utf8');

  assert.match(source, /openCartDrawer/);
  assert.match(source, /const result = addToCart\(\{ \.\.\.cartItem \}\);/);
  assert.match(source, /if \(result\?\.limited\)/);
  assert.match(source, /openCartDrawer\(\);/);
});

test('shell renders a quote-backed cart drawer', async () => {
  const source = await readFile(path.join(root, 'components', 'Shell.jsx'), 'utf8');

  assert.match(source, /CART_DRAWER_EVENT/);
  assert.match(source, /createCheckoutQuote/);
  assert.match(source, /cartDrawerOpen/);
  assert.match(source, /setCartDrawerOpen\(true\)/);
  assert.match(source, /window\.addEventListener\(CART_DRAWER_EVENT/);
  assert.match(source, /Your cart/);
  assert.match(source, /Checkout/);
  assert.match(source, /View cart/);
  assert.match(source, /quote\?\.subtotalCents/);
  assert.match(source, /quote\?\.discountTotalCents/);
  assert.match(source, /quote\?\.shippingFeeCents/);
  assert.match(source, /quote\?\.totalCents/);
  assert.match(source, /increaseItem\(item\)/);
  assert.match(source, /decreaseItem\(item\)/);
  assert.match(source, /removeFromCart\(item\.variantId\)/);
});
