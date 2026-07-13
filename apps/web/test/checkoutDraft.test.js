import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkoutCartFingerprint,
  checkoutDraftMatchesCart,
  clearCheckoutReviewDraft,
  loadCheckoutReviewDraft,
  saveCheckoutReviewDraft
} from '../src/lib/checkoutDraft.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
}

test('checkout review draft is session-scoped, versioned, and cart-bound', () => {
  const storage = memoryStorage();
  const items = [{ productId: 'P-1', variantId: 'V-1', quantity: 2 }];
  const draft = saveCheckoutReviewDraft({
    cartSessionId: 'cart-1',
    cartFingerprint: checkoutCartFingerprint(items),
    customer: { fullName: 'Maria Clara' }
  }, storage);

  assert.equal(draft.version, 2);
  assert.equal(loadCheckoutReviewDraft(storage).customer.fullName, 'Maria Clara');
  assert.equal(checkoutDraftMatchesCart(draft, items, 'cart-1'), true);
  assert.equal(checkoutDraftMatchesCart(draft, [{ ...items[0], quantity: 1 }], 'cart-1'), false);
  assert.equal(checkoutDraftMatchesCart(draft, items, 'cart-2'), false);
  clearCheckoutReviewDraft(storage);
  assert.equal(loadCheckoutReviewDraft(storage), null);
});

test('checkout review draft expires after two hours', () => {
  const storage = memoryStorage();
  const draft = saveCheckoutReviewDraft({ cartSessionId: 'cart-1' }, storage);
  assert.equal(loadCheckoutReviewDraft(storage, draft.savedAt + (2 * 60 * 60 * 1000) + 1), null);
});
