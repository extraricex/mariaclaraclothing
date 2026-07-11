import { test, expect } from '@playwright/test';

async function configureMessenger(page) {
  await page.route('**/api/storefront-settings', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.settings.messengerUrl = 'https://m.me/maria-clara-test';
    await route.fulfill({ response, json: body });
  });
  await page.addInitScript(() => window.sessionStorage.clear());
}

test('desktop stacks the recommendation over free shipping and labels Messenger', async ({ page }) => {
  await configureMessenger(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  const recommendation = page.getByRole('complementary', { name: 'You may also like' });
  const shipping = page.getByRole('complementary', { name: 'Free shipping offer' });
  const messenger = page.getByRole('link', { name: 'Chat Support — open Messenger' });
  await expect(recommendation).toBeVisible();
  await expect(shipping).toBeVisible();
  await expect(messenger).toBeVisible();
  await expect(messenger.getByText('Chat Support', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Offers ·/ })).toBeHidden();

  const recommendationBox = await recommendation.boundingBox();
  const shippingBox = await shipping.boundingBox();
  const messengerBox = await messenger.boundingBox();
  expect(recommendationBox.y + recommendationBox.height).toBeLessThanOrEqual(shippingBox.y);
  expect(shippingBox.x + shippingBox.width).toBeLessThan(messengerBox.x);
  await expect(recommendation.getByRole('link')).toHaveAttribute('href', /^\/product\//);
});

test('phone shows the offer immediately within the viewport', async ({ page }) => {
  await configureMessenger(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');

  const toggle = page.getByRole('button', { name: /Offers · \d+/ });
  const recommendation = page.getByRole('complementary', { name: 'You may also like' });
  const shipping = page.getByRole('complementary', { name: 'Free shipping offer' });
  const messenger = page.getByRole('link', { name: 'Chat Support — open Messenger' });
  await expect(toggle).toBeHidden();
  await expect(shipping).toBeVisible();
  await expect(messenger).toContainText('Chat');

  const messengerBox = await messenger.boundingBox();
  expect(messengerBox.x + messengerBox.width).toBeLessThanOrEqual(320);

  const visibleOfferBoxes = [await shipping.boundingBox()];
  if (await recommendation.count()) {
    await expect(recommendation).toBeVisible();
    visibleOfferBoxes.push(await recommendation.boundingBox());
  }
  for (const box of visibleOfferBoxes) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  }

  await expect(shipping.getByRole('link', { name: 'Shop now' })).toBeVisible();
});
