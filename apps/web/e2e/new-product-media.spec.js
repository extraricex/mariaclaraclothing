import { test, expect } from '@playwright/test';

test('new product queues and removes a customer photo', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('maria-clara-admin-token', 'local-admin-token'));
  await page.goto('/admin/products/new');

  await page.getByLabel('Add photos').setInputFiles({
    name: 'customer-photo.png',
    mimeType: 'image/png',
    buffer: Buffer.from('customer photo')
  });
  await expect(page.getByAltText('Customer product preview')).toBeVisible();

  await page.getByRole('button', { name: 'Remove photo' }).click();
  await expect(page.getByAltText('Customer product preview')).toHaveCount(0);
});

test('new product selects multiple storefront collections', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('maria-clara-admin-token', 'local-admin-token'));
  await page.goto('/admin/products/new');
  await page.getByRole('button', { name: 'Select collections' }).click();
  await page.getByLabel('New Arrivals').check();
  await page.getByLabel('Freedom of Mind').check();
  await expect(page.getByRole('button', { name: /New Arrivals, Freedom of Mind/ })).toBeVisible();
});
