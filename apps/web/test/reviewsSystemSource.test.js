import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const productReviews = fs.readFileSync(new URL('../src/components/ProductReviews.jsx', import.meta.url), 'utf8');
const adminReviews = fs.readFileSync(new URL('../src/admin/Reviews.jsx', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const productCard = fs.readFileSync(new URL('../src/components/ProductCard.jsx', import.meta.url), 'utf8');
const productPage = fs.readFileSync(new URL('../src/pages/Product.jsx', import.meta.url), 'utf8');
const publicReviewRoute = fs.readFileSync(new URL('../../api/src/routes/reviews.js', import.meta.url), 'utf8');
const nginx = fs.readFileSync(new URL('../nginx.conf', import.meta.url), 'utf8');

test('customer reviews expose real summaries, filters, photos, replies, verification, and submission', () => {
  for (const expected of [
    'Customer Reviews', 'Write a Review', 'All ratings', 'Most Recent', 'Highest Rated', 'Lowest Rated',
    'Most Helpful', 'With photos', 'Verified purchases', 'Verified Purchase',
    'Response from Maria Clara Clothing', 'submitProductReview', 'Customer review photo'
  ]) assert.match(productReviews, new RegExp(expected));
  assert.match(productReviews, /No published reviews match these filters/);
  assert.match(publicReviewRoute, /Thank you! Your review has been submitted for approval\./);
  assert.doesNotMatch(productReviews, /review\.reviewerEmail|review\.orderNumber/);
});

test('ratings use published API summaries and honor global and per-product visibility', () => {
  assert.match(productCard, /reviewSummary\?\.totalReviews/);
  assert.match(productCard, /showRatingsOnProductCards/);
  assert.match(productCard, /reviewSettings\?\.reviewsEnabled/);
  assert.match(productPage, /showOnProductPages/);
  assert.match(productPage, /reviewSettings\?\.reviewsEnabled/);
  assert.match(productReviews, /showRatingSummary/);
  assert.match(productPage, /<ProductReviews product=\{product\}/);
});

test('admin routes cover moderation, settings, import preview, bulk actions, audit, and deletion', () => {
  assert.match(app, /path="reviews"/);
  assert.match(app, /path="reviews\/import"/);
  assert.match(app, /path="reviews\/settings"/);
  assert.ok(nginx.includes('|/reviews(?:/import|/settings)?|'));
  const routeLine = nginx.split('\n').find((line) => line.trim().startsWith('location ~ ^/(?:collections'));
  const routePattern = routeLine.trim().replace(/^location ~ /, '').replace(/ \{$/, '');
  const productionSpaRoute = new RegExp(routePattern);
  for (const path of ['/admin/reviews', '/admin/reviews/', '/admin/reviews/import', '/admin/reviews/settings']) {
    assert.match(path, productionSpaRoute);
  }
  for (const expected of [
    'Global review visibility', 'Download Review Import Template', 'Preview import', 'Import preview',
    'Bulk moderation action saved', 'Moderation reason', 'Audit history', 'Soft delete',
    'Permanent delete', 'Verified Purchase (requires live order match)', 'Deleted', 'Review date'
  ]) assert.match(adminReviews, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
