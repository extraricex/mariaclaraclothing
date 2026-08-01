import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('mobile product pages put the gallery before the buying panel and expose size state', async () => {
  const product = await source('src/pages/Product.jsx');
  const gallery = product.indexOf('order-1 min-w-0');
  const buyingPanel = product.indexOf('order-2 min-w-0');
  assert.ok(gallery >= 0 && buyingPanel > gallery);
  assert.match(product, /aria-pressed=\{selected\}/);
  assert.match(product, /7-day replacement support/);
  assert.match(product, /Save \{formatMoney\(savingsCents\)\}/);
});

test('product reviews are removed from the public product journey and review SEO', async () => {
  const product = await source('src/pages/Product.jsx');
  assert.doesNotMatch(product, /ProductReviews|Loading customer reviews/);
  assert.match(product, /includeReviews:\s*false/);
});

test('checkout fields expose stable autofill names and mobile totals precede COD placement', async () => {
  const [checkout, review] = await Promise.all([
    source('src/pages/Checkout.jsx'),
    source('src/pages/CheckoutReview.jsx')
  ]);
  for (const name of ['given-name', 'family-name', 'tel', 'email', 'street-address', 'address-level1', 'address-level2', 'address-level3', 'postal-code']) {
    assert.match(checkout, new RegExp(`name="${name}"`));
  }
  assert.ok(review.indexOf('aria-label="Order summary"') < review.indexOf('Place Order - Cash on Delivery'));
  assert.match(review, /Total including shipping/);
  assert.match(review, /pay the rider in cash/i);
});

test('customer-facing defaults are COD-only and do not promise online payment', async () => {
  const [settings, home] = await Promise.all([
    source('src/lib/storeSettings.js'),
    source('src/pages/Home.jsx')
  ]);
  assert.doesNotMatch(settings, /How does online payment work\?/);
  assert.match(settings, /All storefront orders use Cash on Delivery/);
  assert.match(home, /Pay cash when it arrives\./);
});

test('conversion migration corrects product facts, COD settings, and honest review collection', async () => {
  const migration = await readFile(new URL('../../api/db/migrations/20260802_conversion_recovery.sql', import.meta.url), 'utf8');
  assert.match(migration, /cash_on_delivery/);
  assert.match(migration, /showOnProductPages/);
  assert.match(migration, /MANDALA BLACK V1 — Oversized 240 GSM Shirt/);
  assert.match(migration, /MARIACLARA ROCKSTAR — Regular Fit 240 GSM Shirt/);
  assert.match(migration, /Available sizes: Small to 2XL/);
  assert.match(migration, /Visayas and Mindanao: Delivered within 5–8 days/);
});

test('merchant feed exposes stock bands for ad and catalog segmentation', async () => {
  const feed = await readFile(new URL('../../api/src/routes/merchantFeed.js', import.meta.url), 'utf8');
  assert.match(feed, /inventory_critical/);
  assert.match(feed, /custom_label_0/);
  assert.match(feed, /custom_label_1/);
});

test('address choices collapse punctuation-only duplicate barangays', async () => {
  const { canonicalAddressName, dedupeAddressItems } = await import('../src/lib/addressGuide.js');
  assert.equal(canonicalAddressName('ALAPAN I -A'), 'ALAPAN I-A');
  const items = dedupeAddressItems([
    { code: 'legacy', name: 'ALAPAN I -A' },
    { code: 'canonical', name: 'ALAPAN I-A' },
    { code: 'other', name: 'ALAPAN II-A' }
  ]);
  assert.equal(items.length, 2);
  assert.equal(items[0].code, 'canonical');
});
