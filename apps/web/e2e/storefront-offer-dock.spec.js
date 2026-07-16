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

test('phone keeps promotions out of the content viewport and uses compact Messenger support', async ({ page }) => {
  await configureMessenger(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');

  const toggle = page.getByRole('button', { name: /Offers · \d+/ });
  const recommendation = page.getByRole('complementary', { name: 'You may also like' });
  const shipping = page.getByRole('complementary', { name: 'Free shipping offer' });
  const messenger = page.getByRole('link', { name: 'Chat Support — open Messenger' });
  await expect(toggle).toBeHidden();
  await expect(shipping).toHaveCount(0);
  await expect(recommendation).toHaveCount(0);
  await expect(messenger).toBeVisible();

  const messengerBox = await messenger.boundingBox();
  expect(messengerBox.width).toBeLessThanOrEqual(48);
  expect(messengerBox.height).toBeLessThanOrEqual(48);
  expect(messengerBox.x + messengerBox.width).toBeLessThanOrEqual(320);
});
