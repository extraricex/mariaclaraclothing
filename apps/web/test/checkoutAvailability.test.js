import test from 'node:test';
import assert from 'node:assert/strict';
import { cartAvailabilityRepair, isCartAvailabilityError } from '../src/lib/checkoutAvailability.js';

const items = [
  { productId: 'product-1', variantId: 'variant-1', quantity: 2 },
  { productId: 'product-2', variantId: 'variant-2', quantity: 1 }
];

test('checkout availability errors are identified without blocking transient failures', () => {
  assert.equal(isCartAvailabilityError({ code: 'insufficient_stock' }), true);
  assert.equal(isCartAvailabilityError({ code: 'product_unavailable' }), true);
  assert.equal(isCartAvailabilityError({ code: 'network_error' }), false);
});

test('sold-out variants can be removed and limited variants can be reduced', () => {
  assert.deepEqual(cartAvailabilityRepair({
    code: 'insufficient_stock',
    details: { variantId: 'variant-1', availableQuantity: 0 }
  }, items), { type: 'remove', variantIds: ['variant-1'] });

  assert.deepEqual(cartAvailabilityRepair({
    code: 'insufficient_stock',
    details: { variantId: 'variant-1', availableQuantity: 1 }
  }, items), { type: 'reduce', variantId: 'variant-1', quantity: 1 });
});

test('unavailable products can remove every affected cart line', () => {
  assert.deepEqual(cartAvailabilityRepair({
    code: 'product_unavailable',
    details: { productId: 'product-2' }
  }, items), { type: 'remove', variantIds: ['variant-2'] });
});
