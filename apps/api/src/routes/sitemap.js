const express = require('express');
const { listCatalogProducts } = require('../products/catalogPresenter');
const { getStoreSettings } = require('../settings/storeSettingsRepository');

const router = express.Router();

const STATIC_STOREFRONT_PATHS = [
  '/',
  '/shop',
  '/faq',
  '/shipping-returns',
  '/terms',
  '/contact',
  '/size-chart'
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
  const paths = new Set(STATIC_STOREFRONT_PATHS);

  for (const collection of collectionDefinitions || []) {
    if (collection?.visible === false || !collection?.slug) continue;
    paths.add(`/collections/${encodeURIComponent(collection.slug)}`);
  }

  for (const product of products || []) {
    const handle = String(product?.publicHandle || product?.slug || '').trim();
    if (!handle) continue;
    paths.add(`/product/${encodeURIComponent(handle)}`);
  }

  const urls = [...paths]
    .map((pathname) => `${origin}${pathname}`)
    .sort((left, right) => left.localeCompare(right));

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => `  <url><loc>${xmlEscape(url)}</loc></url>`),
    '</urlset>',
    ''
  ].join('\n');
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

module.exports = { sitemapRouter: router, buildSitemapXml, storefrontOrigin };
