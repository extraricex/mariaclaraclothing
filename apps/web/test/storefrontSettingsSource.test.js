import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..', 'src');

test('storeSettings lib fetches the public endpoint with safe fallbacks', async () => {
  const source = await readFile(path.join(root, 'lib', 'storeSettings.js'), 'utf8');

  assert.match(source, /\/api\/storefront-settings/);
  assert.match(source, /DEFAULT_STOREFRONT_SETTINGS/);
  assert.match(source, /export function loadStorefrontSettings/);
  assert.match(source, /export function regionFee/);
  assert.match(source, /export function regionEstimate/);
  assert.match(source, /export function isFreeShipping/);
  assert.match(source, /export function freeShippingHint/);
  assert.match(source, /messengerUrl:\s*'https:\/\/m\.me\/mariaclaraclothing'/);
});

test('checkout details and review use store settings for shipping and payment methods', async () => {
  const details = await readFile(path.join(root, 'pages', 'Checkout.jsx'), 'utf8');
  const review = await readFile(path.join(root, 'pages', 'CheckoutReview.jsx'), 'utf8');

  assert.match(details, /loadStorefrontSettings/);
  assert.doesNotMatch(details, /name="payment-method"/);
  assert.match(review, /name="payment-method"/);
  assert.match(review, /setPaymentMethod/);
  assert.match(review, /method\.instructions/);
  assert.match(review, /freeShippingHint\(/);
  assert.doesNotMatch(review, /feeForRegion/);
  assert.doesNotMatch(review, /paymentMethod: 'cash_on_delivery'/);
});

test('storefront footer shows contact info from store settings', async () => {
  const source = await readFile(path.join(root, 'components', 'Shell.jsx'), 'utf8');

  assert.match(source, /loadStorefrontSettings/);
  assert.match(source, /contactEmail/);
  assert.match(source, /contactNumber/);
  assert.match(source, /storeAddress/);
  assert.match(source, /socialLinks/);
});

test('contact page shows the configured store location without implying an unverified returns policy', async () => {
  const source = await readFile(path.join(root, 'pages', 'Contact.jsx'), 'utf8');

  assert.match(source, /storeAddress/);
  assert.match(source, /Store location/);
  assert.doesNotMatch(source, /Returns address/);
});

test('store settings lib carries website defaults while centralized SEO owns route tags', async () => {
  const [source, seo, main] = await Promise.all([
    readFile(path.join(root, 'lib', 'storeSettings.js'), 'utf8'),
    readFile(path.join(root, 'lib', 'seo.js'), 'utf8'),
    readFile(path.join(root, 'main.jsx'), 'utf8')
  ]);

  assert.match(source, /ticker:/);
  assert.match(source, /DEFAULT_INFO_PAGES/);
  assert.match(source, /Facebook Meta Pixel/);
  assert.match(source, /hashed contact details/);
  assert.match(source, /maintenanceMode: false/);
  assert.match(source, /hero:/);
  assert.match(source, /primaryButtonText: 'Shop new arrivals'/);
  assert.doesNotMatch(source, /applySeoTags/);
  assert.match(seo, /export function applySeoDescriptor/);
  assert.match(main, /<RouteSeoDefaults \/>/);
});

test('homepage renders hero text and buttons from storefront settings', async () => {
  const source = await readFile(path.join(root, 'pages', 'Home.jsx'), 'utf8');

  assert.match(source, /heroCopy/);
  assert.match(source, /heroCopy\.title/);
  assert.match(source, /heroCopy\.highlight/);
  assert.match(source, /heroCopy\.primaryButtonText/);
  assert.match(source, /heroCopy\.primaryButtonLink/);
  assert.doesNotMatch(source, /heroCopy\.eyebrow/);
  assert.doesNotMatch(source, /CustomerBadge/);
  assert.doesNotMatch(source, /Philippine Streetwear - Imus Cavite<\/CustomerBadge>/);
  assert.doesNotMatch(source, /Shop new arrivals<\/CustomerButton>/);
});

test('shell renders the ticker while centralized SEO owns route tags', async () => {
  const [source, seo] = await Promise.all([
    readFile(path.join(root, 'components', 'Shell.jsx'), 'utf8'),
    readFile(path.join(root, 'components', 'SEO.jsx'), 'utf8')
  ]);

  assert.doesNotMatch(source, /applySeoTags/);
  assert.match(seo, /applySeoDescriptor/);
  assert.match(source, /storeInfo\?\.ticker/);
  assert.match(source, /function Ticker\(\{ items \}\)/);
});

test('maintenance gate wraps the storefront but not the admin', async () => {
  const gate = await readFile(path.join(root, 'components', 'MaintenanceGate.jsx'), 'utf8');
  assert.match(gate, /maintenanceMode/);
  assert.match(gate, /We'll be right back/);

  const app = await readFile(path.join(root, 'App.jsx'), 'utf8');
  assert.match(app, /<MaintenanceGate><Shell \/><\/MaintenanceGate>/);
  assert.match(app, /<MaintenanceGate><PageTransition><Checkout \/><\/PageTransition><\/MaintenanceGate>/);
  assert.match(app, /<MaintenanceGate><PageTransition><CheckoutReview \/><\/PageTransition><\/MaintenanceGate>/);
  assert.doesNotMatch(app, /<MaintenanceGate><AdminLayout/);
});

test('info pages render sections from settings by pageKey', async () => {
  const source = await readFile(path.join(root, 'pages', 'InfoPage.jsx'), 'utf8');
  assert.match(source, /pageKey/);
  assert.match(source, /loadStorefrontSettings/);
  assert.match(source, /section\.heading/);
  assert.match(source, /section\.body/);
  assert.doesNotMatch(source, /FAQ_SECTIONS/);

  const app = await readFile(path.join(root, 'App.jsx'), 'utf8');
  assert.match(app, /pageKey="faq"/);
  assert.match(app, /pageKey="shippingReturns"/);
  assert.match(app, /pageKey="terms"/);
});

test('storefront uses the low stock threshold from settings', async () => {
  const lib = await readFile(path.join(root, 'lib', 'storeSettings.js'), 'utf8');
  assert.match(lib, /export function useStorefrontSettings/);
  assert.match(lib, /lowStockThreshold: 12/);

  const card = await readFile(path.join(root, 'components', 'ProductCard.jsx'), 'utf8');
  assert.match(card, /useStorefrontSettings/);
  assert.match(card, /settings\.inventory\.lowStockThreshold/);
  assert.doesNotMatch(card, /<= 12/);

  const productPage = await readFile(path.join(root, 'pages', 'Product.jsx'), 'utf8');
  assert.match(productPage, /useStorefrontSettings/);
  assert.match(productPage, /settings\.inventory\.lowStockThreshold/);
  assert.doesNotMatch(productPage, /<= 12/);
});
