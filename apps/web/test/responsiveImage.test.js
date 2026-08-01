import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { location: { origin: 'https://mariaclaraclothing.com' } };

const { preloadResponsiveImage, responsiveImageAttributes } = await import('../src/lib/responsiveImage.js');

test('known campaign banners use bounded mobile and desktop WebP sources', () => {
  const attributes = responsiveImageAttributes('/brand/hero1v2-2400.webp');
  assert.match(attributes.srcSet, /hero1v2-1200\.webp 1200w/);
  assert.match(attributes.srcSet, /hero1v2-2400\.webp 2400w/);
  assert.equal(attributes.sizes, '100vw');
});

test('Shopify catalog images request right-sized CDN variants', () => {
  const attributes = responsiveImageAttributes(
    'https://cdn.shopify.com/s/files/example/product.jpg?v=1',
    { sizes: '(min-width: 1024px) 25vw, 50vw', shopifyWidths: [360, 720] }
  );
  assert.match(attributes.srcSet, /width=360 360w/);
  assert.match(attributes.srcSet, /width=720 720w/);
  assert.match(attributes.srcSet, /v=1/);
  assert.equal(attributes.sizes, '(min-width: 1024px) 25vw, 50vw');
});

test('legacy uploads request derivatives that the API can create on demand', () => {
  const attributes = responsiveImageAttributes('/uploads/products/current.webp', { shopifyWidths: [256, 512] });
  assert.match(attributes.srcSet, /current-320\.webp 320w/);
  assert.match(attributes.srcSet, /current-800\.webp 800w/);
});

test('normalized local product uploads use generated card and thumbnail derivatives', () => {
  const attributes = responsiveImageAttributes(
    '/uploads/products/current-optimized.webp',
    { sizes: '64px', shopifyWidths: [128, 256] }
  );
  assert.match(attributes.srcSet, /current-320\.webp 320w/);
  assert.equal(attributes.sizes, '64px');
  const galleryAttributes = responsiveImageAttributes(
    '/uploads/products/current-optimized.webp',
    { shopifyWidths: [480, 960, 1600] }
  );
  assert.match(galleryAttributes.srcSet, /current-1600\.webp 1600w/);
});

test('preloading uses the same responsive candidates as the rendered image', () => {
  const image = {};
  preloadResponsiveImage(image, '/brand/hero2-2200.webp');
  assert.match(image.srcset, /hero2-1200\.webp/);
  assert.equal(image.sizes, '100vw');
  assert.equal(image.src, '/brand/hero2-2200.webp');
});
