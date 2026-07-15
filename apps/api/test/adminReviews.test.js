const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-admin-reviews-'));
const token = 'review-admin-token-12345678901234567890';
const environmentKeys = [
  'APP_ENV', 'DATABASE_URL', 'ADMIN_TOKEN', 'REVIEWS_DATA_FILE', 'STORE_SETTINGS_FILE',
  'ADMIN_CREDENTIALS_FILE', 'PRODUCTS_DATA_FILE'
];
const previousEnvironment = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
Object.assign(process.env, {
  APP_ENV: 'development',
  DATABASE_URL: '',
  ADMIN_TOKEN: token,
  REVIEWS_DATA_FILE: path.join(directory, 'reviews.json'),
  STORE_SETTINGS_FILE: path.join(directory, 'settings.json'),
  ADMIN_CREDENTIALS_FILE: path.join(directory, 'credentials.json'),
  PRODUCTS_DATA_FILE: path.join(__dirname, '..', 'data', 'products.json')
});

const { createApp } = require('../src/app');
const { insertReview, resetReviewRepositoryForTests } = require('../src/reviews/reviewRepository');
const { listEditableProducts } = require('../src/products/catalogRepository');

let server;
let baseUrl;
let review;

function adminOptions(method = 'GET', body) {
  return {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  };
}

test.before(async () => {
  await resetReviewRepositoryForTests();
  const product = (await listEditableProducts())[0];
  review = await insertReview({
    productSlug: product.slug,
    reviewerName: 'Admin Test Customer',
    reviewerEmail: 'private-admin-test@example.com',
    orderNumber: 'MCC-NOT-DELIVERED',
    rating: 2,
    title: 'Constructive feedback',
    body: 'This legitimate criticism must remain eligible for publication.',
    status: 'pending',
    source: 'customer_submitted'
  });
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

test('all review administration and workbook downloads require admin authentication', async () => {
  for (const endpoint of ['/api/admin/reviews', '/api/admin/reviews/settings', '/api/admin/reviews/import/template']) {
    assert.equal((await fetch(`${baseUrl}${endpoint}`)).status, 401);
    assert.equal((await fetch(`${baseUrl}${endpoint}`, adminOptions())).status, 200);
  }
});

test('hidden moderation and deletion require a reason and preserve genuine criticism', async () => {
  const missingReason = await fetch(`${baseUrl}/api/admin/reviews/${review.id}/moderate`, adminOptions('POST', { action: 'hide' }));
  assert.equal(missingReason.status, 400);

  const hiddenResponse = await fetch(`${baseUrl}/api/admin/reviews/${review.id}/moderate`, adminOptions('POST', {
    action: 'hide', reason: 'Personal information'
  }));
  assert.equal(hiddenResponse.status, 200);
  const hidden = (await hiddenResponse.json()).review;
  assert.equal(hidden.status, 'hidden');
  assert.equal(hidden.body, 'This legitimate criticism must remain eligible for publication.');

  const clearReason = await fetch(`${baseUrl}/api/admin/reviews/${review.id}`, adminOptions('PUT', {
    status: 'hidden', moderationReason: ''
  }));
  assert.equal(clearReason.status, 400);

  const missingDeleteReason = await fetch(`${baseUrl}/api/admin/reviews/${review.id}`, adminOptions('DELETE', {}));
  assert.equal(missingDeleteReason.status, 400);
});

test('admin cannot forge Verified Purchase without a delivered matching order', async () => {
  const response = await fetch(`${baseUrl}/api/admin/reviews/${review.id}`, adminOptions('PUT', {
    verifiedPurchase: true
  }));
  const body = await response.json();
  assert.equal(response.status, 409);
  assert.equal(body.code, 'review_verification_failed');
});
