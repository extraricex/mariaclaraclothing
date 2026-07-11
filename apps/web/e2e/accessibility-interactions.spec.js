import { test, expect } from '@playwright/test';

const PRODUCT_SLUG = 'oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1';

test('cart drawer traps focus, closes with Escape, and restores focus', async ({ page }) => {
  await page.goto(`/product/${PRODUCT_SLUG}`);
  const addButton = page.getByRole('button', { name: /add to cart/i });
  await addButton.click();

  const dialog = page.getByRole('dialog', { name: /your cart/i });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: /^close$/i })).toBeFocused();
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');

  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('link', { name: /view cart/i })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(addButton).toBeFocused();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
});

test('mobile menu closes with Escape and restores trigger focus', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');

  const menuButton = page.getByRole('button', { name: /open navigation menu/i });
  await menuButton.click();
  await expect(page.locator('#storefront-mobile-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menuButton).toBeFocused();
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
});

test('homepage slides auto-advance and dots support manual touch navigation', async ({ page }) => {
  await page.route('**/api/site-content', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.siteContent = {
      ...(body.siteContent || {}),
      homepageBanners: [
        { url: '/brand/logo.png', altText: 'Banner one' },
        { url: '/brand/logo.png', altText: 'Banner two' }
      ]
    };
    await route.fulfill({ response, json: body });
  });
  await page.goto('/');
  const dots = page.getByRole('button', { name: /show banner/i });
  await expect(dots).toHaveCount(2);

  const first = dots.nth(0);
  await expect(first).toHaveAttribute('aria-current', 'true');
  await expect(dots.nth(1)).toHaveAttribute('aria-current', 'true', { timeout: 7000 });

  const box = await dots.nth(1).boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await first.click();
  await expect(first).toHaveAttribute('aria-current', 'true');
});
