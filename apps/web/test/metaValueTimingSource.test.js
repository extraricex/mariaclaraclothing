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

  assert.doesNotMatch(review, /trackFacebookPurchase/);
  assert.match(review, /if \(paymentMethod === 'paymongo'\) \{[\s\S]*window\.location\.assign\(result\.checkoutUrl\);[\s\S]*return;/);
  assert.match(thankYou, /order\?\.paymentMethod === 'cash_on_delivery'[\s\S]*order\?\.paymentMethod === 'paymongo' && order\.paymentStatus === 'paid'/);
  assert.match(thankYou, /claimMetaPurchase\(order\.orderNumber, confirmation\.confirmationToken\)[\s\S]*trackFacebookPurchasePayload\(claim\.purchase,[\s\S]*completeMetaPurchase/);
});

test('AddPaymentInfo identity is stable across checkout quote refreshes', async () => {
  const review = await source('pages/CheckoutReview.jsx');
  assert.match(review, /`payment:\$\{cartSessionId\}:\$\{paymentMethod\}`/);
  assert.match(review, /`payment:\$\{cartSessionId\}:\$\{methodId\}`/);
  assert.doesNotMatch(review, /payment:\$\{cartSessionId\}:\$\{quote\.id\}/);
});
