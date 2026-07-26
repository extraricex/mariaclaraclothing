import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../api/public');
const LARGE_JPEG = path.join(API_PUBLIC, 'MANDALA WHITE', 'mandala3rd.jpg');
const TRANSPARENT_PNG = path.join(API_PUBLIC, 'uploads', 'products', 'oranges-mcc-box-tee-1781162364372-494817ca92b258.png');
const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'admin';
let adminCsrf = '';

test.beforeEach(async ({ page }) => {
  const response = await page.request.post('/api/admin/login', { data: { password: adminPassword } });
  expect(response.ok()).toBe(true);
  adminCsrf = (await response.json()).csrfToken;
});

test('new product batches, sorts, and removes customer photos', async ({ page }) => {
  await page.goto('/admin/products/new');

  await page.getByLabel('Add photos').setInputFiles([
    { name: 'front.png', mimeType: 'image/png', buffer: Buffer.from('front photo') },
    { name: 'back.png', mimeType: 'image/png', buffer: Buffer.from('back photo') }
  ]);
  const photos = page.locator('[data-queued-photo]');
  await expect(photos).toHaveCount(2);
  await expect(photos.first()).toContainText('front.png');
  await expect(photos.first()).toContainText('Storefront cover');

  await photos.nth(1).dragTo(photos.first());
  await expect(photos.first()).toContainText('back.png');
  await expect(photos.first()).toContainText('Storefront cover');

  await photos.first().getByRole('button', { name: 'Move last' }).click();
  await expect(photos.first()).toContainText('front.png');
  await expect(photos.first()).toContainText('Storefront cover');

  await photos.last().getByRole('button', { name: 'Remove photo' }).click();
  await expect(photos).toHaveCount(1);
});

test('new product selects multiple storefront collections', async ({ page }) => {
  await page.route('**/api/admin/collections', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      response,
      json: {
        ...body,
        collections: [...new Set([...(body.collections || []), 'Freedom of Mind'])]
      }
    });
  });
  await page.goto('/admin/products/new');
  await page.getByRole('button', { name: 'Select collections' }).click();
  await page.getByLabel('New Arrivals').check();
  await page.getByLabel('Freedom of Mind').check();
  await expect(page.getByRole('button', { name: /New Arrivals, Freedom of Mind/ })).toBeVisible();
});

test('new product validates before sending a create request', async ({ page }) => {
  let createRequests = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/admin/products')) createRequests += 1;
  });
  await page.goto('/admin/products/new');
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('active');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Enter a product title.' })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Enter a price greater than zero.' })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Select at least one storefront collection.' })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Enter inventory before publishing an active product.' })).toBeVisible();
  expect(createRequests).toBe(0);
});

test('active product saves to admin and customer catalogs with reordered photos', async ({ page }) => {
  const productName = `Browser Product ${Date.now()}`;
  let slug = '';
  try {
    await page.goto('/admin/products/new');
    await page.getByLabel('Title', { exact: true }).fill(productName);
    await page.getByLabel('Price (₱)').fill('699');
    await page.getByLabel('Stock for variant 1', { exact: true }).fill('4');
    await page.getByLabel('Add photos').setInputFiles([LARGE_JPEG, TRANSPARENT_PNG]);
    const photos = page.locator('[data-queued-photo]');
    await photos.nth(1).getByRole('button', { name: 'Move first' }).click();
    await page.getByRole('button', { name: 'Select collections' }).click();
    await page.getByLabel('New Arrivals').check();

    const responsePromise = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/admin/products'));
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const createResponse = await responsePromise;
    const createBody = await createResponse.json();
    slug = createBody.product?.slug || '';

    expect(createResponse.status()).toBe(201);
    expect(createBody.product.status).toBe('active');
    expect(createBody.product.collections).toContain('New Arrivals');
    expect(createBody.product.images.map((image) => image.sortOrder)).toEqual([0, 1]);
    expect(createBody.product.images.every((image) => /-optimized\.webp$/.test(image.url))).toBe(true);

    const adminResponse = await page.request.get(`/api/admin/products?q=${encodeURIComponent(productName)}`);
    const adminBody = await adminResponse.json();
    expect(adminBody.products.some((product) => product.slug === slug)).toBe(true);

    const storefrontResponse = await page.request.get(`/api/products/${encodeURIComponent(slug)}`);
    expect(storefrontResponse.status()).toBe(200);
    const catalogResponse = await page.request.get('/api/products');
    const catalogBody = await catalogResponse.json();
    expect(catalogBody.products.some((product) => product.slug === slug)).toBe(true);
  } finally {
    if (slug) {
      await page.request.delete(`/api/admin/products/${encodeURIComponent(slug)}`, {
        headers: { 'X-CSRF-Token': adminCsrf }
      });
    }
  }
});
