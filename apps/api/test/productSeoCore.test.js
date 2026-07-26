const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const previousProductsFile = process.env.PRODUCTS_DATA_FILE;
const productsFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-product-seo-')), 'products.json');
process.env.PRODUCTS_DATA_FILE = productsFile;

const editableFixture = {
  id: 'prod_source_record',
  slug: 'legacy-shirt-copy',
  publicHandle: 'verified-shirt',
  name: 'VERIFIED SHIRT',
  description: '<p>A verified premium cotton shirt description.</p>',
  collections: ['Tees'],
  category: 'T-Shirts',
  productType: 'Oversized shirt',
  vendor: 'Maria Clara Clothing',
  tags: ['cotton', 'oversized'],
  seo: {
    title: 'Verified Shirt SEO',
    description: 'Verified fit, fabric, and size information.',
    mainKeyword: 'verified shirt',
    secondaryKeywords: ['cotton shirt', 'oversized shirt'],
    imageAltText: 'Verified shirt front view',
    canonicalUrl: '/product/verified-shirt',
    indexable: true,
    ogTitle: 'Verified Shirt Social',
    ogDescription: 'Verified shirt social description.',
    ogImageUrl: '/images/verified-social.webp',
    feedTitle: 'Verified Shirt Product Feed',
    marketplaceTitle: 'Verified Shirt Marketplace',
    handle: 'verified-shirt'
  },
  metafields: {
    color: ['Black'], material: ['Premium cotton'], fit: ['Oversized'], fabricWeight: ['240 GSM']
  },
  priceCents: 64900,
  images: [{ url: '/images/verified.webp', altText: 'Verified shirt', sortOrder: 0 }],
  variants: [{ size: 'm', sku: 'VERIFIED-M', stockQuantity: 3 }],
  createdAt: '2026-07-01T01:02:03.000Z',
  updatedAt: '2026-07-17T04:05:06.000Z'
};
fs.writeFileSync(productsFile, `${JSON.stringify([editableFixture], null, 2)}\n`);

const catalogRepository = require('../src/products/catalogRepository');
const catalogPresenter = require('../src/products/catalogPresenter');
const { buildMerchantFeedXml } = require('../src/routes/merchantFeed');
const { buildSitemapXml } = require('../src/routes/sitemap');
const {
  buildProductSeo,
  productStructuredData,
  wordSafeText
} = require('../src/seo/productSeo');

test.after(() => {
  if (previousProductsFile === undefined) delete process.env.PRODUCTS_DATA_FILE;
  else process.env.PRODUCTS_DATA_FILE = previousProductsFile;
});

test('catalog projection preserves SEO facts and timestamps without changing cart-facing IDs', () => {
  const [catalogProduct] = catalogRepository.listCatalogProducts();
  const [publicProduct] = catalogPresenter.listCatalogProducts();

  assert.equal(catalogProduct.id, 'prod_source_record');
  assert.equal(catalogProduct.seo.mainKeyword, 'verified shirt');
  assert.deepEqual(catalogProduct.seo.secondaryKeywords, ['cotton shirt', 'oversized shirt']);
  assert.equal(catalogProduct.metafields.fabricWeight[0], '240 GSM');
  assert.equal(catalogProduct.category, 'T-Shirts');
  assert.equal(catalogProduct.productType, 'Oversized shirt');
  assert.equal(catalogProduct.vendor, 'Maria Clara Clothing');
  assert.deepEqual(catalogProduct.tags, ['cotton', 'oversized']);
  assert.equal(catalogProduct.updatedAt, '2026-07-17T04:05:06.000Z');

  assert.equal(publicProduct.id, 'catalog-legacy-shirt-copy');
  assert.equal(publicProduct.slug, 'legacy-shirt-copy');
  assert.equal(publicProduct.publicHandle, 'verified-shirt');
  assert.equal(publicProduct.seo.feedTitle, 'Verified Shirt Product Feed');
  assert.equal(publicProduct.seo.marketplaceTitle, 'Verified Shirt Marketplace');
  assert.equal(publicProduct.createdAt, '2026-07-01T01:02:03.000Z');
  assert.equal(publicProduct.updatedAt, '2026-07-17T04:05:06.000Z');
});

