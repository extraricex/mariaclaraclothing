import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('admin products and editor expose mapped Pancake sync status and retry controls', async () => {
  const products = await readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'Products.jsx'), 'utf8');
  const editor = await readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'ProductEditor.jsx'), 'utf8');
  for (const source of [products, editor]) {
    assert.match(source, /Sync to Pancake POS/);
    assert.match(source, /integrations\/pancake\/products/);
    assert.match(source, /stockMismatch/);
    assert.match(source, /pancakeProductId/);
  }
  assert.match(products, /Sync selected to Pancake/);
  assert.match(products, /Apply oversized template/);
  assert.match(products, /templates\/oversized\/preview/);
  assert.match(editor, /pancakeVariantId/);
  assert.match(editor, /Pancake sync is pending automatic retry/);
});
