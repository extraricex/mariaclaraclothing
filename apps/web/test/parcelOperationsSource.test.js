import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..', 'src');

test('product and order editors expose parcel weights in grams', async () => {
  const product = await readFile(path.join(root, 'admin', 'ProductEditor.jsx'), 'utf8');
  const order = await readFile(path.join(root, 'admin', 'OrderDetail.jsx'), 'utf8');
  assert.match(product, /parcelWeightGrams/);
  assert.match(product, /Parcel weight \(grams\)/);
  assert.match(order, /parcelWeightOverrideGrams/);
  assert.match(order, /Calculated parcel weight/);
});

test('orders table selects all visible orders and exposes indeterminate state', async () => {
  const source = await readFile(path.join(root, 'admin', 'Orders.jsx'), 'utf8');
  assert.match(source, /Select all filtered orders/);
  assert.match(source, /toggleAllVisibleOrders/);
  assert.match(source, /allVisibleSelected/);
  assert.match(source, /someVisibleSelected/);
  assert.match(source, /\.indeterminate\s*=\s*someVisibleSelected/);
});
