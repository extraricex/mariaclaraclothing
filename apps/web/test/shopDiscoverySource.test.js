import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('shop search and filters use live catalog fields without demo products', async () => {
  const [app, shop, shell] = await Promise.all([
    readFile(path.join(import.meta.dirname, '..', 'src', 'App.jsx'), 'utf8'),
    readFile(path.join(import.meta.dirname, '..', 'src', 'pages', 'Shop.jsx'), 'utf8'),
    readFile(path.join(import.meta.dirname, '..', 'src', 'components', 'Shell.jsx'), 'utf8')
  ]);
  assert.match(app, /path="\/shop"/);
  assert.match(shell, /to: '\/shop', label: 'Shop'/);
  assert.match(shop, /fetchProducts\(\)/);
  assert.match(shop, /Name, SKU, fit, or color/);
  assert.match(shop, /All collections/);
  assert.match(shop, /All sizes/);
  assert.match(shop, /In stock/);
  assert.match(shop, /Minimum price/);
  assert.match(shop, /Price: low to high/);
  assert.match(shop, /results\.map\(\(product, index\) => <ProductCard/);
});

test('homepage loads only the active hero and delays preloading the next real banner', async () => {
  const home = await readFile(path.join(import.meta.dirname, '..', 'src', 'pages', 'Home.jsx'), 'utf8');
  assert.match(home, /const nextBanner = banners\[\(activeHeroIndex \+ 1\) % banners\.length\]/);
  assert.match(home, /window\.setTimeout/);
  assert.match(home, /activeBanner && \(/);
  assert.doesNotMatch(home, /banners\.map\(\(banner, index\) => \(\s*<img/);
});
