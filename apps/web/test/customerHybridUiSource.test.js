import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..', 'src');
const source = (file) => readFile(path.join(root, file), 'utf8');

test('customer storefront defines shadcn-style local UI primitives', async () => {
  for (const file of [
    'components/ui/Button.jsx',
    'components/ui/Card.jsx',
    'components/ui/Badge.jsx',
    'components/ui/Input.jsx',
    'components/ui/Separator.jsx'
  ]) {
    const content = await source(file);
    assert.match(content, /cn\(/);
    assert.match(content, /className/);
  }
});

test('customer storefront applies the approved hybrid visual system only to customer pages', async () => {
  const [css, home, productCard, product, cart, checkout, shell] = await Promise.all([
    source('index.css'),
    source('pages/Home.jsx'),
    source('components/ProductCard.jsx'),
    source('pages/Product.jsx'),
    source('pages/Cart.jsx'),
    source('pages/Checkout.jsx'),
    source('components/Shell.jsx')
  ]);

  assert.match(css, /--customer-bg/);
  assert.match(css, /\.customer-card/);
  assert.match(css, /\.customer-input/);
  assert.doesNotMatch(home, /Pancake synced orders/i);
  assert.match(home, /Ready to ship/);
  assert.match(home, /customer-hero/);
  assert.match(productCard, /CustomerBadge/);
  assert.match(product, /customer-buy-panel/);
  assert.match(cart, /customer-order-summary/);
  assert.match(checkout, /customer-checkout-shell/);
  assert.match(shell, /customer-cart-sheet/);
});
