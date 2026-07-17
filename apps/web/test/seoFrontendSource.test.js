import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const source = (file) => readFile(path.join(root, file), 'utf8');

test('central SEO owner replaces stale metadata and JSON-LD during SPA navigation', async () => {
  const [component, service, main] = await Promise.all([
    source('src/components/SEO.jsx'),
    source('src/lib/seo.js'),
    source('src/main.jsx')
  ]);
  assert.match(main, /<RouteSeoDefaults \/>/);
  assert.match(component, /applySeoDescriptor/);
  assert.match(component, /search: location\.search/);
  assert.match(service, /link\[rel="canonical"\]/);
  assert.match(service, /script\[type="application\/ld\+json"\]\[data-mcc-schema\]/);
  assert.match(service, /product:availability/);
  assert.match(service, /og:image:alt/);
  assert.match(service, /twitter:image:alt/);
  assert.match(service, /removeMeta\(documentRef, 'property', 'og:image:alt'\)/);
  assert.match(service, /removeMeta\(documentRef, 'name', 'twitter:image:alt'\)/);
  assert.doesNotMatch(service, /made in the Philippines/i);
});

test('storefront pages consume centralized descriptors and preserve clean variant canonicals', async () => {
  const [product, collection, shop, productCard, shell] = await Promise.all([
    source('src/pages/Product.jsx'),
    source('src/pages/Collection.jsx'),
    source('src/pages/Shop.jsx'),
    source('src/components/ProductCard.jsx'),
    source('src/components/Shell.jsx')
  ]);
  assert.match(product, /productSeoDescriptor/);
  assert.match(product, /searchParams\.get\('size'\)/);
  assert.match(product, /setVariantId\(requestedVariant\?\.id \|\| firstInStock\?\.id \|\| body\.product\.variants\[0\]\?\.id/);
  assert.doesNotMatch(product, /trim\(\)\.toLowerCase\(\) === requestedSize && Number\(variant\.stockQuantity\)/);
  assert.match(product, /More in \{parentCollection\.name\}/);
  assert.match(collection, /collectionSeoDescriptor/);
  assert.match(collection, /collection\.supportingText/);
  assert.match(collection, /collection\?\.visible !== false && Boolean\(collection\?\.slug\)/);
  assert.match(shop, /NOINDEX_FOLLOW_ROBOTS/);
  assert.match(product, /!\(product\.variants \|\| \[\]\)\.some\(\(candidate\) => Number\(candidate\.stockQuantity \|\| 0\) > 0\)/);
  assert.match(productCard, /\|\| stock <= 0/);
  assert.equal((productCard.match(/width="1000"/g) || []).length, 2);
  assert.equal((productCard.match(/height="1250"/g) || []).length, 2);
  assert.match(shell, /collectionMembers\(catalogProducts, collection\)\.length > 0/);
  assert.doesNotMatch(shell, /Premium 240 GSM cotton, cut oversized/);
  assert.match(product, /body: freeShippingProductCopy/);
  assert.match(product, /right\.score - left\.score \|\| left\.index - right\.index/);
});

test('admin SEO controls, dashboard, and secure export are routed', async () => {
  const [app, editor, collections, dashboard, layout] = await Promise.all([
    source('src/App.jsx'),
    source('src/admin/ProductEditor.jsx'),
    source('src/admin/Collections.jsx'),
    source('src/admin/SeoDashboard.jsx'),
    source('src/admin/AdminLayout.jsx')
  ]);
  assert.match(app, /path="marketing\/seo"/);
  assert.match(layout, /Marketing · SEO/);
  for (const field of ['mainKeyword', 'secondaryKeywords', 'imageAltText', 'canonicalUrl', 'indexable', 'ogTitle', 'ogDescription', 'ogImageUrl', 'feedTitle', 'marketplaceTitle']) {
    assert.match(editor, new RegExp(field));
  }
  for (const field of ['seoTitle', 'metaDescription', 'introText', 'supportingText', 'canonicalUrl', 'indexable', 'ogImageUrl']) {
    assert.match(collections, new RegExp(field));
  }
  assert.match(dashboard, /adminJson\('\/api\/admin\/seo'\)/);
  assert.match(dashboard, /adminDownloadGet\('\/api\/admin\/seo\/export\.csv'/);
  assert.match(dashboard, /not a Google ranking score/);
});
