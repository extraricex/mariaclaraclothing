import { test, expect } from '@playwright/test';

const collectionName = process.env.TEST_COLLECTION_NAME || '';
const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'admin';
let adminCsrf = '';

test.beforeEach(async ({ page }) => {
  const response = await page.request.post('/api/admin/login', { data: { password: adminPassword } });
  expect(response.ok()).toBe(true);
  adminCsrf = (await response.json()).csrfToken;
});

test('admin creates a collection, assigns a product, and exposes it to customers', async ({ page }) => {
  test.skip(!collectionName, 'Set TEST_COLLECTION_NAME to run the stateful collection test.');
  let originalProduct = null;

  try {
    await page.goto('/admin/collections');
    await page.getByLabel('New collection name').fill(collectionName);
    await page.getByRole('button', { name: 'Create collection', exact: true }).click();
    await expect(page.getByRole('button', { name: new RegExp(collectionName) })).toBeVisible();

    const productSelector = page.locator('select').first();
    const productSlug = await productSelector.locator('option').nth(1).getAttribute('value');
    expect(productSlug).toBeTruthy();
    const productResponse = await page.request.get(`/api/admin/products/${encodeURIComponent(productSlug)}`);
    originalProduct = (await productResponse.json()).product;

    await productSelector.selectOption(productSlug);
    await expect(page.getByRole('status')).toContainText('Product assignment updated.');

    await page.goto('/');
    await expect(page.getByRole('heading', { name: collectionName, exact: true })).toBeVisible();
  } finally {
    if (originalProduct) {
      await page.request.put(`/api/admin/products/${encodeURIComponent(originalProduct.slug)}`, {
        headers: { 'X-CSRF-Token': adminCsrf },
        data: originalProduct
      });
    }
  }
});
