import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const sourceRoot = path.join(import.meta.dirname, '..', 'src');

async function source(relativePath) {
  return readFile(path.join(sourceRoot, relativePath), 'utf8');
}

test('InitiateCheckout waits for the final backend quote with discounts and shipping', async () => {
  const [checkout, cart, shell] = await Promise.all([
    source('pages/Checkout.jsx'),
    source('pages/Cart.jsx'),
    source('components/Shell.jsx')
  ]);

  assert.doesNotMatch(cart, /trackFacebookInitiateCheckout/);
  assert.doesNotMatch(shell, /trackFacebookInitiateCheckout/);
  assert.match(checkout, /const quote = body\.quote;[\s\S]*if \(!quote\?\.finalizable\)[\s\S]*trackFacebookInitiateCheckout\(\s*quote\.items \|\| items,\s*quote,/);
  assert.doesNotMatch(checkout, /trackFacebookInitiateCheckout\([\s\S]{0,160}subtotalCents: subtotalCents/);
});

test('COD and PayMongo browser Purchase events only run after their valid completion points', async () => {
  const [review, thankYou] = await Promise.all([
    source('pages/CheckoutReview.jsx'),
    source('pages/ThankYou.jsx')
  ]);

  assert.match(review, /if \(paymentMethod === 'paymongo'\) \{[\s\S]*window\.location\.assign\(result\.checkoutUrl\);[\s\S]*return;[\s\S]*\}[\s\S]*trackFacebookPurchase\(result, result\.items, result\.trackingEventId\)/);
  assert.match(thankYou, /order\?\.paymentMethod !== 'paymongo' \|\| order\.paymentStatus !== 'paid' \|\| unsuccessfulOrder\) return;[\s\S]*trackFacebookPurchase\(order, order\.items \|\| \[\], order\.trackingEventId\)/);
});
