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
    if (collection?.visible === false || !collection?.slug) continue;
    const pathname = `/collections/${encodeURIComponent(collection.slug)}`;
    urls.set(pathname, { pathname, images: collection.imageUrl ? [{ url: collection.imageUrl, title: `${collection.name} collection` }] : [] });
  }

  for (const product of products || []) {
    const handle = String(product?.publicHandle || product?.slug || '').trim();
    if (!handle) continue;
    const pathname = `/product/${encodeURIComponent(handle)}`;
    urls.set(pathname, {
      pathname,
      lastmod: validLastModified(product.updatedAt || product.createdAt),
      images: (product.images || []).map((image) => ({ url: image.url, title: image.altText || product.name })).filter((image) => image.url)
    });
  }

  const entries = [...urls.values()].sort((left, right) => left.pathname.localeCompare(right.pathname));

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
  const lines = ['  <url>', `    <loc>${xmlEscape(`${origin}${entry.pathname}`)}</loc>`];
  if (entry.lastmod) lines.push(`    <lastmod>${xmlEscape(entry.lastmod)}</lastmod>`);
  for (const image of entry.images || []) {
    const imageUrl = new URL(String(image.url), `${origin}/`).toString();
    lines.push('    <image:image>');
    lines.push(`      <image:loc>${xmlEscape(imageUrl)}</image:loc>`);
    if (image.title) lines.push(`      <image:title>${xmlEscape(image.title)}</image:title>`);
    lines.push('    </image:image>');
  }
  lines.push('  </url>');
  return lines.join('\n');
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

module.exports = { sitemapRouter: router, buildSitemapXml, storefrontOrigin, validLastModified };
