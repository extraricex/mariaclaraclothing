const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCollectionSeo } = require('../src/seo/collectionSeo');
const { buildSitemapXml } = require('../src/routes/sitemap');

const collection = {
  name: 'Freedom of Mind', slug: 'freedom-of-mind', aliases: ['Freedom'],
  seoTitle: '', metaDescription: '', introText: 'Original graphic streetwear pieces.',
  visible: true, indexable: true
};

test('collection SEO honors membership aliases and automatically noindexes empty collections', () => {
  const populated = buildCollectionSeo(collection, [{ slug: 'shirt', collections: ['Freedom'] }], {
    origin: 'https://mariaclaraclothing.com'
  });
  assert.equal(populated.indexable, true);
  assert.equal(populated.members.length, 1);
  assert.equal(populated.canonical, 'https://mariaclaraclothing.com/collections/freedom-of-mind');
  assert.match(populated.title, /Freedom of Mind/);

  const empty = buildCollectionSeo(collection, [], { origin: 'https://mariaclaraclothing.com' });
  assert.equal(empty.indexable, false);
});

test('collection canonical override is limited to the preferred origin and collection routes', () => {
  const products = [{ slug: 'shirt', collections: ['Freedom of Mind'] }];
  assert.equal(buildCollectionSeo({ ...collection, canonicalUrl: 'https://spam.example/collection' }, products, {
    origin: 'https://mariaclaraclothing.com'
  }).canonical, 'https://mariaclaraclothing.com/collections/freedom-of-mind');
  assert.equal(buildCollectionSeo({ ...collection, canonicalUrl: '/collections/freedom-editorial' }, products, {
    origin: 'https://mariaclaraclothing.com'
  }).canonical, 'https://mariaclaraclothing.com/collections/freedom-editorial');
});

test('sitemap omits empty and explicitly noindex collections', () => {
  const products = [{
    slug: 'shirt', publicHandle: 'shirt', name: 'Shirt', description: 'A real shirt.',
    collections: ['Populated'], priceCents: 64900,
    images: [{ url: '/shirt.webp', altText: 'Shirt' }],
    variants: [{ size: 'M', sku: 'SHIRT-M', stockQuantity: 1 }]
  }];
  const xml = buildSitemapXml({
    siteUrl: 'https://mariaclaraclothing.com',
    products,
    collectionDefinitions: [
      { name: 'Populated', slug: 'populated', visible: true, indexable: true },
      { name: 'Empty', slug: 'empty', visible: true, indexable: true },
      { name: 'Hidden from search', slug: 'hidden-search', visible: true, indexable: false, aliases: ['Populated'] }
    ]
  });
  assert.match(xml, /\/collections\/populated<\/loc>/);
  assert.doesNotMatch(xml, /\/collections\/empty<\/loc>|\/collections\/hidden-search<\/loc>/);
});