test('repository normalization enforces safe SEO storage limits for non-admin imports', () => {
  assert.throws(() => catalogRepository.normalizeEditableProduct({
    ...editableFixture,
    seo: { ...editableFixture.seo, title: '<b>Unsafe title</b>' }
  }), /SEO title must be plain text without HTML/);
  assert.throws(() => catalogRepository.normalizeEditableProduct({
    ...editableFixture,
    seo: { ...editableFixture.seo, feedTitle: 'x'.repeat(151) }
  }), /Product feed title must be 150 characters or fewer/);
  assert.throws(() => catalogRepository.normalizeEditableProduct({
    ...editableFixture,
    seo: { ...editableFixture.seo, canonicalUrl: 'http:\/\/insecure.example/product/test' }
  }), /Canonical URL must be an HTTPS URL or a site-relative path/);
});

test('central product SEO applies safe channel, canonical, index, and image fallbacks', () => {
  assert.equal(wordSafeText('one two three', 8), 'one two');
  const description = Array.from({ length: 40 }, (_value, index) => `word${index + 1}`).join(' ');
  const seo = buildProductSeo({
    slug: 'legacy-shirt', publicHandle: 'safe-shirt', name: 'SAFE SHIRT',
    description: `<p>${description}</p>`, vendor: 'Maria Clara Clothing', productType: 'Tshirt',
    productPage: { detailsText: 'Color: Black\nFit: Oversized Fit\nThickness: 240 GSM\nFabric: Premium Cotton' },
    seo: {
      canonicalUrl: '/product/canonical-shirt?utm_source=test#details',
      indexable: false,
      ogTitle: 'Safe Shirt Social',
      ogDescription: 'A safe social description.',
      ogImageUrl: 'javascript:alert(1)',
      feedTitle: 'Safe Shirt Feed',
      marketplaceTitle: 'Safe Shirt Marketplace',
      imageAltText: 'Safe shirt front view'
    },
    images: [
      { url: '/images/main.webp', altText: '', sortOrder: 0 },
      { url: '/images/detail.webp', altText: '', sortOrder: 1 }
    ]
  }, { origin: 'https://mariaclaraclothing.com' });

  assert.equal(seo.indexable, false);
  assert.equal(seo.canonical, 'https://mariaclaraclothing.com/product/canonical-shirt');
  assert.equal(seo.feedTitle, 'Safe Shirt Feed');
  assert.equal(seo.marketplaceTitle, 'Safe Shirt Marketplace');
  assert.equal(seo.openGraphTitle, 'Safe Shirt Social');
  assert.equal(seo.openGraphImage, 'https://mariaclaraclothing.com/images/main.webp');
  assert.equal(seo.images[0].altText, 'Safe shirt front view');
  assert.equal(seo.images[1].altText, 'SAFE SHIRT, product image 2');
  assert.ok(seo.title.length <= 70);
  assert.match(seo.title, /^Safe Shirt — Oversized \| Maria Clara Clothing$/);
  assert.ok(seo.description.length <= 160);
  assert.match(seo.description, /^Shop Safe Shirt by Maria Clara Clothing:/);
  assert.match(seo.description, /Black, Oversized Fit, 240 GSM, Premium Cotton/);
  assert.doesNotMatch(seo.description, /word\d+/);
  assert.match(seo.schemaDescription, /^word1 word2/);
  assert.equal(seo.facts.color, 'Black');
  assert.equal(seo.facts.fabricWeight, '240 GSM');

  const readable = buildProductSeo({
    slug: 'mandala-white-v1',
    name: 'MANDALA WHITE V1 — Oversized 240 GSM Shirt',
    description: 'Premium shirt made with cotton fabric.',
    productType: 'Tshirt',
    images: [{ url: '/images/mandala.webp' }]
  }, { origin: 'https://mariaclaraclothing.com' });
  assert.match(readable.title, /^Mandala White V1 — Oversized T-Shirt \| Maria Clara Clothing$/);
  assert.equal(readable.feedTitle, 'Mandala White V1 — Oversized 240 GSM Cotton T-Shirt');
  assert.match(readable.description, /^Shop Mandala White V1 by Maria Clara Clothing:/);
  assert.equal(readable.facts.color, 'White');
  assert.equal(readable.facts.material, 'Cotton');
});

