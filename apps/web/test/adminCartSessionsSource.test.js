import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('storefront cart and checkout sync cart sessions to the API', async () => {
  const cartSource = await readFile(path.join(import.meta.dirname, '..', 'src', 'lib', 'cart.js'), 'utf8');
  const checkoutSource = await readFile(path.join(import.meta.dirname, '..', 'src', 'pages', 'Checkout.jsx'), 'utf8');

  assert.match(cartSource, /CART_SESSION_KEY/);
  assert.match(cartSource, /getCartSessionId/);
  assert.match(cartSource, /resetCartSessionId/);
  assert.match(cartSource, /syncCartSession/);
  assert.match(cartSource, /\/api\/cart-sessions\/\$\{encodeURIComponent\(sessionId\)\}/);
  assert.match(checkoutSource, /syncCartSession/);
  assert.match(checkoutSource, /checkoutStarted:\s*true/);
  assert.match(checkoutSource, /cartSessionId:\s*getCartSessionId\(\)/);
  assert.match(checkoutSource, /resetCartSessionId\(\)/);
});

test('admin has real draft and abandoned checkout pages backed by cart sessions API', async () => {
  const appSource = await readFile(path.join(import.meta.dirname, '..', 'src', 'App.jsx'), 'utf8');
  const layoutSource = await readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'AdminLayout.jsx'), 'utf8');
  const pageSource = await readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'CartSessions.jsx'), 'utf8');

  assert.match(appSource, /CartSessions/);
  assert.match(appSource, /orders\/draft/);
  assert.match(appSource, /orders\/abandoned-checkout/);
  assert.match(layoutSource, /\/admin\/orders\/draft/);
  assert.match(layoutSource, /\/admin\/orders\/abandoned-checkout/);
  assert.match(pageSource, /\/api\/admin\/cart-sessions\?status=\$\{status\}/);
  assert.match(pageSource, /Anonymous/);
  assert.match(pageSource, /formatMoney/);
});
