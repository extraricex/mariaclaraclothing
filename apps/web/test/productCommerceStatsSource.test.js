import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('product pages retain backend-computed commerce statistics after card stats are removed', async () => {
  const [component, card, page] = await Promise.all([
    fs.readFile(new URL('../src/components/ProductCommerceStats.jsx', import.meta.url), 'utf8'),
    fs.readFile(new URL('../src/components/ProductCard.jsx', import.meta.url), 'utf8'),
    fs.readFile(new URL('../src/pages/Product.jsx', import.meta.url), 'utf8')
  ]);

  assert.match(component, /stockDisplayText/);
  assert.match(component, /soldDisplayText/);
  assert.match(component, /aria-label/);
  assert.match(component, /max-w-full/);
  assert.match(component, /break-words/);
  assert.match(component, /aria-hidden="true"/);
  assert.doesNotMatch(card, /<ProductCommerceStats product=\{product\}/);
  assert.match(page, /<ProductCommerceStats product=\{product\}/);
  assert.doesNotMatch(card, /150\+ sold/);
  assert.doesNotMatch(component, /Math\.random|localStorage|viewer/);
});

test('admin exposes global display settings and audited per-product historical controls', async () => {
  const [settings, editor] = await Promise.all([
    fs.readFile(new URL('../src/admin/Settings.jsx', import.meta.url), 'utf8'),
    fs.readFile(new URL('../src/admin/ProductEditor.jsx', import.meta.url), 'utf8')
  ]);

  assert.match(settings, /Product Card Sales Information/);
  assert.match(settings, /showRemainingStockGlobally/);
  assert.match(settings, /showSoldCountGlobally/);
  assert.match(settings, /defaultLowStockThreshold/);
  assert.match(settings, /soldCountFormatting/);
  assert.match(settings, /includeVerifiedHistoricalSales/);
  assert.match(editor, /Verified Historical Sold Quantity/);
  assert.match(editor, /Historical Sales Source/);
  assert.match(editor, /Historical Sales Note/);
  assert.match(editor, /Website eligible units sold/);
  assert.match(editor, /Refund or return deduction/);
  assert.match(editor, /Final displayed sold count/);
});
