import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const source = (file) => readFile(path.join(import.meta.dirname, '..', 'src', file), 'utf8');

test('invalid inventory is blocked before checkout instead of redirecting after the form', async () => {
  const [checkout, cart, shell] = await Promise.all([
    source('pages/Checkout.jsx'),
    source('pages/Cart.jsx'),
    source('components/Shell.jsx')
  ]);

  assert.match(checkout, /createCheckoutQuote\(\{ cartSessionId: getCartSessionId\(\), items, discountCode: checkoutDiscountCode \}\)/);
  assert.match(checkout, /setCartAvailability\(\{ state: 'blocked', message: error\.message \}\)/);
  assert.match(checkout, /Your details are saved\./);
  assert.match(checkout, /quote: null/);
  assert.doesNotMatch(checkout, /navigate\('\/cart', \{ replace: true, state: \{ message: error\.message \} \}\)/);
  assert.match(cart, /Remove unavailable item/);
  assert.match(cart, /Update cart before checkout/);
  assert.match(shell, /checkoutBlocked = isCartAvailabilityError\(quoteIssue\)/);
  assert.match(shell, /Update cart before checkout/);
});
