import { test, expect } from '@playwright/test';

const PRODUCT_SLUG = 'oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1';

test('unknown routes return 404 and render a useful not-found page', async ({ page }) => {
  const response = await page.goto('/this-route-does-not-exist');
  expect(response.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to shop', exact: true })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
});

test('unknown products leave loading and render a noindex product-not-found state', async ({ page }) => {
  const response = await page.goto('/product/this-product-does-not-exist');
  expect(response.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Product not found', exact: true })).toBeVisible();
  await expect(page.getByText('Loading…')).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
});

test('Freedom of Mind hash and category navigation reach real collection content', async ({ page }) => {
  await page.goto('/#freedom-of-mind');
  const section = page.locator('#freedom-of-mind');
  await expect(section.getByRole('heading', { name: 'Freedom of Mind', exact: true })).toBeVisible();
  await expect(section).toBeInViewport();

  await page.goto(`/product/${PRODUCT_SLUG}`);
  const category = page.getByRole('navigation', { name: 'Shop categories' }).getByRole('link', { name: 'Freedom of Mind', exact: true });
  await expect(category).toHaveAttribute('href', '/collections/freedom-of-mind');
  await category.click();
  await expect(page).toHaveURL(/\/collections\/freedom-of-mind$/);
  await expect(page.getByRole('heading', { name: 'Freedom of Mind', exact: true })).toBeVisible();
});

test('issue and logged-out mobile account controls have consistent names', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Report an issue', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
  const menu = page.getByRole('dialog', { name: 'Menu items' });
  await expect(menu.getByRole('link', { name: 'Log in', exact: true })).toHaveAttribute('href', '/login');
});
