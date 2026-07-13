import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const source = (file) => readFile(path.join(import.meta.dirname, '..', 'src', file), 'utf8');

test('checkout requires separate name fields while ZIP remains optional', async () => {
  const checkout = await source('pages/Checkout.jsx');
  assert.match(checkout, /placeholder="First name"/);
  assert.match(checkout, /placeholder="Last name"/);
  assert.match(checkout, /First Name is required\./);
  assert.match(checkout, /Last Name is required\./);
  assert.match(checkout, /placeholder="ZIP code \(optional\)"/);
  assert.match(checkout, /postalCode\.trim\(\) && !\/\^\\d\{4\}\$\//);
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
