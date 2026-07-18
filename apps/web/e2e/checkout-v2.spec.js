import { test, expect } from '@playwright/test';

const PRODUCT_SLUG = 'oversized-fit-shirt-mc-curiosity-black-maria-clara-clothing-oversized-fit-100-cotton-copy-1';

function openPage(page, path) {
  return page.goto(path, { waitUntil: 'domcontentloaded' });
}

test('customer checkout uses server totals and private confirmation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPage(page, '/');
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

  await openPage(page, `/product/${PRODUCT_SLUG}`);
  await page.getByRole('button', { name: /add to cart/i }).click();
  await page.getByRole('dialog', { name: /your cart/i }).getByRole('link', { name: /^checkout$/i }).click();

  await page.getByRole('button', { name: 'Review order', exact: true }).click();
  await expect(page.getByText('Please enter your first name.', { exact: true })).toBeVisible();
  await expect(page.getByText('Please enter your last name.', { exact: true })).toBeVisible();
  await expect(page.getByText('Please enter a valid mobile number.', { exact: true })).toBeVisible();
  await expect(page.getByText('Please enter your house number and street address.', { exact: true })).toBeVisible();
  await expect(page.getByText('Please select or enter your province.', { exact: true })).toBeVisible();
  await expect(page.getByText('Please select or enter your city or municipality.', { exact: true })).toBeVisible();
  await expect(page.getByText('Please select or enter your barangay.', { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('First name')).toBeFocused();
  await expect(page.getByPlaceholder('First name')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByPlaceholder('Last name')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByPlaceholder('House no. / Street / Building / Unit')).toHaveClass(/checkout-field-error/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByPlaceholder('First name').fill('Phase One');
  await page.getByPlaceholder('Last name').fill('Customer');
  await page.getByPlaceholder('09XXXXXXXXX').fill('+63 917-123-4567');
  await page.getByPlaceholder(/House no/).fill('12 Test Street');

  const selects = page.getByRole('combobox');
  await selects.nth(0).selectOption({ label: 'CAVITE' });
  await selects.nth(1).selectOption({ label: 'IMUS' });
  await selects.nth(2).selectOption({ label: 'BUCANDALA IV' });

  await page.getByRole('button', { name: 'Review order', exact: true }).click();
  await expect(page).toHaveURL(/\/checkout\/review$/);
  await expect(page.getByRole('heading', { name: 'Review and payment', exact: true })).toBeVisible();
  await expect(page.getByText('12 Test Street, BUCANDALA IV, IMUS, CAVITE, Philippines')).toBeVisible();
  await expect(page.getByText('09171234567', { exact: true })).toBeVisible();
  await expect(page.getByText('ZIP Code', { exact: true })).toHaveCount(0);
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

test('review access and direct checkout bypass are blocked without delivery information', async ({ page, request }) => {
  await openPage(page, '/');
  await page.evaluate(() => {
    localStorage.removeItem('maria-clara-cart');
    localStorage.removeItem('maria-clara-cart-session-id');
    sessionStorage.clear();
  });

  const productBefore = await request.get(`/api/products/${PRODUCT_SLUG}`).then((response) => response.json());
  const stockBefore = productBefore.product.variants[0].stockQuantity;
  const product = productBefore.product;
  const variant = product.variants.find((item) => Number(item.stockQuantity || 0) > 0);
  const bypass = await request.post('/api/checkout/quotes', {
    data: {
      cartSessionId: 'missing-address-cart',
      items: [{ productId: product.id, variantId: variant.id, quantity: 1 }],
      address: { houseAddress: '   ', barangay: '', city: '', province: '' }
    }
  });
  const bypassBody = await bypass.json();
  expect(bypass.status()).toBe(400);
  expect(bypassBody).toMatchObject({
    success: false,
    code: 'address_invalid',
    message: 'House address is required.'
  });
  expect(bypassBody.fields).toMatchObject({ street: 'House number and street are required.' });
  expect(bypassBody).not.toHaveProperty('orderNumber');

  const directOrder = await request.post('/api/orders', {
    headers: { 'Idempotency-Key': `missing-address-${Date.now()}` },
    data: {
      paymentMethod: 'cash_on_delivery',
      quoteId: 'missing-address-quote',
      cartSessionId: 'missing-address-cart',
      customer: { firstName: 'Direct', lastName: 'Bypass', phone: '09171234567' }
    }
  });
  expect(directOrder.status()).toBe(404);
  expect(await directOrder.json()).toMatchObject({ code: 'quote_not_found' });

  const productAfter = await request.get(`/api/products/${PRODUCT_SLUG}`).then((response) => response.json());
  expect(productAfter.product.variants[0].stockQuantity).toBe(stockBefore);

  await openPage(page, `/product/${PRODUCT_SLUG}`);
  await page.getByRole('button', { name: /add to cart/i }).click();
  await page.evaluate(() => sessionStorage.removeItem('maria-clara-checkout-review-draft'));
  await openPage(page, '/checkout/review');
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByText('Please complete your delivery information before placing your order.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Place Order|Online Payment/i })).toHaveCount(0);
});

test('checkout validation has no horizontal overflow at supported mobile and tablet widths', async ({ page }) => {
  await openPage(page, '/');
  await page.evaluate(() => {
    localStorage.removeItem('maria-clara-cart');
    localStorage.removeItem('maria-clara-cart-session-id');
    sessionStorage.clear();
  });
  await openPage(page, `/product/${PRODUCT_SLUG}`);
  await page.getByRole('button', { name: /add to cart/i }).click();
  await page.getByRole('dialog', { name: /your cart/i }).getByRole('link', { name: /^checkout$/i }).click();

  for (const width of [320, 360, 390, 430, 768]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1024 });
    await page.getByRole('button', { name: 'Review order', exact: true }).click();
    await expect(page.getByText('Please enter your first name.', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('structured address names and codes survive every supported mobile width and Review navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPage(page, '/');
  await page.evaluate(() => {
    localStorage.removeItem('maria-clara-cart');
    localStorage.removeItem('maria-clara-cart-session-id');
    sessionStorage.clear();
  });
  await openPage(page, `/product/${PRODUCT_SLUG}`);
  await page.getByRole('button', { name: /add to cart/i }).click();
  await page.getByRole('dialog', { name: /your cart/i }).getByRole('link', { name: /^checkout$/i }).click();

  await page.getByPlaceholder('First name').fill('Mobile');
  await page.getByPlaceholder('Last name').fill('Address Test');
  await page.getByPlaceholder('09XXXXXXXXX').fill('09171234567');
  await page.getByPlaceholder(/House no/).fill('123 Sample Street');
  const selects = page.getByRole('combobox');
  await selects.nth(0).selectOption({ label: 'CAVITE' });
  await selects.nth(1).selectOption({ label: 'IMUS' });
  await selects.nth(2).selectOption({ label: 'BUCANDALA IV' });

  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(selects.nth(0)).toHaveValue('CAVITE');
    await expect(selects.nth(1)).toHaveValue('CAVITE|IMUS');
    await expect(selects.nth(2)).toHaveValue('CAVITE|IMUS|BUCANDALA IV');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }

  await page.getByRole('button', { name: 'Review order', exact: true }).click();
  await expect(page).toHaveURL(/\/checkout\/review$/);
  await expect(page.getByText('123 Sample Street, BUCANDALA IV, IMUS, CAVITE, Philippines')).toBeVisible();
  await expect(page.getByText('09171234567', { exact: true })).toBeVisible();
});
