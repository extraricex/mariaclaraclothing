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
    clay: 58,
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

test('shared roots and every active storefront route define shrink and overflow boundaries', async () => {
  const [css, shell, cart, checkout, account, product] = await Promise.all([
    source('src/index.css'),
    source('src/components/Shell.jsx'),
    source('src/pages/Cart.jsx'),
    source('src/pages/Checkout.jsx'),
    source('src/pages/Account.jsx'),
    source('src/pages/Product.jsx'),
  ]);

  assert.match(css, /body,\s*#root\s*{[^}]*min-width:\s*0;[^}]*}/s);
  assert.match(css, /\.table-scroll\s*{[^}]*overflow-x:\s*auto;[^}]*}/s);
  assert.match(shell, /className="[^"]*max-w-7xl min-w-0[^"]*"/);
  assert.match(shell, /className="[^"]*min-w-0 flex-1[^"]*"/);
  assert.match(cart, /<article[^>]*className="flex min-w-0/);
  assert.match(checkout, /<article[^>]*className="flex min-w-0/);
  assert.match(account, /className="flex flex-wrap items-center gap-3"/);
  assert.match(product, /className="mt-6 flex flex-wrap items-center gap-3/);
});
