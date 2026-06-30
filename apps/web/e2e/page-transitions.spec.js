import { test, expect } from '@playwright/test';

test('storefront navigation animates content, preserves chrome, and resets scroll', async ({ page }) => {
  await page.goto('/');
  const header = page.locator('header');
  await header.evaluate((element) => { window.__storefrontHeader = element; });

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.locator('footer').getByRole('link', { name: 'FAQ' }).click();

  await expect(page).toHaveURL(/\/faq$/);
  const transition = page.locator('.page-transition');
  await expect(transition).toHaveCSS('animation-name', 'page-enter');
  await expect(transition).toHaveCSS('animation-duration', '0.32s');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(header).toBeVisible();
  expect(await header.evaluate((element) => element === window.__storefrontHeader)).toBe(true);

  const firstSection = page.locator('details').first();
  await firstSection.locator('summary').click();
  await expect(firstSection).not.toHaveAttribute('open', '');
});

test('reduced motion shows routed content immediately', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/faq');

  const transition = page.locator('.page-transition');
  await expect(transition).toHaveCSS('animation-name', 'none');
  await expect(transition).toHaveCSS('transform', 'none');
  await expect(page.getByRole('heading', { name: /frequently asked questions/i })).toBeVisible();
});