test('fallback metadata stays complete and contradictory product colors are omitted from machine channels', () => {
  const product = {
    id: 'catalog-rockstar',
    slug: 'rockstar',
    publicHandle: 'mariaclara-rockstar',
    name: 'MARIACLARA ROCKSTAR — Premium Regular Fit 240 GSM Cotton T-Shirt',
    description: '<p>A regular-fit 240 GSM cotton shirt in a versatile gray color.</p><p>Color: Red</p>',
    productType: 'Tshirt',
    vendor: 'Maria Clara Clothing',
    metafields: {
      color: ['Red'],
      material: ['Polyester'],
      fit: ['Oversized fit'],
      fabricWeight: ['180 GSM']
    },
    priceCents: 64900,
    productPage: {
      intro: '<p>A regular-fit 240 GSM cotton shirt in a versatile gray color.</p>',
      detailsText: 'Color: Red\nFit: Oversized fit\nMaterial: Polyester\nFabric weight: 180 GSM'
    },
    images: [{ url: '/images/rockstar.webp', altText: 'MariaClara Rockstar front view' }],
    variants: [
      { id: 'rockstar-m', sku: 'ROCKSTAR-M', size: 'm', stockQuantity: 2 },
      { id: 'rockstar-l', sku: 'ROCKSTAR-L', size: 'l', stockQuantity: 1 }
    ]
  };

  const seo = buildProductSeo(product, { origin: 'https://mariaclaraclothing.com' });
  assert.equal(seo.facts.color, '');
  assert.deepEqual(seo.conflicts, {
    color: true,
    material: true,
    fit: true,
    fabricWeight: true
  });
  assert.ok(seo.description.length <= 160);
  assert.match(seo.description, /\.$/);
  assert.doesNotMatch(seo.description, /(?:,|\b(?:and|or|with))\s*$/i);
  assert.doesNotMatch(seo.description, /\b(?:red|gr(?:a|e)y)\b/i);
  assert.doesNotMatch(seo.schemaDescription, /\b(?:red|gr(?:a|e)y|polyester|cotton|180\s*gsm|240\s*gsm|oversized|regular[ -]?fit)\b/i);

  const schema = productStructuredData({
    product,
    origin: 'https://mariaclaraclothing.com'
  });
  assert.equal(schema.color, undefined);
  assert.equal(schema.material, undefined);
  assert.equal(schema.additionalProperty, undefined);
  assert.equal(schema.hasVariant[0].color, undefined);
  assert.equal(schema.hasVariant[0].material, undefined);
  assert.doesNotMatch(schema.description, /\b(?:red|gr(?:a|e)y|polyester|cotton|180\s*gsm|240\s*gsm|oversized|regular[ -]?fit)\b/i);

  const feed = buildMerchantFeedXml({
    products: [product],
    siteUrl: 'https://mariaclaraclothing.com'
  });
  assert.doesNotMatch(feed, /<g:color>/);
  assert.doesNotMatch(feed, /<g:material>/);
  assert.doesNotMatch(feed, /<g:description>[^<]*\b(?:red|gr(?:a|e)y|polyester|cotton|180\s*gsm|240\s*gsm|oversized|regular[ -]?fit)\b/i);
});

