const test = require('node:test');
const assert = require('node:assert/strict');

const { notificationConfig } = require('../src/config/env');
const { buildDeliveryNotifications, buildOrderConfirmationNotifications, isFirstDeliveredTransition } = require('../src/notifications/orderNotificationService');
const { sendSemaphoreSms } = require('../src/notifications/semaphoreClient');
const { sendResendEmail } = require('../src/notifications/resendClient');
const { createOrderNotificationWorker } = require('../src/notifications/orderNotificationWorker');

const deliveredOrder = {
  orderNumber: 'MC-1001',
  status: 'delivered',
  fulfillmentStatus: 'delivered',
  deliveryStatus: 'delivered',
  totalCents: 129900,
  customer: { fullName: 'Maria Buyer', phone: '09171234567', email: 'buyer@example.com' }
};

test('delivery notification transition is idempotent and builds SMS plus email', () => {
  const previous = { ...deliveredOrder, status: 'shipped', fulfillmentStatus: 'shipped', deliveryStatus: 'out_for_delivery' };
  assert.equal(isFirstDeliveredTransition(previous, deliveredOrder), true);
  assert.equal(isFirstDeliveredTransition(deliveredOrder, deliveredOrder), false);
  const notifications = buildDeliveryNotifications(deliveredOrder, {
    enabled: true,
    sms: { configured: true },
    email: { configured: true, from: 'Maria Clara <orders@example.com>' }
  });
  assert.deepEqual(notifications.map((item) => [item.channel, item.status]), [['sms', 'pending'], ['email', 'pending']]);
  assert.match(notifications[0].payload.message, /MC-1001/);
  assert.match(notifications[1].payload.subject, /MC-1001/);
});

test('COD and paid PayMongo confirmations use the saved total and do not send while payment is pending', () => {
  const config = { sms: { configured: true }, email: { configured: true } };
  const cod = buildOrderConfirmationNotifications({
    ...deliveredOrder, status: 'confirmed', paymentMethod: 'cash_on_delivery', paymentStatus: 'cod_pending'
  }, config);
  assert.deepEqual(cod.map((item) => item.channel), ['sms', 'email']);
  assert.match(cod[0].payload.message, /Cash on Delivery order MC-1001/);
  assert.match(cod[1].payload.text, /₱1,299\.00/);

  const pending = buildOrderConfirmationNotifications({
    ...deliveredOrder, status: 'pending_payment', paymentMethod: 'paymongo', paymentStatus: 'pending_payment'
  }, config);
  assert.deepEqual(pending, []);

  const paid = buildOrderConfirmationNotifications({
    ...deliveredOrder, status: 'confirmed', paymentMethod: 'paymongo', paymentStatus: 'paid'
  }, config);
  assert.match(paid[1].payload.subject, /Payment confirmed/);
});

test('notification config keeps disabled or incomplete providers safe', () => {
  const config = notificationConfig({ ORDER_NOTIFICATIONS_ENABLED: 'true' });
  assert.equal(config.enabled, true);
  assert.equal(config.sms.configured, false);
  assert.equal(config.email.configured, false);
  const rows = buildDeliveryNotifications(deliveredOrder, config);
  assert.deepEqual(rows.map((row) => row.status), ['skipped', 'skipped']);
});

test('Semaphore and Resend clients use provider APIs without exposing credentials', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => url.includes('semaphore') ? [{ message_id: 'sms-1' }] : { id: 'email-1' } };
  };
  const sms = await sendSemaphoreSms({ recipient: '09171234567', payload: { message: 'Delivered' } }, {
    config: { apiKey: 'secret-sms', senderName: 'MARIA' }, fetchImpl
  });
  const email = await sendResendEmail({ recipient: 'buyer@example.com', payload: { subject: 'Delivered', text: 'Done', html: '<p>Done</p>' } }, {
    config: { apiKey: 'secret-email', from: 'orders@example.com' }, fetchImpl
  });
  assert.deepEqual([sms.providerMessageId, email.providerMessageId], ['sms-1', 'email-1']);
  assert.equal(calls[0].url, 'https://api.semaphore.co/api/v4/messages');
  assert.equal(calls[1].url, 'https://api.resend.com/emails');
});

test('worker sends claimed rows and marks retryable failures', async () => {
  const events = [
    { id: '1', channel: 'sms', attemptCount: 1, recipient: '0917', payload: { message: 'ok' } },
    { id: '2', channel: 'email', attemptCount: 1, recipient: 'a@b.com', payload: { subject: 'x' } }
  ];
  const actions = [];
  const repository = {
    recoverStaleClaims: async () => {},
    claimDue: async () => events,
    markSent: async (_client, id) => actions.push(['sent', id]),
    scheduleRetry: async (_client, id) => actions.push(['retry', id]),
    markFailed: async (_client, id) => actions.push(['failed', id])
  };
  const worker = createOrderNotificationWorker({
    repository,
    sendSms: async () => ({ providerMessageId: 'sms' }),
    sendEmail: async () => { const error = new Error('temporary'); error.retryable = true; throw error; },
    config: { sms: {}, email: {} },
    random: () => 0
  });
  const result = await worker.runOnce();
  assert.deepEqual(actions, [['sent', '1'], ['retry', '2']]);
  assert.deepEqual(result, { claimed: 2, sent: 1, retried: 1, failed: 0 });
});
