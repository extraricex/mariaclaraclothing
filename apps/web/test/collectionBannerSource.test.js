import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = path.join(import.meta.dirname, '..');

test('homepage places the persisted banner immediately before Freedom of Mind', async () => {
  const source = await readFile(path.join(root, 'src', 'pages', 'Home.jsx'), 'utf8');
  assert.match(source, /isFreedomOfMind/);
  assert.match(source, /<CollectionBanner banner=\{collectionBanner\} \/>[\s\S]*<CollectionSection/);
  assert.match(source, /compactTop=\{hasCollectionBanner\}/);
});

test('collection banner is responsive, lazy, linked, and collapses on failure', async () => {
  const source = await readFile(path.join(root, 'src', 'components', 'CollectionBanner.jsx'), 'utf8');
  assert.match(source, /<picture>/);
  assert.match(source, /media="\(max-width: 639px\)"/);
  assert.match(source, /loading="lazy"/);
  assert.match(source, /if \(!banner\?\.visible \|\| !desktopImage\.url \|\| failed\) return null/);
  assert.match(source, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.match(source, /openInNewTab/);
});

test('website content exposes complete collection banner controls', async () => {
  const source = await readFile(path.join(root, 'src', 'admin', 'CollectionBannerEditor.jsx'), 'utf8');
  assert.match(source, /collection-banner\/images\/\$\{slot\}/);
  assert.match(source, /site-content\/collection-banner/);
  assert.match(source, /Collection banner updated successfully\./);
  assert.match(source, /Desktop image/);
  assert.match(source, /Mobile image \(optional\)/);
  assert.match(source, /Banner visibility/);
  assert.match(source, /Open link in new tab/);
  assert.match(source, /Alternative text/);
  assert.match(source, /Overlay opacity/);
});
