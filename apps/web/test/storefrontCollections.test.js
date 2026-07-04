import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildStorefrontCollectionSections } from '../src/lib/storefrontCollections.js';

test('homepage renders registered non-empty collections dynamically', async () => {
  const home = await readFile(path.join(import.meta.dirname, '..', 'src', 'pages', 'Home.jsx'), 'utf8');
  const settings = await readFile(path.join(import.meta.dirname, '..', 'src', 'lib', 'storeSettings.js'), 'utf8');

  assert.match(home, /loadStorefrontSettings/);
  assert.match(home, /buildStorefrontCollectionSections/);
  assert.match(home, /collectionSections\.map/);
  assert.doesNotMatch(home, /const newArrivals =/);
  assert.doesNotMatch(home, /const freedom =/);
  assert.match(settings, /storefrontCollections:\s*\['New Arrivals', 'Freedom of Mind'\]/);
});

test('collection sections preserve existing copy and hide empty registered collections', () => {
  const products = [
    { id: 'one', collections: ['New Arrivals', 'Summer Drop'] },
    { id: 'two', collections: ['Freedom of Mind'] }
  ];
  const sections = buildStorefrontCollectionSections(
    products,
    ['New Arrivals', 'Freedom of Mind', 'Summer Drop', 'Empty Collection']
  );

  assert.deepEqual(sections.map(({ id, index, title }) => ({ id, index, title })), [
    { id: 'new-arrivals', index: '01', title: 'New Arrivals' },
    { id: 'freedom-of-mind', index: '02', title: 'Freedom of Mind' },
    { id: 'summer-drop', index: '03', title: 'Summer Drop' }
  ]);
  assert.match(sections[0].blurb, /Fresh drops/);
  assert.match(sections[1].blurb, /statement line/);
  assert.equal(sections[2].blurb, 'Explore the latest pieces in Summer Drop.');
  assert.deepEqual(sections[2].products.map((product) => product.id), ['one']);
});
