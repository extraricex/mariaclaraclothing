import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..', 'src');
const source = (file) => readFile(path.join(root, file), 'utf8');

test('thank you page renders real order items and Messenger support from settings', async () => {
  const thankYou = await source('pages/ThankYou.jsx');

  assert.match(thankYou, /loadStorefrontSettings/);
  assert.match(thankYou, /messengerUrl/);
  assert.match(thankYou, /Message Us About Your Order|Ask About My Order/);
  assert.match(thankYou, /summary\.items/);
  assert.match(thankYou, /summary\.customerName/);
  assert.match(thankYou, /summary\.subtotalCents/);
  assert.match(thankYou, /summary\.discountTotalCents/);
  assert.match(thankYou, /summary\.discountCode/);
  assert.match(thankYou, /item\.productName/);
  assert.match(thankYou, /item\.imageUrl/);
  assert.match(thankYou, /alt=\{item\.productName \|\| 'Ordered product'\}/);
  assert.match(thankYou, /item\.quantity/);
  assert.match(thankYou, /formatMoney\(Number\(item\.unitPriceCents/);
  assert.match(thankYou, /\['cancelled', 'failed', 'expired', 'unreachable'\]/);
  assert.match(thankYou, /order\?\.paymentMethod === 'cash_on_delivery'/);
  assert.match(thankYou, /order\?\.paymentMethod === 'paymongo' && order\.paymentStatus === 'paid'/);
  assert.match(thankYou, /claimMetaPurchase\(order\.orderNumber, confirmation\.confirmationToken\)/);
  assert.match(thankYou, /Thank you for your order! Your order is now complete and will be prepared for packing and shipping\./);
});

test('checkout redirects empty carts back to cart with a clear message', async () => {
  const checkout = await source('pages/Checkout.jsx');
  const cart = await source('pages/Cart.jsx');

  assert.match(checkout, /navigate\('\/cart', \{ replace: true, state: \{ message: 'Your cart is empty\. Please add an item before checking out\.' \} \}\)/);
  assert.match(cart, /useLocation/);
  assert.match(cart, /location\.state\?\.message/);
});

test('checkout does not redirect to cart while a completed order is navigating to thank you', async () => {
  const review = await source('pages/CheckoutReview.jsx');

  assert.match(review, /placingOrderRef/);
  assert.match(review, /!placingOrderRef\.current/);
  assert.match(review, /placingOrderRef\.current = true;[\s\S]*clearCart\(\);[\s\S]*navigate\(`\/thank-you\?order=/);
});

test('checkout details page shows a premium free shipping reminder', async () => {
  const checkout = await source('pages/Checkout.jsx');

  assert.match(checkout, /checkout-free-shipping-reminder/);
  assert.match(checkout, /Buy \{settings\.shipping\.freeShippingMinimumItems\} or more items and get FREE shipping\./);
  assert.match(checkout, /cartQuantity\(items\)/);
  assert.match(checkout, /settings\.shipping\.freeShippingMinimumItems/);
});

test('review keeps automatic promotions separate from manually entered discount codes', async () => {
  const review = await source('pages/CheckoutReview.jsx');

  assert.match(review, /storeReviewDraft\(nextQuote, discountCode\)/);
  assert.match(review, /const code = discountInput\.trim\(\)/);
  assert.doesNotMatch(review, /discountCode:\s*nextQuote\?\.discountCode/);
  assert.match(review, /quotePayload\(draft\.discountCode \|\| ''\)/);
});

test('checkout and review are separate routes with exact customer action labels', async () => {
  const [app, checkout, review] = await Promise.all([
    source('App.jsx'),
    source('pages/Checkout.jsx'),
    source('pages/CheckoutReview.jsx')
  ]);

  assert.match(app, /path="\/checkout\/review"/);
  assert.match(checkout, /Review order/);
  assert.doesNotMatch(checkout, /name="payment-method"/);
  assert.match(review, /Place Order - Cash on Delivery/);
  assert.match(review, /Proceed to Online Payment/);
  assert.match(review, /name="payment-method"/);
});

test('review renders responsive authoritative product and total details', async () => {
  const review = await source('pages/CheckoutReview.jsx');

  assert.match(review, /quote\?\.items/);
  assert.match(review, /item\.productName/);
  assert.match(review, /item\.imageUrl/);
  assert.match(review, /item\.unitPriceCents/);
  assert.match(review, /item\.quantity/);
  assert.match(review, /quote\?\.subtotalCents/);
  assert.match(review, /quote\?\.shippingFeeCents/);
  assert.match(review, /quote\?\.totalCents/);
  assert.match(review, /lg:grid-cols-\[minmax\(0,1fr\)_minmax\(340px,0\.8fr\)\]/);
});

test('homepage banner height is responsive without excessive mobile black space', async () => {
  const [home, settings] = await Promise.all([
    source('pages/Home.jsx'),
    source('lib/storeSettings.js')
  ]);

  assert.match(home, /activeBanner/);
  assert.match(home, /className="aspect-\[2200\/825\] w-full" aria-hidden="true"/);
  assert.match(home, /min-h-\[min\(58svh,430px\)\]/);
  assert.match(home, /sm:min-h-\[min\(68svh,560px\)\]/);
  assert.match(home, /lg:min-h-\[min\(78vh,720px\)\]/);
  assert.match(home, /-mt-\[97px\]/);
  assert.match(home, /lg:-mt-\[105px\]/);
  assert.match(home, /h-full w-full object-cover/);
  assert.match(home, /bg-ink\/35 sm:bg-ink\/40/);
  assert.match(home, /heroCopy\.title[\s\S]*heroCopy\.highlight/);
  assert.match(settings, /Regular Fit Tees with premium quality shirt\./);
  assert.match(settings, /eyebrow:\s*''/);
  assert.match(home, /reveal reveal-3 mt-3 max-w-xs/);
  assert.match(home, /reveal reveal-4 mt-3 flex flex-wrap justify-start/);
  assert.doesNotMatch(home, /Worldwide/);
  assert.doesNotMatch(home, /100%[\s\S]*Pure/);
  assert.doesNotMatch(settings, /Philippine Streetwear - Imus Cavite/);
  assert.doesNotMatch(home, /Philippine streetwear · Imus, Cavite/i);
  assert.doesNotMatch(home, /min-h-\[min\(86svh,620px\)\]/);
});
