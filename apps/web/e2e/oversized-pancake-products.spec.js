import { test, expect } from '@playwright/test';

const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'admin';
const abotSlug = 'white-1-2-heavy-cotton-premium-quality-crew-neck-soft-fabric-copy';
const cropSlug = 'oranges-mcc-box-tee';
const description = 'Premium oversized shirt made with 240 GSM cotton fabric. Designed for a relaxed streetwear fit with a clean and comfortable feel. Proudly made in the Philippines.';

async function expectNoPageOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth
  }));
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
}

for (const viewport of [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 1000 }
]) {
  test(`oversized product content and size chart work on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`/product/${abotSlug}`);
    await expect(page.getByText(description, { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Product details', exact: true }).click();
    await expect(page.getByText(/Fit: Oversized Fit/)).toBeVisible();
    await expect(page.getByText(/Thickness: 240 GSM/)).toBeVisible();

    await page.getByRole('button', { name: 'Shipping', exact: true }).click();
    await expect(page.getByText(/Estimated delivery: Metro Manila and Cavite 2-4 days\./)).toBeVisible();

    await page.getByRole('button', { name: 'View Size Chart', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Size Chart', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: '2XLarge', exact: true })).toBeVisible();
    await expectNoPageOverflow(page);
  });
}

test('crop product remains outside the oversized template', async ({ request }) => {
  const response = await request.get(`/api/products/${cropSlug}`);
  expect(response.ok()).toBe(true);
  const { product } = await response.json();
  expect(product.description).toContain('CROPPED BOX SHIRT');
  expect(product.description).not.toBe(description);
});

for (const viewport of [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 1000 }
]) {
  test(`admin product sync controls work on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const login = await page.request.post('/api/admin/login', { data: { password: adminPassword } });
    expect(login.ok()).toBe(true);

    await page.goto('/admin/products');
    await expect(page.getByRole('heading', { name: 'Products', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apply oversized template', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sync to Pancake POS', exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Variants: \d+\/\d+ mapped/).first()).toBeVisible();
    await expectNoPageOverflow(page);

    await page.getByRole('link', { name: /ABOT KAMAY WHITE/i }).click();
    await expect(page.getByRole('button', { name: 'Sync to Pancake POS', exact: true })).toBeVisible();
    const syncStatus = page.getByRole('region', { name: 'Pancake product sync status' });
    await expect(syncStatus).toBeVisible();
    await expect(syncStatus.getByText('Pancake: missing mapping', { exact: true })).toBeVisible();
    await expect(syncStatus.getByText(/Missing Pancake variant ID/).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sync to Pancake POS', exact: true })).toBeDisabled();
    await expectNoPageOverflow(page);
  });
}
