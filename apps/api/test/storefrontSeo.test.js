const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createApp } = require('../src/app');
const { buildMerchantFeedXml } = require('../src/routes/merchantFeed');
const { buildRobotsTxt } = require('../src/routes/robots');
const { pageDescriptor, renderSeoBody, renderSeoHead } = require('../src/seo/storefrontSeo');

test('product SEO is database-backed and present as initial-head markup', async () => {
  const descriptor = await pageDescriptor('/product/imperial-choco-tee', { siteUrl: 'https://mariaclaraclothing.com' });
  assert.equal(descriptor.noindex, false);
  assert.match(descriptor.title, /IMPERIAL CHOCO TEE/);
  assert.equal(descriptor.canonical, 'https://mariaclaraclothing.com/product/imperial-choco-tee');
  const head = renderSeoHead(descriptor, { nonce: 'request_nonce_123' });
  assert.match(head, /<title>IMPERIAL CHOCO TEE/);
  assert.match(head, /rel="canonical" href="https:\/\/mariaclaraclothing\.com\/product\/imperial-choco-tee"/);
  assert.match(head, /"@type":"Product"/);
  assert.match(head, /"priceCurrency":"PHP"/);
  assert.match(head, /nonce="request_nonce_123"/);
  assert.match(head, /rel="preload" as="image"/);
  assert.match(head, /imagesrcset="[^"]*width=480 480w[^"]*width=960 960w/);
  assert.doesNotMatch(head, /aggregateRating/);
  const body = renderSeoBody(descriptor);
  assert.match(body, /srcset="[^"]*width=480 480w/);
  assert.match(body, /fetchpriority="high"/);
});

test('private commerce routes are explicitly noindex', async () => {
  const descriptor = await pageDescriptor('/checkout/review', { siteUrl: 'https://mariaclaraclothing.com' });
  assert.equal(descriptor.noindex, true);
  assert.match(renderSeoHead(descriptor), /content="noindex,nofollow"/);
});

test('home SEO fallback reuses responsive campaign media without occupying the React root', async () => {
  const descriptor = await pageDescriptor('/', { siteUrl: 'https://mariaclaraclothing.com' });
  const body = renderSeoBody(descriptor);
  assert.match(body, /data-seo-fallback-view data-home="true"/);
  assert.match(body, /hero1v2-1200\.webp 1200w/);
  assert.match(body, /fetchpriority="high"/);
  assert.match(renderSeoHead(descriptor), /imagesrcset="[^"]*hero1v2-1200\.webp 1200w/);
});

test('Merchant Center feed contains authoritative variant price and availability', () => {
  const xml = buildMerchantFeedXml({
    siteUrl: 'https://mariaclaraclothing.com',
    products: [{
      id: 'prod_test', slug: 'test-shirt', publicHandle: 'test-shirt', name: 'TEST SHIRT',
      description: 'A real product description.', priceCents: 64900, category: 'T-Shirts',
      images: [{ url: '/uploads/test.webp' }], metafields: { color: ['Black'] },
      variants: [{ id: 'variant-1', sku: 'TEST-BLK-M', size: 'm', stockQuantity: 2 }]
    }]
  });
  assert.match(xml, /<g:id>TEST-BLK-M<\/g:id>/);
  assert.match(xml, /<g:price>649\.00 PHP<\/g:price>/);
  assert.match(xml, /<g:availability>in_stock<\/g:availability>/);
  assert.match(xml, /<g:color>Black<\/g:color>/);
  assert.match(xml, /<link>https:\/\/mariaclaraclothing\.com\/product\/test-shirt<\/link>/);
});

test('robots advertises the sitemap and protects private flows', () => {
  const robots = buildRobotsTxt('https://mariaclaraclothing.com');
  assert.match(robots, /Disallow: \/checkout/);
  assert.match(robots, /Disallow: \/admin/);
  assert.match(robots, /Sitemap: https:\/\/mariaclaraclothing\.com\/sitemap\.xml/);
});

test('public SEO endpoints return fragments without exposing API errors', async () => {
  const server = await new Promise((resolve, reject) => {
    const listener = createApp().listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const [head, body, feed, robots] = await Promise.all([
      fetch(`${origin}/api/storefront/seo/head?path=%2Fshop&nonce=request_nonce_123`),
      fetch(`${origin}/api/storefront/seo/body?path=%2Fshop`),
      fetch(`${origin}/merchant-feed.xml`),
      fetch(`${origin}/robots.txt`)
    ]);
    assert.equal(head.status, 200);
    assert.match(await head.text(), /Shop Premium T-Shirts/);
    assert.equal(body.status, 200);
    assert.match(await body.text(), /<h1>All Products<\/h1>/);
    assert.equal(feed.status, 200);
    assert.match(feed.headers.get('content-type'), /application\/xml/);
    assert.equal(robots.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('production web shell uses SSI SEO fragments and external Meta bootstrap', () => {
  const webRoot = path.join(__dirname, '..', '..', 'web');
  const index = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8');
  const nginx = fs.readFileSync(path.join(webRoot, 'nginx.conf'), 'utf8');
  assert.match(index, /storefront\/seo\/head/);
  assert.match(index, /storefront\/seo\/body/);
  assert.match(index, /id="seo-fallback"/);
  assert.match(index, /id="root"><\/div>/);
  assert.match(index, /href="\/seo-fallback\.css"/);
  assert.match(index, /src="\/meta-bootstrap\.js"/);
  assert.doesNotMatch(index, /facebook\.com\/tr\?id=/);
  assert.match(nginx, /ssi on/);
  assert.match(nginx, /Content-Security-Policy /);
  assert.doesNotMatch(nginx, /Content-Security-Policy-Report-Only/);
});
