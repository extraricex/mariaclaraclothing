const { findOrderByNumber } = require('../orders/orderRepository');

function normalized(value) {
  return String(value || '').trim().toLowerCase();
}

function eligibleCompletedOrder(order) {
  const statuses = ['status', 'fulfillmentStatus', 'deliveryStatus'].map((field) => normalized(order?.[field]));
  if (statuses.some((status) => ['cancelled', 'failed', 'expired'].includes(status))) return false;
  return statuses.includes('delivered');
}

function orderContainsProduct(order, product) {
  const identifiers = new Set([
    product?.id,
    product?.slug,
    product?.publicHandle,
    product?.slug ? `catalog-${product.slug}` : ''
  ].map(normalized).filter(Boolean));
  return (Array.isArray(order?.items) ? order.items : []).find((item) => (
    [item.productId, item.slug, item.productSlug].map(normalized).some((value) => identifiers.has(value))
  )) || null;
}

async function verifyReviewPurchase({ orderNumber, reviewerEmail, customerId, product }, dependencies = {}) {
  const number = String(orderNumber || '').trim();
  if (!number || !product) return { verified: false, reason: 'order_not_supplied', order: null, item: null };
  const findOrder = dependencies.findOrderByNumber || findOrderByNumber;
  const order = await findOrder(number, { includeRelated: false });
  if (!order) return { verified: false, reason: 'order_not_found', order: null, item: null };
  if (!eligibleCompletedOrder(order)) return { verified: false, reason: 'order_not_delivered', order, item: null };

  const emailMatches = normalized(reviewerEmail) && normalized(order.customer?.email) === normalized(reviewerEmail);
  const customerMatches = String(customerId || '').trim() && String(order.customerAccountId || '').trim() === String(customerId).trim();
  if (!emailMatches && !customerMatches) return { verified: false, reason: 'customer_mismatch', order, item: null };

  const item = orderContainsProduct(order, product);
  if (!item) return { verified: false, reason: 'product_not_in_order', order, item: null };
  return { verified: true, reason: 'verified_order', order, item };
}

module.exports = { eligibleCompletedOrder, orderContainsProduct, verifyReviewPurchase };
