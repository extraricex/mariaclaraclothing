import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildStorefrontCollectionSections } from '../src/lib/storefrontCollections.js';
import { DEFAULT_COLLECTION_DEFINITIONS } from '../src/lib/storeSettings.js';

test('homepage renders registered non-empty collections dynamically', async () => {
  const home = await readFile(path.join(import.meta.dirname, '..', 'src', 'pages', 'Home.jsx'), 'utf8');
  const settings = await readFile(path.join(import.meta.dirname, '..', 'src', 'lib', 'storeSettings.js'), 'utf8');

  assert.match(home, /loadStorefrontSettings/);
  assert.match(home, /buildStorefrontCollectionSections/);
  assert.match(home, /collectionSections\.map/);
  assert.doesNotMatch(home, /const newArrivals =/);
  assert.doesNotMatch(home, /const freedom =/);
  assert.match(settings, /name: 'Freedom of Mind'/);
  assert.match(settings, /showOnHomepage: true/);
  assert.doesNotMatch(home, /title="Best Seller"/);
});

test('collection sections preserve existing copy and hide empty registered collections', () => {
  const products = [
    { id: 'one', collections: ['New Arrivals', 'Summer Drop'] },
    { id: 'two', collections: ['Freedom of Mind'] }
  ];
  const sections = buildStorefrontCollectionSections(
    products,
    [
      { name: 'New Arrivals', slug: 'new-arrivals', description: 'Oversized premium shirt.' },
      { name: 'Freedom of Mind', slug: 'freedom-of-mind', description: 'The statement line - graphics for loud thoughts and quiet days.' },
      { name: 'Summer Drop', slug: 'summer-drop', description: 'Explore the latest pieces in Summer Drop.' },
      { name: 'Empty Collection', slug: 'empty-collection' }
    ]
  );

  assert.deepEqual(sections.map(({ id, index, title }) => ({ id, index, title })), [
    { id: 'new-arrivals', index: '01', title: 'New Arrivals' },
    { id: 'freedom-of-mind', index: '02', title: 'Freedom of Mind' },
    { id: 'summer-drop', index: '03', title: 'Summer Drop' }
  ]);
  assert.equal(sections[0].blurb, 'Oversized premium shirt.');
  assert.match(sections[1].blurb, /statement line/);
  assert.equal(sections[2].blurb, 'Explore the latest pieces in Summer Drop.');
  assert.deepEqual(sections[2].products.map((product) => product.id), ['one']);
});

test('best sellers are hidden from storefront collection sections', () => {
  const products = [
    { id: 'new', collections: ['New Arrivals'], successfulOrderCount: 0 },
    { id: 'slow', collections: [], successfulOrderCount: 2 },
    { id: 'top', collections: [], successfulOrderCount: 9 }
  ];
  const sections = buildStorefrontCollectionSections(products, ['Best Sellers']);

  assert.deepEqual(sections, []);
});

test('admin-managed Tees collection includes legacy Catalog assignments', () => {
  const sections = buildStorefrontCollectionSections(
    [{ id: 'legacy-tee', collections: ['Catalog'] }],
    DEFAULT_COLLECTION_DEFINITIONS
  );
  assert.deepEqual(sections.map(({ id, title }) => ({ id, title })), [{ id: 'tees', title: 'Tees' }]);
  assert.deepEqual(sections[0].products.map((product) => product.id), ['legacy-tee']);
});

test('visibility, homepage placement, and order come from collection definitions', () => {
  const products = [
    { id: 'freedom', collections: ['Freedom of Mind'] },
    { id: 'hidden', collections: ['Best Seller'] }
  ];
  const sections = buildStorefrontCollectionSections(products, [
    { name: 'Best Seller', slug: 'best-seller', visible: true, showOnHomepage: false, sortOrder: 0 },
    { name: 'Freedom of Mind', slug: 'freedom-of-mind', visible: true, showOnHomepage: true, sortOrder: 1 }
  ]);
  assert.deepEqual(sections.map((section) => section.title), ['Freedom of Mind']);
});

test('customer collection route has product and empty states', async () => {
  const app = await readFile(path.join(import.meta.dirname, '..', 'src', 'App.jsx'), 'utf8');
  const page = await readFile(path.join(import.meta.dirname, '..', 'src', 'pages', 'Collection.jsx'), 'utf8');
  assert.match(app, /path="\/collections\/:slug"/);
  assert.match(page, /collectionMembers/);
  assert.match(page, /No products linked yet/);
  assert.match(page, /Collection unavailable/);
});

test('admin collection editor controls customer placement and product assignments', async () => {
  const page = await readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'Collections.jsx'), 'utf8');
  assert.match(page, /Collection name/);
  assert.match(page, /Show on Homepage/);
  assert.match(page, /Show in Shop categories/);
  assert.match(page, /Sort order/);
  assert.match(page, /Upload image/);
  assert.match(page, /Product assignment updated/);
});
