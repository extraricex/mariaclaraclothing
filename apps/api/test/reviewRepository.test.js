const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const dataFile = path.join(os.tmpdir(), `maria-clara-reviews-${process.pid}-${Date.now()}.json`);
const previousDataFile = process.env.REVIEWS_DATA_FILE;
process.env.REVIEWS_DATA_FILE = dataFile;

const reviews = require('../src/reviews/reviewRepository');

test.beforeEach(async () => {
  await reviews.resetReviewRepositoryForTests();
});

test.after(async () => {
  if (previousDataFile === undefined) delete process.env.REVIEWS_DATA_FILE;
  else process.env.REVIEWS_DATA_FILE = previousDataFile;
  await fs.rm(dataFile, { force: true });
});

function review(overrides = {}) {
  return {
    productSlug: 'shirt',
    reviewerName: 'Maria C.',
    reviewerEmail: 'private@example.com',
    orderNumber: 'MCC-PRIVATE-1',
    customerId: 'customer-private',
    rating: 5,
    title: 'Excellent fit',
    body: 'The fabric feels premium and the fit is accurate.',
    status: 'published',
    source: 'customer_submitted',
    createdAt: '2026-07-10T00:00:00.000Z',
    ...overrides
  };
}

test('published-only statistics, filters, sorting, photos, and privacy stay exact', async () => {
  const first = await reviews.insertReview(review(), {
    images: [{ imageUrl: '/uploads/reviews/one.webp' }]
  });
  await reviews.insertReview(review({
    reviewerName: 'Ana D.', reviewerEmail: 'ana@example.com', orderNumber: 'MCC-PRIVATE-2',
    rating: 3, body: 'Good quality.', createdAt: '2026-07-11T00:00:00.000Z'
  }));
  await reviews.insertReview(review({
    reviewerName: 'Pending R.', reviewerEmail: 'pending@example.com', orderNumber: 'MCC-PRIVATE-3',
    rating: 1, body: 'Waiting for moderation.', status: 'pending', createdAt: '2026-07-12T00:00:00.000Z'
  }));
  await reviews.insertReview(review({
    reviewerName: 'Demo R.', reviewerEmail: 'demo@example.com', orderNumber: '',
    rating: 5, body: 'Development fixture.', originalImportData: { is_demo: true },
    createdAt: '2026-07-12T12:00:00.000Z'
  }));

  const stats = await reviews.reviewStatistics({ productSlug: 'shirt' });
  assert.equal(stats.totalReviews, 2);
  assert.equal(stats.averageRating, 4);
  assert.deepEqual(stats.ratingCounts, { 1: 0, 2: 0, 3: 1, 4: 0, 5: 1 });
  assert.equal(stats.withPhotos, 1);

  const photoResults = await reviews.listPublishedReviews({ productSlug: 'shirt', withPhotos: true });
  assert.equal(photoResults.total, 1);
  assert.equal(photoResults.reviews[0].id, first.id);
  const publicJson = JSON.stringify(photoResults.reviews[0]);
  assert.equal(publicJson.includes('private@example.com'), false);
  assert.equal(publicJson.includes('MCC-PRIVATE-1'), false);
  assert.equal(publicJson.includes('customer-private'), false);

  const lowest = await reviews.listPublishedReviews({ productSlug: 'shirt', sort: 'lowest' });
  assert.deepEqual(lowest.reviews.map((item) => item.rating), [3, 5]);
  const fives = await reviews.listPublishedReviews({ productSlug: 'shirt', rating: 5 });
  assert.equal(fives.total, 1);
  const safePagination = await reviews.listPublishedReviews({ productSlug: 'shirt', page: 'invalid', pageSize: 'invalid' });
  assert.equal(safePagination.page, 1);
  assert.equal(safePagination.pageSize, 10);
});

test('moderation, soft deletion, restoration, edits, and audit history update ratings', async () => {
  const inserted = await reviews.insertReview(review());
  assert.equal((await reviews.reviewStatistics({ productSlug: 'shirt' })).totalReviews, 1);

  await reviews.updateReview(inserted.id, {
    status: 'hidden', moderationReason: 'Personal information', moderatedBy: 'admin'
  }, { actor: 'admin', action: 'hide', reason: 'Personal information' });
  assert.equal((await reviews.reviewStatistics({ productSlug: 'shirt' })).totalReviews, 0);

  await reviews.updateReview(inserted.id, {
    status: 'published', rating: 4, body: '<script>alert(1)</script>Updated wording.',
    createdAt: '2026-07-09T00:00:00.000Z', deletedAt: ''
  }, { actor: 'admin', action: 'restore' });
  const restored = await reviews.findReviewById(inserted.id);
  assert.equal(restored.rating, 4);
  assert.equal(restored.createdAt, '2026-07-09T00:00:00.000Z');
  assert.equal(restored.body.includes('<script>'), false);
  assert.equal((await reviews.reviewStatistics({ productSlug: 'shirt' })).averageRating, 4);

  await reviews.updateReview(inserted.id, {
    status: 'hidden', deletedAt: '2026-07-15T00:00:00.000Z', moderationReason: 'Customer requested removal'
  }, { actor: 'admin', action: 'soft_deleted', reason: 'Customer requested removal' });
  assert.equal((await reviews.listAdminReviews({ includeDeleted: false })).total, 0);
  assert.equal((await reviews.listAdminReviews({ includeDeleted: true })).total, 1);
  assert.ok((await reviews.listReviewAudit(inserted.id)).length >= 4);
});

test('duplicates are rejected while product and store summaries remain independent', async () => {
  await reviews.insertReview(review());
  await assert.rejects(reviews.insertReview(review()), (error) => error.code === 'review_duplicate');

  await reviews.insertReview(review({
    reviewType: 'store', productSlug: '', reviewerName: 'Store Customer', reviewerEmail: 'store@example.com',
    orderNumber: '', rating: 4, body: 'Fast service.', createdAt: '2026-07-13T00:00:00.000Z'
  }));
  assert.equal((await reviews.reviewStatistics({ reviewType: 'store' })).totalReviews, 1);
  assert.equal((await reviews.reviewStatistics({ productSlug: 'shirt' })).totalReviews, 1);
  assert.deepEqual(await reviews.reviewSummariesByProduct(), {
    shirt: {
      averageRating: 5,
      ratingCount: 1,
      totalReviews: 1,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 },
      hasRatings: true
    }
  });
});

test('admin product rating summary is calculated and read-only source data stays separated by status', async () => {
  await reviews.insertReview(review());
  await reviews.insertReview(review({
    reviewerName: 'Pending R.', reviewerEmail: 'pending-summary@example.com',
    body: 'Pending summary review.', status: 'pending', rating: 4
  }));
  await reviews.insertReview(review({
    reviewerName: 'Hidden R.', reviewerEmail: 'hidden-summary@example.com',
    body: 'Hidden summary review.', status: 'hidden', rating: 3
  }));

  const summary = await reviews.adminRatingSummaryForProduct('shirt');
  assert.equal(summary.averageRating, 5);
  assert.equal(summary.publishedRatedReviews, 1);
  assert.equal(summary.pendingReviews, 1);
  assert.equal(summary.hiddenReviews, 1);
  assert.deepEqual(summary.ratingDistribution, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 });
  assert.match(summary.lastRecalculatedAt, /^\d{4}-\d{2}-\d{2}T/);
});
