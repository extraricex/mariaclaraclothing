const test = require('node:test');
const assert = require('node:assert/strict');
const {
  eligibleCompletedOrder,
  orderContainsProduct,
  verifyReviewPurchase
} = require('../src/reviews/reviewVerification');

const product = { id: 'catalog-shirt', slug: 'shirt', publicHandle: 'premium-shirt' };
const deliveredOrder = {
  orderNumber: 'MCC-1',
  status: 'delivered',
  customer: { email: 'buyer@example.com' },
  customerAccountId: 'customer-1',
  items: [{ productId: 'catalog-shirt', variantId: 'catalog-shirt-0', size: 'Medium', quantity: 2 }]
};

test('verified purchase requires a delivered real order, matching customer, and matching product', async () => {
  const result = await verifyReviewPurchase({
    orderNumber: 'MCC-1', reviewerEmail: 'BUYER@example.com', product
  }, { findOrderByNumber: async () => deliveredOrder });
  assert.equal(result.verified, true);
  assert.equal(result.item.quantity, 2);
  assert.equal(result.item.size, 'Medium');
  assert.equal(eligibleCompletedOrder(deliveredOrder), true);
  assert.equal(orderContainsProduct(deliveredOrder, product).variantId, 'catalog-shirt-0');
});

test('pending, failed, mismatched, and nonexistent orders never become verified', async () => {
  const verify = (order, input = {}) => verifyReviewPurchase({
    orderNumber: 'MCC-1', reviewerEmail: 'buyer@example.com', product, ...input
  }, { findOrderByNumber: async () => order });

  assert.equal((await verify({ ...deliveredOrder, status: 'pending_payment' })).reason, 'order_not_delivered');
  assert.equal((await verify({ ...deliveredOrder, status: 'failed' })).reason, 'order_not_delivered');
  assert.equal((await verify(deliveredOrder, { reviewerEmail: 'other@example.com' })).reason, 'customer_mismatch');
  assert.equal((await verify({ ...deliveredOrder, items: [{ productId: 'catalog-other' }] })).reason, 'product_not_in_order');
  assert.equal((await verify(null)).reason, 'order_not_found');
  assert.equal((await verify(deliveredOrder, { reviewerEmail: '', customerId: 'customer-1' })).verified, true);
});

test('conflicting cancelled or failed orders cannot be verified even with a delivered field', () => {
  for (const status of ['cancelled', 'failed', 'expired']) {
    assert.equal(eligibleCompletedOrder({ status, deliveryStatus: 'delivered' }), false);
  }
});
