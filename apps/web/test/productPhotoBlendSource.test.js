import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const source = (file) => readFile(path.join(import.meta.dirname, '..', file), 'utf8');

test('product photos blend into the site background without affecting brand media', async () => {
  const css = await source('src/index.css');
  assert.match(css, /\.product-photo-blend\s*{[^}]*mix-blend-mode:\s*multiply;[^}]*}/s);

  const productFiles = new Map([
    ['src/components/ProductCard.jsx', 2],
    ['src/components/Shell.jsx', 1],
    ['src/pages/Product.jsx', 1],
    ['src/pages/Cart.jsx', 2],
    ['src/pages/Checkout.jsx', 1],
    ['src/admin/Collections.jsx', 1],
    ['src/admin/Products.jsx', 1],
    ['src/admin/OrderDetail.jsx', 1],
    ['src/admin/ProductEditor.jsx', 1]
  ]);

  for (const [file, minimumUses] of productFiles) {
    const contents = await source(file);
    const uses = contents.match(/product-photo-blend/g) || [];
    assert.ok(uses.length >= minimumUses, `${file} must blend every product-photo call site`);
  }

  for (const file of [
    'src/pages/Home.jsx',
    'src/admin/Banners.jsx',
    'src/admin/AdminLayout.jsx',
    'src/admin/Login.jsx'
  ]) {
    assert.doesNotMatch(await source(file), /product-photo-blend/, `${file} contains brand media, not product photos`);
  }
});

test('product card hover paints only one blended photo at a time', async () => {
  const card = await source('src/components/ProductCard.jsx');

  assert.match(card, /className="product-photo-blend h-full w-full object-contain group-hover:hidden"/);
  assert.match(card, /className="product-photo-blend absolute inset-0 hidden h-full w-full object-contain group-hover:block"/);
  assert.doesNotMatch(card, /product-photo-blend[^"\n]*group-hover:opacity-100/);
});
