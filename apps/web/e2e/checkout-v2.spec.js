import { test, expect } from '@playwright/test';

const PRODUCT_SLUG = 'oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1';

test('customer checkout uses server totals and private confirmation', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.removeItem('maria-clara-cart');
    localStorage.removeItem('maria-clara-cart-session-id');
    sessionStorage.clear();
  });

  let orderRequest;
  let orderCreateCount = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/orders') {
      orderCreateCount += 1;
      orderRequest = {
        body: request.postDataJSON(),
        idempotencyKey: request.headers()['idempotency-key']
      };
    }
  });

  await page.goto(`/product/${PRODUCT_SLUG}`);
  await page.getByRole('button', { name: /add to cart/i }).click();
  await page.getByRole('dialog', { name: /your cart/i }).getByRole('link', { name: /^checkout$/i }).click();

  await page.getByRole('button', { name: 'Continue to Checkout', exact: true }).click();
  await expect(page.getByText('First Name is required.', { exact: true })).toBeVisible();
  await expect(page.getByText('Last Name is required.', { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('First name')).toBeFocused();
  await expect(page.getByPlaceholder('First name')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByPlaceholder('Last name')).toHaveAttribute('aria-invalid', 'true');

  await page.getByPlaceholder('First name').fill('Phase One');
  await page.getByPlaceholder('Last name').fill('Customer');
  await page.getByPlaceholder(/Mobile number/).fill('09171234567');
  await page.getByPlaceholder(/House no/).fill('12 Test Street');

  const selects = page.getByRole('combobox');
  await selects.nth(0).selectOption({ label: 'CAVITE' });
  await selects.nth(1).selectOption({ label: 'IMUS' });
  await selects.nth(2).selectOption({ label: 'BUCANDALA IV' });

  await page.getByRole('button', { name: 'Continue to Checkout', exact: true }).click();
  await expect(page).toHaveURL(/\/checkout\/review$/);
  await expect(page.getByRole('heading', { name: 'Review and payment', exact: true })).toBeVisible();
  await expect(page.getByText('12 Test Street, BUCANDALA IV, IMUS, CAVITE, Philippines')).toBeVisible();
  expect(orderCreateCount).toBe(0);
  await page.getByRole('button', { name: 'Place Order - Cash on Delivery', exact: true }).click();

  await expect(page).toHaveURL(/\/thank-you\?order=/);
  await expect(page.getByText(/Order received/i)).toBeVisible();
  await expect(page.getByText(/Total due/i)).toBeVisible();
  expect(orderCreateCount).toBe(1);
  expect(orderRequest.idempotencyKey).toBeTruthy();
  expect(orderRequest.body.quoteId).toBeTruthy();
  expect(orderRequest.body.customer).toMatchObject({
    firstName: 'Phase One',
    lastName: 'Customer',
    fullName: 'Phase One Customer'
  });
  for (const forbidden of ['items', 'shippingFeeCents', 'shippingRegion', 'totalCents']) {
    expect(orderRequest.body).not.toHaveProperty(forbidden);
  }
});
