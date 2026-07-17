import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionSeoAnalysis, productSeoAnalysis } from '../src/lib/seoAdmin.js';

test('product SEO analysis provides fallbacks without pretending optional fields are complete', () => {
  const analysis = productSeoAnalysis({
    name: 'CURIOSITY BLACK',
    publicHandle: 'curiosity-black',
    description: '<p>A confirmed product description long enough to explain the design, fit, fabric details, sizing, care, and customer use.</p>',
    priceCents: 64900,
    images: [{ url: '/products/curiosity.webp', altText: '' }],
    variants: [{ size: 'm', sku: 'CUR-M', stockQuantity: 1 }],
    metafields: { fit: ['Oversized'], material: ['Cotton'] },
    collections: ['Freedom of Mind'],
    seo: {}
  });
  assert.equal(analysis.fallbacks.title, 'Curiosity Black — Oversized | Maria Clara Clothing');
  assert.match(analysis.fallbacks.description, /^Shop Curiosity Black by Maria Clara Clothing:/);
  assert.ok(analysis.warnings.some((warning) => warning.includes('custom SEO title')));
  assert.ok(analysis.warnings.some((warning) => warning.includes('alt text')));
  assert.ok(analysis.score < 100);
});

test('collection SEO analysis warns that empty indexable collections should be noindex', () => {
  const analysis = collectionSeoAnalysis({
    name: 'New Arrivals',
    slug: 'new-arrivals',
    indexable: true,
    introText: ''
  }, 0);
  assert.ok(analysis.warnings.some((warning) => warning.includes('Empty collections')));
  assert.ok(analysis.warnings.some((warning) => warning.includes('introduction')));
});

test('admin analysis warns before an unsafe cross-origin canonical is saved', () => {
  const analysis = productSeoAnalysis({
    name: 'HAWAK WHITE',
    publicHandle: 'hawak-white',
    priceCents: 64900,
    images: [],
    variants: [],
    seo: { canonicalUrl: 'https://example.com/hawak-white' }
  });
  assert.ok(analysis.warnings.some((warning) => warning.includes('storefront origin')));
});
