const express = require('express');
const { listCatalogProducts } = require('../products/catalogPresenter');
const { getStoreSettings } = require('../settings/storeSettingsRepository');
const { buildProductSeo } = require('../seo/productSeo');
const { buildCollectionSeo } = require('../seo/collectionSeo');

const router = express.Router();

const STATIC_STOREFRONT_PATHS = [
  '/',
  '/shop',
  '/faq',
  '/shipping-returns',
  '/terms',
  '/contact',
  '/size-chart',
  '/guides/240-gsm-shirts',
  '/guides/t-shirt-fit-guide',
  '/guides/payment-and-shipping'
];

function xmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function storefrontOrigin(value) {
  try {
    const url = new URL(String(value || 'http://localhost:5173'));
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported protocol');
    return url.origin;
  } catch (_error) {
    return 'http://localhost:5173';
  }
}

function buildSitemapXml({ products = [], collectionDefinitions = [], siteUrl = '' } = {}) {
  const origin = storefrontOrigin(siteUrl);
  const urls = new Map(STATIC_STOREFRONT_PATHS.map((pathname) => [pathname, { pathname }]));

  for (const collection of collectionDefinitions || []) {
    const collectionSeo = buildCollectionSeo(collection, products, { origin });
    if (!collectionSeo.indexable) continue;
    urls.set(collectionSeo.canonical, {
      loc: collectionSeo.canonical,
      images: collectionSeo.image ? [{ url: collectionSeo.image, title: `${collectionSeo.name} collection` }] : []
    });
  }

  for (const product of products || []) {
    const productSeo = buildProductSeo(product, { origin });
    if (!productSeo.indexable || !productSeo.canonical) continue;
    urls.set(productSeo.canonical, {
      loc: productSeo.canonical,
      lastmod: validLastModified(product.updatedAt || product.createdAt),
      images: productSeo.images.map((image) => ({ url: image.url, title: image.altText }))
    });
  }

  const entries = [...urls.values()].sort((left, right) => (
    String(left.loc || left.pathname).localeCompare(String(right.loc || right.pathname))
  ));

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ...entries.map((entry) => sitemapEntry(origin, entry)),
    '</urlset>',
    ''
  ].join('\n');
}

function validLastModified(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : '';
}

function sitemapEntry(origin, entry) {
  const loc = entry.loc || `${origin}${entry.pathname}`;
  const lines = ['  <url>', `    <loc>${xmlEscape(loc)}</loc>`];
  if (entry.lastmod) lines.push(`    <lastmod>${xmlEscape(entry.lastmod)}</lastmod>`);
  for (const image of entry.images || []) {
    const imageUrl = sitemapImageUrl(origin, image.url);
    if (!imageUrl) continue;
    lines.push('    <image:image>');
    lines.push(`      <image:loc>${xmlEscape(imageUrl)}</image:loc>`);
    if (image.title) lines.push(`      <image:title>${xmlEscape(image.title)}</image:title>`);
    lines.push('    </image:image>');
  }
  lines.push('  </url>');
  return lines.join('\n');
}

function sitemapImageUrl(origin, value) {
  try {
    const url = new URL(String(value || ''), `${origin}/`);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch (_error) {
    return '';
  }
}

router.get('/', async (_req, res, next) => {
  try {
    const [products, settings] = await Promise.all([
      Promise.resolve(listCatalogProducts()),
      Promise.resolve(getStoreSettings())
    ]);
    const xml = buildSitemapXml({
      products,
      collectionDefinitions: settings?.collectionDefinitions || [],
      siteUrl: process.env.FRONTEND_URL
    });
    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    });
    res.status(200).send(xml);
  } catch (error) {
    next(error);
  }
});

module.exports = { sitemapRouter: router, buildSitemapXml, sitemapImageUrl, storefrontOrigin, validLastModified };