test('long generated meta descriptions retain a complete sentence instead of a dangling conjunction', () => {
  const seo = buildProductSeo({
    slug: 'infinite-possibilities',
    publicHandle: 'infinite-possibilities-black',
    name: 'INFINITE POSSIBILITIES BLACK — Premium Crop Box 240 GSM Cotton T-Shirt',
    description: 'A black crop-box shirt made from premium-quality cotton fabric.',
    productType: 'Tshirt',
    vendor: 'Maria Clara Clothing',
    productPage: {
      detailsText: 'Color: Black\nFit: Crop-box fit\nMaterial: Premium-quality cotton fabric\nFabric weight: 240 GSM'
    },
    images: [{ url: '/images/infinite.webp', altText: 'Infinite Possibilities Black front view' }],
    variants: [{ sku: 'INFINITE-M', size: 'm', stockQuantity: 1 }]
  }, { origin: 'https://mariaclaraclothing.com' });

  assert.ok(seo.description.length <= 160);
  assert.match(seo.description, /\.$/);
  assert.doesNotMatch(seo.description, /(?:,|\b(?:and|or|with))\s*$/i);
});

test('ProductGroup schema uses variant price and stock and gates public review markup', () => {
  const product = {
    id: 'catalog-verified-shirt', slug: 'verified-shirt', publicHandle: 'verified-shirt',
    name: 'Verified Shirt', description: 'A verified shirt.', priceCents: 64900,
    category: 'T-Shirts', vendor: 'Maria Clara Clothing',
    seo: { indexable: true },
    metafields: {
      color: ['Black'], material: ['Premium cotton'], fit: ['Oversized'], fabricWeight: ['240 GSM']
    },
    images: [{ url: '/images/verified.webp', altText: 'Verified shirt front view' }],
    variants: [
      { id: 'var-m', sku: 'VERIFIED-M', size: 'm', priceCents: 64900, stockQuantity: 2 },
      { id: 'var-l', sku: 'VERIFIED-L', size: 'l', priceCents: 69900, stockQuantity: 0 }
    ]
  };
  const hiddenReviews = productStructuredData({
    product, origin: 'https://mariaclaraclothing.com',
    reviewSummary: { averageRating: 5, totalReviews: 1 },
    publicReviews: [{ reviewerName: 'Customer', rating: 5, body: 'Excellent shirt.' }],
    reviewsPublic: false
  });

  assert.equal(hiddenReviews['@type'], 'ProductGroup');
  assert.equal(hiddenReviews.productGroupID, 'catalog-verified-shirt');
  assert.deepEqual(hiddenReviews.variesBy, ['https://schema.org/size']);
  assert.equal(hiddenReviews.color, 'Black');
  assert.equal(hiddenReviews.material, 'Premium cotton');
  assert.deepEqual(hiddenReviews.additionalProperty, [
    { '@type': 'PropertyValue', name: 'Fit', value: 'Oversized' },
    { '@type': 'PropertyValue', name: 'Fabric weight', value: '240 GSM' }
  ]);
  assert.equal(hiddenReviews.hasVariant[0].offers.price, 649);
  assert.equal(hiddenReviews.hasVariant[0].offers.url, 'https://mariaclaraclothing.com/product/verified-shirt?size=m');
  assert.equal(hiddenReviews.hasVariant[0].offers.priceCurrency, 'PHP');
  assert.equal(hiddenReviews.hasVariant[0].offers.availability, 'https://schema.org/InStock');
  assert.equal(hiddenReviews.hasVariant[1].offers.price, 699);
  assert.equal(hiddenReviews.hasVariant[1].offers.availability, 'https://schema.org/OutOfStock');
  assert.equal(hiddenReviews.hasVariant[1].offers.seller.name, 'Maria Clara Clothing');
  assert.equal(hiddenReviews.aggregateRating, undefined);
  assert.equal(hiddenReviews.review, undefined);

  const publicReviews = productStructuredData({
    product, origin: 'https://mariaclaraclothing.com',
    reviewSummary: { averageRating: 5, totalReviews: 1 },
    publicReviews: [{
      reviewerName: 'Customer', reviewerEmail: 'private@example.com', rating: 5,
      title: 'Excellent', body: 'Excellent shirt.', createdAt: '2026-07-15T01:00:00.000Z'
    }],
    reviewsPublic: true
  });
  assert.deepEqual(publicReviews.aggregateRating, {
    '@type': 'AggregateRating', ratingValue: 5, reviewCount: 1, bestRating: 5, worstRating: 1
  });
  assert.equal(publicReviews.review[0].author.name, 'Customer');
  assert.equal(publicReviews.review[0].datePublished, '2026-07-15');
  assert.doesNotMatch(JSON.stringify(publicReviews), /private@example\.com|reviewerEmail/);
});

