const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicDir = path.join(__dirname, '..', 'public');
const pages = ['index.html', 'product.html', 'cart.html', 'checkout.html', 'faq.html', 'shipping-returns.html', 'terms.html'];
const brandAssets = [
  '/brand/logo.png',
  '/brand/hero1.jpg',
  '/brand/hero2.png',
  '/brand/hero1-web.jpg',
  '/brand/hero1v2.jpg',
  '/brand/hero1v2-web.jpg',
  '/brand/hero2-web.jpg',
  '/brand/hero1v2-1200.webp',
  '/brand/hero1v2-2400.webp',
  '/brand/hero2-1200.webp',
  '/brand/hero2-2200.webp',
  '/brand/video-poster.mp4'
];

test('uploaded brand assets are present', () => {
  for (const asset of brandAssets) {
    assert.equal(fs.existsSync(path.join(publicDir, asset)), true, `${asset} should exist`);
  }
});

test('customer pages use the uploaded logo and no temporary logo image', () => {
  for (const page of pages) {
    const html = fs.readFileSync(path.join(publicDir, page), 'utf8');

    assert.match(html, /\/brand\/logo\.png/, `${page} should use uploaded logo`);
    assert.doesNotMatch(html, /images\.unsplash\.com\/photo-1503342217505/, `${page} should not use temporary logo`);
  }
});

test('homepage uses uploaded campaign media', () => {
  const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');

  assert.match(html, /\/brand\/hero1v2-2400\.webp/);
  assert.match(html, /\/brand\/hero2-2200\.webp/);
  assert.match(html, /\/brand\/video-poster\.mp4/);
  assert.doesNotMatch(html, /images\.unsplash\.com/);
});
