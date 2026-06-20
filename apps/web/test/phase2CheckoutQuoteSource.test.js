import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..', 'src');

test('api lib exposes backend cart quote helper', async () => {
  const source = await readFile(path.join(root, 'lib', 'api.js'), 'utf8');

  assert.match(source, /export function quoteCart/);
  assert.match(source, /\/api\/discounts\/quote/);
  assert.match(source, /method:\s*'POST'/);
});

test('cart page displays backend quote totals instead of hardcoded promo totals', async () => {
  const source = await readFile(path.join(root, 'pages', 'Cart.jsx'), 'utf8');

  assert.match(source, /quoteCart/);
  assert.match(source, /quote\?\.subtotalCents/);
  assert.match(source, /quote\?\.discountTotalCents/);
  assert.match(source, /quote\?\.shippingFeeCents/);
  assert.match(source, /quote\?\.totalCents/);
  assert.match(source, /freeShippingUnlocked/);
  assert.doesNotMatch(source, /quantity >= 2 \? '✓ Free shipping unlocked' : 'Add 1 more item to unlock free shipping'/);
});

test('checkout gates order placement behind backend quote review', async () => {
  const source = await readFile(path.join(root, 'pages', 'Checkout.jsx'), 'utf8');

  assert.match(source, /quoteCart/);
  assert.match(source, /const \[step, setStep\]/);
  assert.match(source, /const \[reviewQuote, setReviewQuote\]/);
  assert.match(source, /async function handleReview/);
  assert.match(source, /setStep\('review'\)/);
  assert.match(source, /Back to details/);
  assert.match(source, /Review and place order/);
  assert.match(source, /discountCode:\s*discountInput\.trim\(\)/);
  assert.doesNotMatch(source, /\/api\/discounts\/validate/);
});