test('Merchant feed and sitemap exclude noindex products and use confirmed facts and timestamps', () => {
  const visible = {
    id: 'catalog-visible', slug: 'visible', publicHandle: 'visible-shirt', name: 'VISIBLE SHIRT',
    description: 'A visible verified shirt.', category: 'T-Shirts', collections: ['Safe Collection'],
    vendor: 'Maria Clara Clothing',
    priceCents: 64900, updatedAt: '2026-07-17T04:05:06.000Z',
    seo: {
      indexable: true, canonicalUrl: '/product/visible-shirt?tracking=removed',
      feedTitle: 'Visible Shirt Feed', imageAltText: 'Visible shirt front view'
    },
    metafields: {
      color: ['Black'], material: ['Premium cotton'], gender: ['unisex'], ageGroup: ['adult']
    },
    images: [{ url: '/images/visible.webp', altText: '' }],
    variants: [{ sku: 'VISIBLE-M', size: 'm', priceCents: 64900, stockQuantity: 1 }]
  };
  const hidden = {
    ...visible,
    id: 'catalog-hidden', slug: 'hidden', publicHandle: 'hidden-shirt', name: 'HIDDEN SHIRT',
    seo: { indexable: false }, variants: [{ sku: 'HIDDEN-M', size: 'm', stockQuantity: 1 }]
  };

  const feed = buildMerchantFeedXml({
    products: [visible, hidden], siteUrl: 'https://mariaclaraclothing.com'
  });
  assert.match(feed, /<g:title>Visible Shirt Feed - Size M<\/g:title>/);
  assert.match(feed, /<g:description>A visible verified shirt\.<\/g:description>/);
  assert.match(feed, /<g:link>https:\/\/mariaclaraclothing\.com\/product\/visible-shirt\?size=m<\/g:link>/);
  assert.match(feed, /<g:price>649\.00 PHP<\/g:price>/);
  assert.match(feed, /<g:availability>in_stock<\/g:availability>/);
  assert.match(feed, /<g:color>Black<\/g:color>/);
  assert.match(feed, /<g:material>Premium cotton<\/g:material>/);
  assert.match(feed, /<g:gender>unisex<\/g:gender>/);
  assert.match(feed, /<g:age_group>adult<\/g:age_group>/);
  assert.doesNotMatch(feed, /HIDDEN-M|hidden-shirt/);

  const sitemap = buildSitemapXml({
    products: [visible, hidden],
    collectionDefinitions: [{ name: 'Safe Collection', slug: 'safe-collection', imageUrl: 'http://[invalid' }],
    siteUrl: 'https://mariaclaraclothing.com'
  });
  assert.match(sitemap, /<loc>https:\/\/mariaclaraclothing\.com\/product\/visible-shirt<\/loc>/);
  assert.match(sitemap, /<lastmod>2026-07-17T04:05:06\.000Z<\/lastmod>/);
  assert.match(sitemap, /<image:title>Visible shirt front view<\/image:title>/);
  assert.match(sitemap, /\/collections\/safe-collection<\/loc>/);
  assert.doesNotMatch(sitemap, /http:\/\/\[invalid/);
  assert.doesNotMatch(sitemap, /tracking=removed|hidden-shirt/);
});
