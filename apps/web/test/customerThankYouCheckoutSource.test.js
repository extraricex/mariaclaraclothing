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
  assert.match(thankYou, /item\.productName/);
  assert.match(thankYou, /item\.quantity/);
  assert.match(thankYou, /formatMoney\(Number\(item\.unitPriceCents/);
});

test('checkout redirects empty carts back to cart with a clear message', async () => {
  const checkout = await source('pages/Checkout.jsx');
  const cart = await source('pages/Cart.jsx');

  assert.match(checkout, /navigate\('\/cart', \{ replace: true, state: \{ message: 'Your cart is empty\. Please add an item before checking out\.' \} \}\)/);
  assert.match(cart, /useLocation/);
  assert.match(cart, /location\.state\?\.message/);
});

test('checkout does not redirect to cart while a completed order is navigating to thank you', async () => {
  const checkout = await source('pages/Checkout.jsx');

  assert.match(checkout, /placingOrderRef/);
  assert.match(checkout, /!placingOrderRef\.current/);
  assert.match(checkout, /placingOrderRef\.current = true;[\s\S]*clearCart\(\);[\s\S]*navigate\(`\/thank-you\?order=/);
});

test('checkout shows a premium free shipping upsell reminder', async () => {
  const checkout = await source('pages/Checkout.jsx');

  assert.match(checkout, /checkout-free-shipping-reminder/);
  assert.match(checkout, /Buy 2 or more items and get FREE shipping\./);
  assert.match(checkout, /cartQuantity\(items\)/);
  assert.match(checkout, /settings\.shipping\.freeShippingMinimumItems/);
});

test('checkout does not turn automatic free-shipping promos into manual discount codes', async () => {
  const checkout = await source('pages/Checkout.jsx');

  assert.doesNotMatch(checkout, /setReviewQuote\(nextQuote\);\s*setActiveDiscountCode\(nextQuote\?\.discountCode \|\| discountInput\.trim\(\)\)/);
  assert.doesNotMatch(checkout, /const latestQuote = await refreshQuote\(discountInput\.trim\(\)\)/);
  assert.match(checkout, /if \(discountInput\.trim\(\)\) \{\s*setActiveDiscountCode\(nextQuote\?\.discountCode \|\| discountInput\.trim\(\)\);/);
  assert.match(checkout, /const orderDiscountCode = activeDiscountCode \? discountInput\.trim\(\) : '';/);
});

test('checkout highlights one-item carts with a direct free shipping prompt', async () => {
  const checkout = await source('pages/Checkout.jsx');

  assert.match(checkout, /cartQuantity\(items\) === 1/);
  assert.match(checkout, /checkout-one-item-offer/);
  assert.match(checkout, /Add one more item to get FREE shipping\./);
});

test('checkout renders responsive product upsells that add items to the cart', async () => {
  const checkout = await source('pages/Checkout.jsx');

  assert.match(checkout, /fetchProducts/);
  assert.match(checkout, /addToCart/);
  assert.match(checkout, /checkout-upsell-products/);
  assert.match(checkout, /suggestedCheckoutProducts/);
  assert.match(checkout, /addSuggestedProductToCart/);
  assert.match(checkout, /Product photo/);
  assert.match(checkout, /Add to Cart/);
  assert.match(checkout, /grid-cols-2[\s\S]*lg:grid-cols-4/);
});

test('homepage banner height is responsive without excessive mobile black space', async () => {
  const [home, settings] = await Promise.all([
    source('pages/Home.jsx'),
    source('lib/storeSettings.js')
  ]);

  assert.match(home, /activeBanner/);
  assert.match(home, /className="block h-auto w-full select-none opacity-0/);
  assert.match(home, /min-h-\[min\(58svh,430px\)\]/);
  assert.match(home, /sm:min-h-\[min\(68svh,560px\)\]/);
  assert.match(home, /lg:min-h-\[min\(78vh,720px\)\]/);
  assert.match(home, /-mt-\[97px\]/);
  assert.match(home, /lg:-mt-\[105px\]/);
  assert.match(home, /h-full w-full object-cover/);
  assert.match(home, /bg-ink\/35 sm:bg-ink\/40/);
  assert.match(home, /heroCopy\.title[\s\S]*heroCopy\.highlight/);
  assert.match(home, /Regular Fit Tees with premium quality shirt\./);
  assert.match(settings, /eyebrow:\s*''/);
  assert.match(home, /reveal reveal-3 mt-4 hidden max-w-xs[\s\S]*lg:block/);
  assert.match(home, /reveal reveal-4 mt-3 flex flex-wrap justify-start/);
  assert.doesNotMatch(home, /Worldwide/);
  assert.doesNotMatch(home, /100%[\s\S]*Pure/);
  assert.doesNotMatch(settings, /Philippine Streetwear - Imus Cavite/);
  assert.doesNotMatch(home, /Philippine streetwear · Imus, Cavite/i);
  assert.doesNotMatch(home, /min-h-\[min\(86svh,620px\)\]/);
});
