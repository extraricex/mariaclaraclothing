import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const file = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('storefront shares card catalog and site-content promises across routes', async () => {
  const api = await file('src/lib/api.js');
  assert.match(api, /catalogProductsPromise/);
  assert.match(api, /siteContentPromise/);
  assert.match(api, /\/api\/products\?view=card/);
  assert.match(api, /invalidateCatalogProducts/);
  assert.match(api, /invalidateSiteContent/);
});

test('touch devices never receive a hover-image src and first-row images are prioritized', async () => {
  const [card, hook, home] = await Promise.all([
    file('src/components/ProductCard.jsx'),
    file('src/hooks/useHoverCapability.js'),
    file('src/pages/Home.jsx')
  ]);
  assert.match(hook, /\(hover: hover\) and \(pointer: fine\)/);
  assert.match(card, /canHover && hoverImage/);
  assert.match(card, /loading=\{eager \? 'eager' : 'lazy'\}/);
  assert.match(home, /eagerImages=\{sectionIndex === 0\}/);
});

test('logos, fonts, lower homepage sections, and route chunks use optimized delivery', async () => {
  const [html, css, shell, responsive, prefetch] = await Promise.all([
    file('index.html'),
    file('src/index.css'),
    file('src/components/Shell.jsx'),
    file('src/lib/responsiveImage.js'),
    file('src/lib/routePrefetch.js')
  ]);
  assert.doesNotMatch(html, /api\.fontshare\.com/);
  assert.match(html, /preload" href="\/fonts\/clash-display-600\.woff2"/);
  assert.match(css, /storefront-deferred-section[\s\S]*content-visibility: auto/);
  assert.match(shell, /footerLogo[\s\S]*loading="lazy"/);
  assert.match(responsive, /logo-256\.webp/);
  assert.match(prefetch, /connection\?\.saveData/);
  assert.match(prefetch, /import\('\.\.\/pages\/Product\.jsx'\)/);
});
