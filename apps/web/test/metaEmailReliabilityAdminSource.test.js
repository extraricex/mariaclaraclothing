import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const settings = readFileSync(new URL('../src/admin/Settings.jsx', import.meta.url), 'utf8');
const orders = readFileSync(new URL('../src/admin/Orders.jsx', import.meta.url), 'utf8');
const orderDetail = readFileSync(new URL('../src/admin/OrderDetail.jsx', import.meta.url), 'utf8');
const thankYou = readFileSync(new URL('../src/pages/ThankYou.jsx', import.meta.url), 'utf8');
const checkout = readFileSync(new URL('../src/pages/CheckoutReview.jsx', import.meta.url), 'utf8');

test('Admin exposes safe order-notification settings, provider test, and confirmed backfill preview', () => {
  assert.match(settings, /Order notifications/);
  assert.match(settings, /settings\/orderNotifications/);
  assert.match(settings, /order-notifications\/test/);
  assert.match(settings, /order-notifications\/backfill\/preview/);
  assert.match(settings, /confirm: true/);
  assert.match(settings, /Delayed New Order emails should be queued/i);
  assert.doesNotMatch(settings, /SMTP_PASS|SMTP_USER|META_ACCESS_TOKEN/);
});

test('Admin order operations expose notification filters and per-recipient delivery status', () => {
  assert.match(orders, /notificationStatus/);
  assert.match(orders, /Notification Failed/);
  assert.match(orders, /Notification Pending/);
  assert.match(orderDetail, /notification\.recipient/);
  assert.match(orderDetail, /notification\.attemptCount/);
  assert.match(orderDetail, /admin_payment_confirmed/);
  assert.match(orderDetail, /admin-email\/resend/);
});

test('Thank You Purchase is backend-claimed while checkout sends default AddPaymentInfo', () => {
  assert.match(thankYou, /isFacebookBrowserPurchaseReady/);
  assert.match(thankYou, /claimMetaPurchase/);
  assert.match(thankYou, /completeMetaPurchase/);
  assert.match(checkout, /trackFacebookAddPaymentInfo/);
});
