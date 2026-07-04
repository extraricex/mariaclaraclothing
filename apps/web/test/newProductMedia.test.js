import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNewProductBody,
  moveQueuedProductImage,
  reorderQueuedProductImages,
  validateNewProduct,
  validateQueuedProductFiles
} from '../src/admin/newProductMedia.js';

function image(name, type = 'image/png', size = 4) {
  return new File([new Uint8Array(size)], name, { type });
}

test('new product media accepts at most eight common images of 40 MB each', () => {
  const front = image('front.png');
  assert.deepEqual(validateQueuedProductFiles([], [front]), [front]);
  const cameraPhotoWithoutMime = image('camera.jpeg', '');
  assert.deepEqual(validateQueuedProductFiles([], [cameraPhotoWithoutMime]), [cameraPhotoWithoutMime]);
  const largeCameraPhoto = image('camera.jpg', 'image/jpeg', 13 * 1024 * 1024);
  assert.deepEqual(validateQueuedProductFiles([], [largeCameraPhoto]), [largeCameraPhoto]);
  assert.throws(() => validateQueuedProductFiles([], [image('notes.txt', 'text/plain')]), /JPG.*PNG/i);
  assert.throws(() => validateQueuedProductFiles([], [image('large.png', 'image/png', (40 * 1024 * 1024) + 1)]), /40 MB/i);
  assert.throws(() => validateQueuedProductFiles([], Array.from({ length: 9 }, (_item, index) => image(`${index}.png`))), /eight/i);
});

test('new product body carries serialized product and ordered images', () => {
  const files = [image('front.png'), image('back.png')];
  const body = buildNewProductBody({ name: 'Queued Shirt', collections: ['New Arrivals'] }, files);
  assert.deepEqual(JSON.parse(body.get('product')).collections, ['New Arrivals']);
  assert.deepEqual(body.getAll('images').map((file) => file.name), ['front.png', 'back.png']);
});

test('queued product photos move to exact cover and gallery positions', () => {
  const photos = [{ id: 'front' }, { id: 'side' }, { id: 'back' }];
  assert.deepEqual(reorderQueuedProductImages(photos, 2, 0).map((photo) => photo.id), ['back', 'front', 'side']);
  assert.deepEqual(moveQueuedProductImage(photos, 2, 'first').map((photo) => photo.id), ['back', 'front', 'side']);
  assert.deepEqual(moveQueuedProductImage(photos, 1, 'left').map((photo) => photo.id), ['side', 'front', 'back']);
  assert.deepEqual(moveQueuedProductImage(photos, 1, 'right').map((photo) => photo.id), ['front', 'back', 'side']);
  assert.deepEqual(moveQueuedProductImage(photos, 0, 'last').map((photo) => photo.id), ['side', 'back', 'front']);
  assert.equal(reorderQueuedProductImages(photos, -1, 2), photos);
});

test('active product validation requires customer-visible product data', () => {
  assert.deepEqual(validateNewProduct({
    product: { name: '', status: 'active', collections: [], variants: [{ stockQuantity: 0 }] },
    priceCents: 0,
    files: []
  }), {
    details: 'Enter a product title.',
    pricing: 'Enter a price greater than zero.',
    collections: 'Select at least one storefront collection.',
    media: 'Add at least one product photo.',
    inventory: 'Enter inventory before publishing an active product.'
  });
});

test('draft products may save with zero stock when other required data is valid', () => {
  assert.deepEqual(validateNewProduct({
    product: {
      name: 'Draft Shirt',
      status: 'draft',
      collections: ['New Arrivals'],
      variants: [{ stockQuantity: 0 }]
    },
    priceCents: 59900,
    files: [image('front.png')]
  }), {});
});
