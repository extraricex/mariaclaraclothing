import { test, expect } from '@playwright/test';

const PRODUCT_SLUG = 'oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1';

test('enabled controls and nested content keep the hand pointer', async ({ page }) => {
  await page.goto('/');
  const menuLink = page.getByRole('link', { name: 'FAQ' }).first();
  await expect(menuLink).toHaveCSS('cursor', 'pointer');

  const menuChild = menuLink.locator('span[data-cursor-probe]');
  await menuLink.evaluate((element) => {
    const span = document.createElement('span');
    span.dataset.cursorProbe = 'true';
    span.style.cursor = 'default';
    span.textContent = ' probe';
    element.append(span);
  });
  await expect(menuChild).toHaveCSS('cursor', 'pointer');
});

test('disabled controls keep a not-allowed cursor', async ({ page }) => {
  await page.goto(`/product/${PRODUCT_SLUG}`);
  const disabledSize = page.locator('button:disabled').filter({ hasText: /xxxl/i }).first();
  await expect(disabledSize).toHaveCSS('cursor', 'not-allowed');
});
