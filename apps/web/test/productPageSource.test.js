import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('product page includes reference-style gallery, tabs, and upsell markers', async () => {
  const source = await readFile(path.join(import.meta.dirname, '..', 'src', 'pages', 'Product.jsx'), 'utf8');

  assert.match(source, /aria-label="Previous product image"/);
  assert.match(source, /aria-label="Next product image"/);
  assert.match(source, /product-gallery-dot/);
  assert.match(source, /aria-label=\{`View product image \$\{index \+ 1\}`\}/);
  assert.match(source, /product-gallery-thumbnail/);
  assert.match(source, /scrollIntoView/);
  assert.match(source, /object-contain/);
  assert.match(source, /You May Also Like/);
  assert.match(source, /Add \{freeShippingMinimumItems\} or more item/);
  assert.match(source, /freeShippingEnabled/);
  assert.match(source, /activeDetailTab/);
  assert.match(source, /title: 'Size Chart'/);
  assert.match(source, /View Size Chart/);
  assert.match(source, /sizeChartOpen/);
  assert.match(source, /aria-label="Size chart"/);
  assert.match(source, /displaySectionTitle/);
  assert.match(source, /min-h-11 min-w-11 rounded-full border/);
  assert.match(source, /rounded border border-line/);
  assert.match(source, /btn-ink customer-compact-button min-w-44 flex-1 !rounded/);
  assert.doesNotMatch(source, /border border-ink bg-white text-2xl/);
  assert.doesNotMatch(source, /aspect-\[4\/5\] overflow-hidden border border-line bg-white/);
  assert.doesNotMatch(source, /<details key=\{index\}/);
});
