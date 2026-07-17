const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSeoAudit, seoAuditCsv } = require('../src/seo/seoAudit');

function product(overrides = {}) {
  return {
    id: 'product-1',
    slug: 'mandala-white',
    publicHandle: 'mandala-white-oversized-shirt',
    name: 'MANDALA WHITE — Oversized Cotton T-Shirt',
    status: 'active',
    description: 'A product-specific Mandala design description with enough useful words for a customer comparing the fit, color, fabric, and current size availability.',
    priceCents: 64900,
    collections: ['New Arrivals'],
    images: [{ url: '/uploads/mandala.webp', altText: 'Maria Clara Mandala White oversized shirt, front view' }],
    variants: [{ size: 'M', sku: 'MANDALA-M', stockQuantity: 4 }],
    metafields: { fit: ['Oversized'], material: ['Cotton'] },
    productPage: { detailsText: 'Crew neck shirt.', sizeChart: [{ size: 'M' }] },
    seo: {
      title: 'Mandala White Oversized T-Shirt | Maria Clara Clothing',
      description: 'Shop the Mandala White oversized cotton T-shirt with current sizes and availability.',
      mainKeyword: 'Mandala White oversized T-shirt',
      secondaryKeywords: ['white oversized shirt'],
      indexable: true
    },
    updatedAt: '2026-07-17T00:00:00.000Z',
    ...overrides
  };
}

test('SEO audit reports completeness without presenting it as a ranking score', () => {
  const audit = buildSeoAudit({
    products: [product()],
    collections: [{
      name: 'New Arrivals', slug: 'new-arrivals', aliases: [], visible: true,
      indexable: true, seoTitle: 'New Arrivals | Maria Clara Clothing',
      metaDescription: 'Shop current Maria Clara Clothing releases.', introText: 'Current releases.'
    }],
    siteUrl: 'https://mariaclaraclothing.com'
  });

  assert.equal(audit.summary.totalActiveProducts, 1);
  assert.equal(audit.products[0].structuredDataStatus, 'ready');
  assert.equal(audit.products[0].currentUrl, '/product/mandala-white-oversized-shirt');
  assert.match(audit.technical.scoreDisclaimer, /not a Google ranking score/i);
  assert.ok(audit.products[0].completeness >= 90);
});

test('SEO audit flags duplicate metadata, wrong-product alt text, empty collections, and CSV injection', () => {
  const first = product({
    seo: { ...product().seo, title: '=unsafe shared title', description: 'Shared meta description.' },
    images: [{ url: '/uploads/mandala.webp', altText: 'Wanna Gray regular-fit shirt' }]
  });
  const second = product({
    id: 'product-2', slug: 'wanna-gray', publicHandle: 'wanna-gray-regular-shirt',
    name: 'WANNA GRAY — Regular Fit Cotton T-Shirt',
    variants: [{ size: 'M', sku: 'WANNA-M', stockQuantity: 2 }],
    seo: { ...product().seo, title: '=unsafe shared title', description: 'Shared meta description.' }
  });
  const audit = buildSeoAudit({
    products: [first, second],
    collections: [
      { name: 'New Arrivals', slug: 'new-arrivals', visible: true },
      { name: 'Empty', slug: 'empty', visible: true, indexable: true }
    ]
  });

  assert.equal(audit.summary.duplicateTitles, 2);
  assert.equal(audit.summary.duplicateDescriptions, 2);
  assert.equal(audit.summary.emptyCollections, 1);
  assert.ok(audit.products[0].warnings.some((warning) => /another product/i.test(warning)));
  assert.match(seoAuditCsv(audit), /"'=unsafe shared title"/);
});
