import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const source = (file) => readFile(path.join(import.meta.dirname, '..', file), 'utf8');

test('shared theme uses the approved two-tone endpoints and keeps typography unchanged', async () => {
  const css = await source('src/index.css');

  assert.match(css, /--color-paper:\s*#f1f1f1;/i);
  assert.match(css, /--color-cream:\s*#f1f1f1;/i);
  assert.match(css, /--color-white:\s*#f1f1f1;/i);
  assert.match(css, /--color-ink:\s*#202020;/i);
  assert.match(css, /--color-accent:\s*#202020;/i);
  assert.match(css, /--color-accent-deep:\s*#202020;/i);
  assert.match(css, /--font-display:\s*"Clash Display", "Archivo Black", sans-serif;/);
  assert.match(css, /--font-body:\s*"Switzer", "Helvetica Neue", sans-serif;/);
  assert.doesNotMatch(css, /Cloister|Old English|Unifraktur/i);
});

test('derived neutral interface tokens use only the approved endpoints', async () => {
  const css = await source('src/index.css');
  const neutralTokens = {
    'ink-soft': 78,
    clay: 65,
    line: 22,
  };

  for (const [token, percentage] of Object.entries(neutralTokens)) {
    assert.match(
      css,
      new RegExp(
        `--color-${token}:\\s*color-mix\\(in srgb, #202020 ${percentage}%, #f1f1f1\\);`,
        'i',
      ),
    );
  }
});

test('customer product photos visually remove flattened light studio backgrounds', async () => {
  const [css, card] = await Promise.all([
    source('src/index.css'),
    source('src/components/ProductCard.jsx'),
  ]);

  assert.match(css, /\.product-photo-blend\s*{[^}]*background-color:\s*transparent;[^}]*mix-blend-mode:\s*darken;[^}]*}/s);
  assert.match(css, /\.admin-main \.product-photo-blend,[^{]*{[^}]*mix-blend-mode:\s*normal;/s);
  assert.match(card, /media-zoom relative isolate aspect-\[4\/5\][^\"]*bg-\[var\(--customer-bg\)\]/);
});

test('shared roots and every active storefront route define shrink and responsive boundaries', async () => {
  const [css, shell, cart, checkoutReview, account, product, breadcrumbs] = await Promise.all([
    source('src/index.css'),
    source('src/components/Shell.jsx'),
    source('src/pages/Cart.jsx'),
    source('src/pages/CheckoutReview.jsx'),
    source('src/pages/Account.jsx'),
    source('src/pages/Product.jsx'),
    source('src/components/Breadcrumbs.jsx'),
  ]);

  assert.match(css, /body,\s*#root\s*{[^}]*min-width:\s*0;[^}]*}/s);
  assert.match(css, /\.table-scroll\s*{[^}]*overflow-x:\s*auto;[^}]*}/s);
  assert.match(shell, /className="[^"]*max-w-7xl min-w-0[^"]*"/);
  assert.match(shell, /className="[^"]*min-w-0 flex-1[^"]*"/);
  assert.match(cart, /<article[^>]*className="flex min-w-0/);
  assert.match(checkoutReview, /<article[^>]*className="flex min-w-0/);
  assert.match(account, /className="flex flex-wrap items-center gap-3"/);
  assert.match(product, /className="mt-6 flex flex-wrap items-center gap-3/);
  assert.match(product, /className="mt-5 grid min-w-0 gap-7[^\"]*md:grid-cols-\[1\.05fr_1fr\][^\"]*lg:grid-cols-\[1\.15fr_1fr\]">\s*<div className="order-1 min-w-0">/);
  assert.match(product, /<div className="order-2 min-w-0">/);
  assert.match(css, /\.storefront-product-grid\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/s);
  assert.match(css, /@media \(min-width: 420px\)[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /@media \(min-width: 768px\)[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(css, /@media \(min-width: 1024px\)[\s\S]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);/);
  assert.match(shell, /hidden overflow-x-auto[^\"]*lg:block/);
  assert.match(breadcrumbs, /hideLongCurrentItemOnPhone[^\n]*items\.length > 2/);
});
