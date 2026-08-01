import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..', 'src');

test('api lib exposes backend cart quote helper', async () => {
  const source = await readFile(path.join(root, 'lib', 'api.js'), 'utf8');

  assert.match(source, /export function createCheckoutQuote/);
  assert.match(source, /\/api\/checkout\/quotes/);
  assert.match(source, /method:\s*'POST'/);
});

test('cart page displays backend quote totals instead of hardcoded promo totals', async () => {
  const source = await readFile(path.join(root, 'pages', 'Cart.jsx'), 'utf8');

  assert.match(source, /createCheckoutQuote/);
  assert.match(source, /quote\?\.subtotalCents/);
  assert.match(source, /quote\?\.discountTotalCents/);
  assert.match(source, /quote\?\.shippingFeeCents/);
  assert.match(source, /quote\?\.totalCents/);
  assert.match(source, /freeShippingUnlocked/);
  assert.doesNotMatch(source, /quantity >= 2 \? '✓ Free shipping unlocked' : 'Add 1 more item to unlock free shipping'/);
});

test('checkout gates order placement behind a separate backend-quoted review route', async () => {
  const details = await readFile(path.join(root, 'pages', 'Checkout.jsx'), 'utf8');
  const review = await readFile(path.join(root, 'pages', 'CheckoutReview.jsx'), 'utf8');

  assert.match(details, /createCheckoutQuote/);
  assert.match(details, /saveCheckoutReviewDraft/);
  assert.match(details, /navigate\('\/checkout\/review'\)/);
  assert.doesNotMatch(details, /createQuoteBackedOrder|createPayMongoCheckout/);
  assert.match(review, /Review and place your COD order/);
  assert.match(review, /Total including shipping/);
  assert.match(review, /getCheckoutIdempotencyKey/);
  assert.match(review, /createQuoteBackedOrder/);
  assert.match(review, /createPayMongoCheckout/);
  assert.match(review, /totalsChanged\(quote, latestQuote\)/);
  assert.doesNotMatch(review, /shippingFeeCents:\s*submitTotals/);
});
