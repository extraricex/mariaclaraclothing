import { test, expect } from '@playwright/test';

const ROUTES = [
  '/',
  '/shop',
  '/collections/freedom-of-mind',
  '/product/curiosity-black',
  '/faq',
  '/shipping-returns',
  '/terms',
  '/contact',
  '/size-chart',
  '/login'
];

const VIEWPORTS = [
  { name: 'phone-320', width: 320, height: 568 },
  { name: 'phone-360', width: 360, height: 740 },
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'phone-430', width: 430, height: 932 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 }
];

for (const viewport of VIEWPORTS) {
  test(`customer journey routes stay usable on ${viewport.name}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    for (const route of ROUTES) {
      const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect(response?.status(), `${route} should return a customer page`).toBeLessThan(400);
      await expect(page.locator('body')).toBeVisible();
      await page.waitForTimeout(150);

      const audit = await page.evaluate(() => ({
        viewport: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        brokenVisibleImages: [...document.images]
          .filter((image) => image.getBoundingClientRect().width > 0)
          .filter((image) => image.complete && image.naturalWidth === 0)
          .map((image) => image.currentSrc || image.src),
        text: document.body.innerText
      }));

      expect(audit.documentWidth, `${route} document overflow`).toBeLessThanOrEqual(audit.viewport + 1);
      expect(audit.bodyWidth, `${route} body overflow`).toBeLessThanOrEqual(audit.viewport + 1);
      expect(audit.brokenVisibleImages, `${route} broken visible images`).toEqual([]);
      expect(audit.text).not.toMatch(/Pancake POS|stack trace|PAYMONGO_SECRET_KEY|META_CONVERSIONS_API_ACCESS_TOKEN/i);
    }

    expect(pageErrors).toEqual([]);
  });
}
