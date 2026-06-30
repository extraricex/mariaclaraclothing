import { test, expect } from '@playwright/test';

const PRODUCT_SLUG = 'oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1';

test('storefront navigation animates content, preserves chrome, and resets scroll', async ({ page }) => {
  await page.goto('/');
  const header = page.locator('header');
  await header.evaluate((element) => { window.__storefrontHeader = element; });

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.locator('footer').getByRole('link', { name: 'FAQ' }).click();

  await expect(page).toHaveURL(/\/faq$/);
  const transition = page.locator('.page-transition');
  await expect(transition).toHaveCSS('animation-name', 'page-enter');
  await expect(transition).toHaveCSS('animation-duration', '0.75s');
  await expect(transition).toHaveCSS('background-color', 'rgb(241, 241, 241)');
  await expect.poll(
    () => transition.evaluate((element) => getComputedStyle(element).transform),
    { timeout: 1500 }
  ).toBe('none');
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

test('mobile product page keeps responsive width and blended photo backgrounds', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/product/${PRODUCT_SLUG}`);
  const transition = page.locator('.page-transition');
  await expect.poll(
    () => transition.evaluate((element) => getComputedStyle(element).transform),
    { timeout: 1500 }
  ).toBe('none');

  const layout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    pageTransform: getComputedStyle(document.querySelector('.page-transition')).transform,
    pageBackground: getComputedStyle(document.documentElement).backgroundColor,
  }));

  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.pageTransform).toBe('none');
  expect(layout.pageBackground).toBe('rgb(241, 241, 241)');
  await expect(page.locator('.product-photo-blend').first()).toHaveCSS('mix-blend-mode', 'multiply');
});
