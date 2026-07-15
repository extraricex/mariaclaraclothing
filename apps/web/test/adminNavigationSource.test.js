import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('admin sidebar renders an expandable orders dropdown with draft and abandoned checkout links', async () => {
  const source = await readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'AdminLayout.jsx'), 'utf8');

  assert.match(source, /ORDER_SUBNAV/);
  assert.match(source, /PRODUCT_SUBNAV/);
  assert.match(source, /Draft/);
  assert.match(source, /Abandoned Checkout/);
  assert.match(source, /Inventory/);
  assert.match(source, /\/admin\/products/);
  assert.match(source, /\/admin\/collections/);
  assert.match(source, /\/admin\/inventory/);
  assert.match(source, /\/admin\/orders\/draft/);
  assert.match(source, /\/admin\/orders\/abandoned-checkout/);
  assert.match(source, /ordersMenuOpen/);
  assert.match(source, /productsMenuOpen/);
  assert.match(source, /ordersMenuOpen,\s*setOrdersMenuOpen\]\s*=\s*useState\(false\)/);
  assert.match(source, /aria-expanded=\{ordersMenuOpen\}/);
  assert.match(source, /aria-expanded=\{productsMenuOpen\}/);
  assert.match(source, /rounded-md/);
  assert.match(source, /cursor-pointer/);
  assert.match(source, /hover:border-accent/);
  assert.doesNotMatch(source, /aria-disabled="true"/);
});

test('Products dropdown links to the dedicated product countdown route', async () => {
  const layout = await readFile(
    path.join(import.meta.dirname, '..', 'src', 'admin', 'AdminLayout.jsx'),
    'utf8'
  );
  const app = await readFile(
    path.join(import.meta.dirname, '..', 'src', 'App.jsx'),
    'utf8'
  );

  assert.match(layout, /to: '\/admin\/products\/countdown', label: 'Product page countdown'/);
  assert.ok(layout.indexOf("label: 'Collections'") < layout.indexOf("label: 'Product page countdown'"));
  assert.ok(layout.indexOf("label: 'Product page countdown'") < layout.indexOf("label: 'Inventory'"));
  assert.match(app, /import ProductCountdown from '\.\/admin\/ProductCountdown\.jsx'/);
  assert.match(app, /path="products\/countdown" element=\{<ProductCountdown \/>\}/);
  assert.ok(app.indexOf('path="products/countdown"') < app.indexOf('path="products/:slug"'));
});

test('Reviews is a prominent, always-accessible admin navigation item', async () => {
  const layout = await readFile(
    path.join(import.meta.dirname, '..', 'src', 'admin', 'AdminLayout.jsx'),
    'utf8'
  );

  assert.match(layout, /REVIEW_NAV_ITEM = \{ to: '\/admin\/reviews', label: 'Reviews', badge: 'reviews' \}/);
  assert.ok(layout.indexOf('<NavLink to={REVIEW_NAV_ITEM.to}') < layout.indexOf('aria-label={ordersMenuOpen'));
  assert.match(layout, /overflow-y-auto[^"]*lg:sticky[^"]*lg:h-screen/);
  assert.match(layout, /MOBILE_NAV = \[[\s\S]*REVIEW_NAV_ITEM/);
});
