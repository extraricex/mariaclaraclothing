import { test, expect } from '@playwright/test';

const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'admin';

test('Freedom of Mind replaces Best Seller and opens its assigned products', async ({ page }) => {
  const settingsResponse = await page.request.get('/api/storefront-settings');
  expect(settingsResponse.ok()).toBe(true);
  const settings = (await settingsResponse.json()).settings;
  const freedom = settings.collectionDefinitions.find((collection) => collection.slug === 'freedom-of-mind');
  expect(freedom).toMatchObject({ visible: true, showOnHomepage: true, showOnShop: true });

  const productsResponse = await page.request.get('/api/products');
  const catalog = (await productsResponse.json()).products;
  const freedomProducts = catalog.filter((product) => (product.collections || []).some((name) => name.toLowerCase() === 'freedom of mind'));
  expect(freedomProducts.length).toBeGreaterThan(0);

  await page.goto('/');
  const freedomSection = page.locator('#freedom-of-mind');
  await expect(freedomSection.getByRole('heading', { name: 'Freedom of Mind', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Best Seller', exact: true })).toHaveCount(0);
  await freedomSection.getByRole('link', { name: 'View collection' }).click();
  await expect(page).toHaveURL(/\/collections\/freedom-of-mind$/);
  await expect(page.getByRole('heading', { name: 'Freedom of Mind', exact: true })).toBeVisible();
  await expect(page.locator('main article')).toHaveCount(freedomProducts.length);
});

for (const viewport of [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 1000 }
]) {
  test(`collection page has no horizontal overflow on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/collections/freedom-of-mind');
    await expect(page.getByRole('heading', { name: 'Freedom of Mind', exact: true })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      body: document.body.scrollWidth,
      document: document.documentElement.scrollWidth,
      viewport: window.innerWidth
    }));
    expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  });
}

test('admin collection editor exposes placement, order, image, and assignment controls', async ({ page }) => {
  const login = await page.request.post('/api/admin/login', { data: { password: adminPassword } });
  expect(login.ok()).toBe(true);
  await page.goto('/admin/collections');
  await expect(page.getByRole('heading', { name: 'Collections', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Freedom of Mind/ }).click();
  await expect(page.getByLabel('Collection name', { exact: true })).toHaveValue('Freedom of Mind');
  await expect(page.getByLabel('Show on Homepage')).toBeChecked();
  await expect(page.getByLabel('Show in Shop categories')).toBeChecked();
  await expect(page.getByLabel('Sort order')).toHaveValue('2');
  await expect(page.getByLabel('Upload image')).toBeVisible();
  await expect(page.getByLabel('Add product to Freedom of Mind')).toBeVisible();
});

test('admin collection editor fits a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const login = await page.request.post('/api/admin/login', { data: { password: adminPassword } });
  expect(login.ok()).toBe(true);
  await page.goto('/admin/collections');
  await expect(page.getByRole('heading', { name: 'Collections', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Freedom of Mind/ }).click();
  await expect(page.getByLabel('Collection name', { exact: true })).toHaveValue('Freedom of Mind');
  const dimensions = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth
  }));
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
});
