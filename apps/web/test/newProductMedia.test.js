import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNewProductBody, validateQueuedProductFiles } from '../src/admin/newProductMedia.js';

function image(name, type = 'image/png', size = 4) {
  return new File([new Uint8Array(size)], name, { type });
}

test('new product media accepts at most eight images of five MB each', () => {
  const front = image('front.png');
  assert.deepEqual(validateQueuedProductFiles([], [front]), [front]);
  assert.throws(() => validateQueuedProductFiles([], [image('notes.txt', 'text/plain')]), /image files/i);
  assert.throws(() => validateQueuedProductFiles([], [image('large.png', 'image/png', (5 * 1024 * 1024) + 1)]), /5 MB/i);
  assert.throws(() => validateQueuedProductFiles([], Array.from({ length: 9 }, (_item, index) => image(`${index}.png`))), /eight/i);
});

test('new product body carries serialized product and ordered images', () => {
  const files = [image('front.png'), image('back.png')];
  const body = buildNewProductBody({ name: 'Queued Shirt', collections: ['New Arrivals'] }, files);
  assert.deepEqual(JSON.parse(body.get('product')).collections, ['New Arrivals']);
  assert.deepEqual(body.getAll('images').map((file) => file.name), ['front.png', 'back.png']);
});
