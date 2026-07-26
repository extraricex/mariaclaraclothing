import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const source = (file) => readFile(path.join(root, file), 'utf8');

test('admin exposes website conversion overview, funnel, and checkout issues', async () => {
  const [app, layout, overview, funnel, issues, nginx] = await Promise.all([
    source('src/App.jsx'),
    source('src/admin/AdminLayout.jsx'),
    source('src/admin/Analytics.jsx'),
    source('src/admin/ConversionFunnel.jsx'),
    source('src/admin/CheckoutIssues.jsx'),
    source('nginx.conf')
  ]);

  assert.match(app, /path="analytics\/funnel"/);
  assert.match(app, /path="analytics\/checkout-issues"/);
  assert.match(layout, /Conversion overview/);
  assert.match(layout, /Conversion funnel/);
  assert.match(layout, /Checkout issues/);
  assert.match(overview, /Pancake POS imports, cancelled orders, and marked tests are excluded/);
  assert.match(overview, /Top viewed products/);
  assert.match(overview, /Top added-to-cart products/);
  assert.match(overview, /Top purchased products/);
  assert.match(funnel, /Successful orders and revenue come only from committed Online Store orders/);
  assert.match(issues, /Customer names, contact details, full addresses, payment details, and credentials are never stored/);
  assert.match(nginx, /\/analytics\(\?:\/funnel\|\/checkout-issues\|\/meta-reconciliation\)\?/);
});

test('storefront records the missing checkout journey and failure signals', async () => {
  const [product, checkout, review, thankYou, analytics] = await Promise.all([
    source('src/pages/Product.jsx'),
    source('src/pages/Checkout.jsx'),
    source('src/pages/CheckoutReview.jsx'),
    source('src/pages/ThankYou.jsx'),
    source('src/lib/funnelAnalytics.js')
  ]);

  assert.match(product, /trackFunnelEvent\('size_select'/);
  assert.match(checkout, /trackFunnelEvent\('checkout_start'/);
  assert.match(checkout, /trackFunnelEvent\('shipping_info_completed'/);
  assert.match(checkout, /trackFunnelEvent\('checkout_error'/);
  assert.match(review, /trackFunnelEvent\('place_order'/);
  assert.match(review, /trackFunnelEvent\('payment_failed'/);
  assert.match(thankYou, /trackFunnelEvent\('thank_you_view'/);
  assert.match(analytics, /checkoutStep/);
  assert.match(analytics, /errorCategory/);
  assert.match(analytics, /errorMessage/);
});

test('cart drawer uses the authoritative quote for free-shipping progress and configured payment reassurance', async () => {
  const shell = await source('src/components/Shell.jsx');
  assert.match(shell, /quote\?\.freeShippingEnabled/);
  assert.match(shell, /quote\.freeShippingMinimumItems/);
  assert.match(shell, /Cash on Delivery available nationwide/);
  assert.match(shell, /Secure online payment through PayMongo/);
  assert.match(shell, /settings=\{storeInfo\}/);
});

test('homepage priority products come only from real successful order counts and available stock', async () => {
  const home = await source('src/pages/Home.jsx');
  assert.match(home, /Number\(product\.successfulOrderCount \|\| 0\) > 0/);
  assert.match(home, /variant\.stockQuantity/);
  assert.match(home, /Most ordered/);
  assert.match(home, /priorityProducts/);
});
