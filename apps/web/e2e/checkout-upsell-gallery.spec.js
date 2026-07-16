import { test, expect } from '@playwright/test';

const PRODUCT_HANDLE = 'curiosity-black';

async function pageOverflowMetrics(page) {
  return page.evaluate(() => {
    const previousX = window.scrollX;
    const previousY = window.scrollY;
    window.scrollTo(10_000, previousY);
    const maxScrollX = window.scrollX;
    window.scrollTo(previousX, previousY);
    return {
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      maxScrollX,
    strip: (() => {
      const strip = document.querySelector('.checkout-upsell-strip');
      if (!strip) return null;
      const box = strip.getBoundingClientRect();
      const style = getComputedStyle(strip);
      return {
        left: Math.round(box.left), right: Math.round(box.right), width: Math.round(box.width),
        clientWidth: strip.clientWidth, scrollWidth: strip.scrollWidth,
        display: style.display, overflowX: style.overflowX, maxWidth: style.maxWidth
      };
    })(),
    offenders: [...document.querySelectorAll('body *')]
      .map((element) => {
        const box = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className: String(element.className || '').slice(0, 140),
          left: Math.round(box.left),
          right: Math.round(box.right),
          width: Math.round(box.width)
        };
      })
      .filter((entry) => entry.left < -1 || entry.right > window.innerWidth + 1)
        .slice(0, 12)
    };
  });
}

async function expectNoPageOverflow(page) {
  const result = await pageOverflowMetrics(page);
  expect(result, JSON.stringify(result)).toMatchObject({ bodyWidth: result.viewport, maxScrollX: 0 });
}

async function clearCheckout(page) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.removeItem('maria-clara-cart');
    localStorage.removeItem('maria-clara-cart-session-id');
    sessionStorage.clear();
  });
}

async function reachReview(page) {
  await clearCheckout(page);
  await page.goto(`/product/${PRODUCT_HANDLE}`);
  await page.getByRole('button', { name: /add to cart/i }).click();
  await page.getByRole('dialog', { name: /your cart/i }).getByRole('link', { name: /^checkout$/i }).click();
  await page.getByPlaceholder('First name').fill('Upsell');
  await page.getByPlaceholder('Last name').fill('Customer');
  await page.getByPlaceholder('09XXXXXXXXX').fill('09171234567');
  await page.getByPlaceholder(/House no/).fill('12 Test Street');
  const selects = page.getByRole('combobox');
  await selects.nth(0).selectOption({ label: 'CAVITE' });
  await selects.nth(1).selectOption({ label: 'IMUS' });
  await selects.nth(2).selectOption({ label: 'BUCANDALA IV' });
  await page.getByRole('button', { name: 'Review order', exact: true }).click();
  await expect(page).toHaveURL(/\/checkout\/review$/);
}

test('review upsell adds an in-stock variant and unlocks server-quoted free shipping', async ({ page }, testInfo) => {
  await reachReview(page);

  const upsell = page.locator('section[aria-labelledby="checkout-upsell-heading"]');
  await expect(upsell).toBeVisible();
  await expect(upsell.getByText('Add 1 more item to unlock FREE shipping.', { exact: true })).toBeVisible();
  await expect(upsell.getByText('Test Product', { exact: true })).toHaveCount(0);

  const card = upsell.locator('article:visible').first();
  const variant = card.getByRole('combobox');
  if (await variant.inputValue() === '') await variant.selectOption({ index: 1 });
  await card.getByRole('button', { name: 'Add to Order', exact: true }).click();

  await expect(page.getByText('Item added to your order.', { exact: true })).toBeVisible();
  await expect(page.getByText('FREE shipping unlocked!', { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel('Order summary').getByText('Free', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('maria-clara-cart') || '[]')
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0))).toBe(2);
  await expect(page.getByRole('button', { name: 'Place Order - Cash on Delivery', exact: true })).toBeEnabled();

  await page.screenshot({ path: testInfo.outputPath('checkout-upsell-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  await expectNoPageOverflow(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const visibleMobileCards = await upsell.locator('article:visible').count();
  expect(visibleMobileCards).toBeGreaterThanOrEqual(2);
  expect(visibleMobileCards).toBeLessThanOrEqual(3);
  await expectNoPageOverflow(page);
  await expect(page.getByRole('button', { name: 'Place Order - Cash on Delivery', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('checkout-upsell-mobile.png'), fullPage: true });
});

test('product gallery thumbnails, arrows, keyboard, and mobile swipe share one active image', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/product/abot-kamay-white');

  const first = page.getByRole('button', { name: 'View product image 1', exact: true });
  const second = page.getByRole('button', { name: 'View product image 2', exact: true });
  const third = page.getByRole('button', { name: 'View product image 3', exact: true });
  await expect(first).toHaveAttribute('aria-current', 'true');

  await second.click();
  await expect(second).toHaveAttribute('aria-current', 'true');
  await page.getByRole('button', { name: 'Next product image', exact: true }).click();
  await expect(third).toHaveAttribute('aria-current', 'true');

  await third.press('Home');
  await expect(first).toHaveAttribute('aria-current', 'true');
  await expect(first).toBeFocused();

  const gallery = page.getByRole('region', { name: /ABOT KAMAY WHITE image gallery/i });
  await gallery.dispatchEvent('touchstart', { touches: [{ identifier: 1, clientX: 320, clientY: 250 }] });
  await gallery.dispatchEvent('touchend', { changedTouches: [{ identifier: 1, clientX: 100, clientY: 250 }] });
  await expect(second).toHaveAttribute('aria-current', 'true');

  await expectNoPageOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('product-gallery-mobile.png'), fullPage: true });
});

test('a single-image product hides unnecessary gallery navigation', async ({ page }) => {
  await page.route('**/api/products/single-image-test', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        product: {
          id: 'catalog-single-image-test',
          slug: 'single-image-test',
          publicHandle: 'single-image-test',
          name: 'Single Image Product',
          description: 'Single image gallery test.',
          priceCents: 64900,
          compareAtPriceCents: 0,
          collection: 'New Arrivals',
          collections: ['New Arrivals'],
          merchandisingStatus: 'new',
          images: [{ id: 'one', url: '/brand/logo.png', altText: 'Single Image Product' }],
          variants: [{ id: 'single-small', size: 'S', sku: 'SINGLE-S', stockQuantity: 2, priceCents: 64900 }],
          productPage: { intro: 'Single image gallery test.', sections: [] }
        }
      })
    });
  });

  await page.goto('/product/single-image-test');
  await expect(page.getByRole('heading', { name: 'Single Image Product', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous product image', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Next product image', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Product image thumbnails')).toHaveCount(0);
});
