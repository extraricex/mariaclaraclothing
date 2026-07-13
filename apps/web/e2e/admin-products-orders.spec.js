import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'admin';

async function login(page) {
  const response = await page.request.post('/api/admin/login', { data: { password: adminPassword } });
  expect(response.ok()).toBe(true);
}

async function expectNoPageOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth
  }));
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('product import preview, exports, menus, and archive confirmation are operational', async ({ page }) => {
  await page.goto('/admin/products');
  await expect(page.getByRole('heading', { name: 'Products', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Import CSV' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import products' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('CSV file').setInputFiles({
    name: 'invalid-products.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from([
      'product_name,slug,status,price_php,size,sku,stock',
      'Unsafe Product,unsafe-product,draft,699.00,Small,=FORMULA,1'
    ].join('\n'))
  });
  await dialog.getByRole('button', { name: 'Preview import' }).click();
  await expect(dialog.getByText('Invalid:')).toContainText('1');
  await expect(dialog.getByText(/spreadsheet formula character/i)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Download row report' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close product import' }).click();

  const activeRow = page.locator('tbody tr').filter({
    has: page.locator('span', { hasText: /^active$/i })
  }).first();
  const firstActions = activeRow.getByRole('button', { name: 'Actions', exact: true });
  await firstActions.click();
  const menu = page.getByRole('menu', { name: 'Actions' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Edit' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Duplicate' })).toBeVisible();
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitem', { name: 'Delete product' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(firstActions).toBeFocused();

  await firstActions.click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export product' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  const csv = await fs.readFile(await download.path(), 'utf8');
  expect(csv).toContain('product_id');
  expect(csv).toContain('pancake_sync_status');
  expect(csv).not.toContain('PANCAKE_API_KEY');

  await firstActions.click();
  await page.getByRole('menuitem', { name: 'Delete product' }).click();
  const confirmation = page.getByRole('alertdialog');
  await expect(confirmation).toContainText('previous order records will remain available');
  await expect(confirmation).toContainText('does not delete the connected Pancake POS product');
  await confirmation.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirmation).toBeHidden();
});

test('product and order operations stay within a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/products');
  await expectNoPageOverflow(page);

  const activeRow = page.locator('tbody tr').filter({
    has: page.locator('span', { hasText: /^active$/i })
  }).first();
  await activeRow.getByRole('button', { name: 'Actions', exact: true }).click();
  const productMenu = page.getByRole('menu', { name: 'Actions' });
  const menuBox = await productMenu.boundingBox();
  expect(menuBox.x).toBeGreaterThanOrEqual(0);
  expect(menuBox.y).toBeGreaterThanOrEqual(0);
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(390);
  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(844);
  await page.keyboard.press('Escape');

  await page.goto('/admin/orders');
  await expectNoPageOverflow(page);
  await expect(page.getByLabel('Payment status filter')).toBeVisible();
  await expect(page.getByLabel('Fulfillment status filter')).toBeVisible();
  await expect(page.getByLabel('Sort orders')).toBeVisible();
});

test('order filtering, CSV export, details, and action menu use real data', async ({ page }) => {
  const listResponse = await page.request.get('/api/admin/orders?pageSize=1');
  expect(listResponse.ok()).toBe(true);
  const list = await listResponse.json();
  test.skip(!list.orders?.length, 'No local order exists for the order UI regression.');
  const orderNumber = list.orders[0].orderNumber;

  await page.goto('/admin/orders');
  await page.getByPlaceholder('Search name, phone, order no.').fill(orderNumber);
  await expect(page.getByRole('link', { name: orderNumber, exact: true })).toBeVisible();
  await page.getByLabel('Sort orders').selectOption('total_desc');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadPromise;
  const csv = await fs.readFile(await download.path(), 'utf8');
  expect(csv).toContain(orderNumber);
  expect(csv).toContain('Pancake Sync Status');
  expect(csv).not.toContain('PAYMONGO_SECRET_KEY');

  await page.getByRole('link', { name: orderNumber, exact: true }).click();
  await expect(page.getByRole('heading', { name: orderNumber, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'More actions' }).click();
  const menu = page.getByRole('menu', { name: 'More actions' });
  await expect(menu.getByRole('menuitem', { name: 'Copy order number' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Discard unsaved changes' })).toBeDisabled();
  await expect(menu.getByRole('menuitem', { name: 'View all orders' })).toBeVisible();
});
