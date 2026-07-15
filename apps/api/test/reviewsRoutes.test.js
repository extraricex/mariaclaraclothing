const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-review-routes-'));
const reviewsFile = path.join(directory, 'reviews.json');
const settingsFile = path.join(directory, 'settings.json');
const productsFile = path.join(directory, 'products.json');
fs.copyFileSync(path.join(__dirname, '..', 'data', 'products.json'), productsFile);

const previousEnvironment = Object.fromEntries(['REVIEWS_DATA_FILE', 'STORE_SETTINGS_FILE', 'PRODUCTS_DATA_FILE'].map((key) => [key, process.env[key]]));
process.env.REVIEWS_DATA_FILE = reviewsFile;
process.env.STORE_SETTINGS_FILE = settingsFile;
process.env.PRODUCTS_DATA_FILE = productsFile;

const { createApp } = require('../src/app');
const reviewRepository = require('../src/reviews/reviewRepository');
const { updateSettingsSection } = require('../src/settings/storeSettingsRepository');

let server;
let baseUrl;

test.before(async () => {
  await reviewRepository.resetReviewRepositoryForTests();
  server = await new Promise((resolve, reject) => {
    const listener = createApp().listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  for (const [key, value] of Object.entries(previousEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(directory, { recursive: true, force: true });
});

test('customer submission stays Pending, moderation publishes it, and public output stays private', async () => {
  const productsResponse = await fetch(`${baseUrl}/api/products`);
  const productsBody = await productsResponse.json();
  const product = productsBody.products[0];
  assert.ok(product?.slug);

  const form = new FormData();
  form.set('reviewerName', 'Route Customer');
  form.set('reviewerEmail', 'route-private@example.com');
  form.set('rating', '5');
  form.set('title', 'Route-tested review');
  form.set('body', 'This review is saved in the real repository and awaits moderation.');
  form.set('orderNumber', 'MCC-NOT-A-REAL-ORDER');
  form.set('consent', 'true');
  form.set('website', '');
  const submittedResponse = await fetch(`${baseUrl}/api/reviews/products/${encodeURIComponent(product.publicHandle || product.slug)}`, {
    method: 'POST', body: form
  });
  const submitted = await submittedResponse.json();
  assert.equal(submittedResponse.status, 201);
  assert.equal(submitted.status, 'pending');
  assert.equal(submitted.message, 'Thank you! Your review has been submitted for approval.');

  const before = await fetch(`${baseUrl}/api/reviews/products/${encodeURIComponent(product.slug)}`).then((response) => response.json());
  assert.equal(before.statistics.totalReviews, 0);
  assert.equal(before.reviews.length, 0);

  const pending = await reviewRepository.findReviewById(submitted.id);
  assert.equal(pending.verifiedPurchase, false);
  assert.equal(pending.orderNumber, 'MCC-NOT-A-REAL-ORDER');
  await reviewRepository.updateReview(pending.id, {
    status: 'published',
    adminReply: 'Thank you for sharing your experience.',
    adminReplyDate: '2026-07-15T05:00:00.000Z'
  }, { actor: 'admin', action: 'publish' });

  const after = await fetch(`${baseUrl}/api/reviews/products/${encodeURIComponent(product.slug)}?rating=5&sort=highest`).then((response) => response.json());
  assert.equal(after.statistics.totalReviews, 1);
  assert.equal(after.statistics.averageRating, 5);
  assert.equal(after.reviews.length, 1);
  assert.equal(after.reviews[0].adminReply, 'Thank you for sharing your experience.');
  const publicJson = JSON.stringify(after.reviews[0]);
  assert.equal(publicJson.includes('route-private@example.com'), false);
  assert.equal(publicJson.includes('MCC-NOT-A-REAL-ORDER'), false);
});

test('global and per-product switches hide and restore reviews without deleting records', async () => {
  const products = JSON.parse(fs.readFileSync(productsFile, 'utf8'));
  const product = products[0];
  const endpoint = `${baseUrl}/api/reviews/products/${encodeURIComponent(product.slug)}`;

  await updateSettingsSection('reviews', { enabled: false });
  assert.equal((await fetch(endpoint).then((response) => response.json())).enabled, false);
  assert.equal((await reviewRepository.reviewStatistics({ productSlug: product.slug })).totalReviews, 1);

  await updateSettingsSection('reviews', { enabled: true, showOnProductPages: true, allowCustomerSubmissions: true });
  assert.equal((await fetch(endpoint).then((response) => response.json())).enabled, true);

  products[0].reviewSettings = { reviewsEnabled: false, showRatingSummary: true };
  fs.writeFileSync(productsFile, `${JSON.stringify(products, null, 2)}\n`);
  assert.equal((await fetch(endpoint).then((response) => response.json())).enabled, false);

  products[0].reviewSettings.reviewsEnabled = true;
  fs.writeFileSync(productsFile, `${JSON.stringify(products, null, 2)}\n`);
  const restored = await fetch(endpoint).then((response) => response.json());
  assert.equal(restored.enabled, true);
  assert.equal(restored.statistics.totalReviews, 1);
});
