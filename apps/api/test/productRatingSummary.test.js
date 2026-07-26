const test = require('node:test');
const assert = require('node:assert/strict');
const { annotateReviewSummaries } = require('../src/routes/products');

test('product-list rating summaries expose batched storefront fields without review records', () => {
  const [product] = annotateReviewSummaries([{ slug: 'shirt', name: 'Shirt' }], {
    shirt: {
      averageRating: 4.33,
      ratingCount: 3,
      totalReviews: 3,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 2, 5: 1 },
      hasRatings: true
    }
  });
  assert.equal(product.averageRating, 4.33);
  assert.equal(product.ratingCount, 3);
  assert.equal(product.hasRatings, true);
  assert.deepEqual(product.ratingDistribution, { 1: 0, 2: 0, 3: 0, 4: 2, 5: 1 });
  assert.equal(JSON.stringify(product).includes('reviewerName'), false);
});

test('products without published ratings receive an explicit empty summary', () => {
  const [product] = annotateReviewSummaries([{ slug: 'new-shirt' }], {});
  assert.equal(product.averageRating, 0);
  assert.equal(product.ratingCount, 0);
  assert.equal(product.hasRatings, false);
  assert.deepEqual(product.ratingDistribution, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
});
