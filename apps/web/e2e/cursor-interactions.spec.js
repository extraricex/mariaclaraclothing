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

test('native clickable form controls keep interaction cursors', async ({ page }) => {
  await page.goto('/checkout');
  await expect(page.locator('select').first()).toHaveCSS('cursor', 'pointer');

  await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.dataset.cursorControlProbe = 'true';
    probe.innerHTML = `
      <input aria-label="Checkbox cursor probe" type="checkbox" style="cursor: default">
      <input aria-label="Radio cursor probe" type="radio" style="cursor: default">
      <input aria-label="Disabled checkbox cursor probe" type="checkbox" disabled style="cursor: default">
      <select aria-label="Disabled select cursor probe" disabled style="cursor: default"><option>Disabled</option></select>
    `;
    document.body.append(probe);
  });

  await expect(page.getByLabel('Checkbox cursor probe', { exact: true })).toHaveCSS('cursor', 'pointer');
  await expect(page.getByLabel('Radio cursor probe', { exact: true })).toHaveCSS('cursor', 'pointer');
  await expect(page.getByLabel('Disabled checkbox cursor probe', { exact: true })).toHaveCSS('cursor', 'not-allowed');
  await expect(page.getByLabel('Disabled select cursor probe', { exact: true })).toHaveCSS('cursor', 'not-allowed');
});
