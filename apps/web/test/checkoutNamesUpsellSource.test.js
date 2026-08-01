import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const source = (file) => readFile(path.join(import.meta.dirname, '..', 'src', file), 'utf8');

test('checkout requires separate name fields while ZIP remains optional', async () => {
  const [checkout, validation] = await Promise.all([
    source('pages/Checkout.jsx'),
    source('lib/checkoutValidation.js')
  ]);
  assert.match(checkout, /placeholder="First name"/);
  assert.match(checkout, /placeholder="Last name"/);
  assert.match(validation, /Please enter your first name\./);
  assert.match(validation, /Please enter your last name\./);
  assert.match(checkout, /placeholder="ZIP code \(optional\)"/);
  assert.match(validation, /postalCode && !\/\^\\d\{4\}\$\//);
  assert.doesNotMatch(checkout, /className=\{fieldClass\('postalCode'\)\} required/);
});

test('review adds fresh-stock upsells and refreshes the authoritative quote', async () => {
  const [review, upsell] = await Promise.all([
    source('pages/CheckoutReview.jsx'),
    source('components/CheckoutUpsell.jsx')
  ]);
  assert.match(review, /fetchProduct\(product\.publicHandle \|\| product\.slug\)/);
  assert.match(review, /addToCart\(cartItem\)/);
  assert.match(review, /createCheckoutQuote\(quotePayload\(draft\.discountCode \|\| '', nextItems\)\)/);
  assert.match(review, /clearCheckoutIdempotencyKey\(\)/);
  assert.match(review, /Item added to your order\./);
  assert.match(upsell, /Add one more item and unlock FREE shipping/);
  assert.match(upsell, /FREE shipping unlocked!/);
  assert.match(upsell, /Add to Order/);
  assert.match(upsell, /overflow-x-auto/);
});

test('review keeps payment and place-order action above customer details and upsells', async () => {
  const review = await source('pages/CheckoutReview.jsx');
  const summaryPosition = review.indexOf('aria-label="Order summary"');
  const paymentPosition = review.indexOf('Complete your order');
  const placeOrderPosition = review.indexOf('Place Order - Cash on Delivery');
  const customerDetailsPosition = review.indexOf('Customer information');
  const upsellPosition = review.indexOf('<CheckoutUpsell');

  assert.ok(summaryPosition >= 0, 'authoritative order summary should be present');
  assert.ok(paymentPosition >= 0, 'payment panel should be present');
  assert.ok(summaryPosition < paymentPosition, 'mobile reading order should show final totals before payment');
  assert.ok(placeOrderPosition > paymentPosition, 'place-order action should follow payment choices');
  assert.ok(customerDetailsPosition > placeOrderPosition, 'customer details should follow the primary checkout action');
  assert.ok(upsellPosition > customerDetailsPosition, 'optional upsells should remain below the primary checkout action');
});
