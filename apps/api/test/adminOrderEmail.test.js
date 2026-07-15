const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { notificationConfig } = require('../src/config/env');
const {
  buildAdminNewOrderEmail,
  sendAdminNewOrderEmail
} = require('../src/notifications/adminOrderEmail');
const {
  ADMIN_NEW_ORDER_EVENT,
  enqueueAdminNewOrderEmail,
  resendAdminNewOrderEmail
} = require('../src/notifications/adminOrderEmailNotificationService');
const { createOrderNotificationWorker } = require('../src/notifications/orderNotificationWorker');

const smtpConfig = {
  configured: true,
  recipient: 'admin@example.com',
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  user: 'smtp-user',
  pass: 'super-secret-password',
  from: 'Maria Clara Clothing <orders@example.com>',
  siteUrl: 'https://mariaclaraclothing.com'
};

function orderFixture(overrides = {}) {
  return {
    orderNumber: 'MCC-20260715-001',
    placedAt: '2026-07-15T04:30:00.000Z',
    customer: {
      firstName: 'Maria', lastName: 'Santos', fullName: 'Maria Santos',
      email: 'maria@example.com', phone: '09171234567'
    },
    address: {
      houseAddress: '12 Sampaguita Street', barangay: 'San Isidro', city: 'Makati',
      province: 'Metro Manila', postalCode: '1200', country: 'Philippines',
      addressLine: '12 Sampaguita Street, San Isidro, Makati, Metro Manila, 1200, Philippines'
    },
    items: [
      {
        productId: 'catalog-internal-product-one', variantId: 'internal-variant-one', slug: 'private-slug-one',
        productName: 'Maria Clara Blouse', size: 'Medium', quantity: 2,
        unitPriceCents: 64900, imageUrl: '/uploads/products/blouse.webp'
      },
      {
        productId: 'catalog-internal-product-two', variantId: 'internal-variant-two', slug: 'private-slug-two',
        productName: 'Filipiniana Skirt', size: 'Large', quantity: 1, unitPriceCents: 50000
      }
    ],
    subtotalCents: 179800,
    discountTotalCents: 10000,
    shippingFeeCents: 8000,
    totalCents: 177800,
    paymentMethod: 'cash_on_delivery',
    paymentStatus: 'cod_pending',
    status: 'confirmed',
    notes: 'Please call before delivery. <script>not allowed</script>',
    ...overrides
  };
}

test('SMTP admin order configuration is server-side, validated, and starts the outbox worker', () => {
  const config = notificationConfig({
    FRONTEND_URL: 'https://mariaclaraclothing.com/',
    ORDER_NOTIFICATION_EMAIL: 'admin@example.com',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '465',
    SMTP_SECURE: 'true',
    SMTP_USER: 'smtp-user',
    SMTP_PASS: 'smtp-pass',
    SMTP_FROM: 'Maria Clara Clothing <orders@example.com>'
  });
  assert.equal(config.adminOrderEmail.configured, true);
  assert.equal(config.adminOrderEmail.port, 465);
  assert.equal(config.adminOrderEmail.secure, true);
  assert.equal(config.adminOrderEmail.siteUrl, 'https://mariaclaraclothing.com');
  assert.equal(config.workerEnabled, true);
  assert.throws(() => notificationConfig({ SMTP_PORT: 'invalid' }), /SMTP_PORT/);
  assert.throws(() => notificationConfig({ SMTP_SECURE: 'yes' }), /SMTP_SECURE/);
});

test('new-order email contains authoritative quantities and totals without internal product identifiers', () => {
  const message = buildAdminNewOrderEmail(orderFixture(), smtpConfig);
  assert.equal(message.subject, 'New Maria Clara Order — MCC-20260715-001 — ₱1,778.00');
  assert.match(message.html, /Maria Clara Blouse/);
  assert.match(message.html, /Size \/ variant: Medium/);
  assert.match(message.html, /Quantity: 2/);
  assert.match(message.html, /₱649\.00/);
  assert.match(message.html, /Subtotal[\s\S]*₱1,798\.00/);
  assert.match(message.html, /Discount[\s\S]*−₱100\.00/);
  assert.match(message.html, /Shipping fee[\s\S]*₱80\.00/);
  assert.match(message.html, /Total[\s\S]*₱1,778\.00/);
  assert.match(message.html, /12 Sampaguita Street/);
  assert.match(message.html, /https:\/\/mariaclaraclothing\.com\/uploads\/products\/blouse\.webp/);
  assert.match(message.html, /https:\/\/mariaclaraclothing\.com\/admin\/orders\/MCC-20260715-001/);
  assert.doesNotMatch(message.html, /<script>/);
  assert.doesNotMatch(message.html, /catalog-internal-product/);
  assert.doesNotMatch(message.html, /internal-variant/);
  assert.doesNotMatch(message.html, /private-slug/);
});

test('Nodemailer receives the complete message but no SMTP credential is placed in email content', async () => {
  let sentMail;
  const result = await sendAdminNewOrderEmail(orderFixture(), {
    config: smtpConfig,
    transport: { sendMail: async (mail) => { sentMail = mail; return { messageId: 'smtp-message-1' }; } }
  });
  assert.equal(result.providerMessageId, 'smtp-message-1');
  assert.equal(sentMail.to, 'admin@example.com');
  assert.match(sentMail.subject, /MCC-20260715-001/);
  assert.doesNotMatch(JSON.stringify(sentMail), /super-secret-password|smtp-user/);
  assert.match(sentMail.messageId, /^<admin-order-[a-f0-9]{32}@mariaclaraclothing\.com>$/);
});

test('COD queues one durable email only after checkout writes, while PayMongo waits for paid status', async () => {
  const inserted = new Set();
  const states = [];
  const repository = {
    enqueueMany: async (orderNumber, eventName, rows, options) => {
      const key = `${orderNumber}:${eventName}:${rows[0].channel}`;
      if (inserted.has(key)) return [];
      inserted.add(key);
      assert.equal(options.client.id, 'transaction-client');
      return [{ id: 'notification-1', orderNumber, eventName, ...rows[0] }];
    }
  };
  const options = {
    client: { id: 'transaction-client' }, config: smtpConfig, repository,
    updateOrderState: async (_orderNumber, state) => states.push(state)
  };
  const order = orderFixture();
  assert.equal((await enqueueAdminNewOrderEmail(order, options)).length, 1);
  assert.equal((await enqueueAdminNewOrderEmail(orderFixture(), options)).length, 0);
  assert.deepEqual(states, [{ status: 'pending', error: '' }]);

  const pendingPayMongo = orderFixture({
    orderNumber: 'MCC-PENDING', paymentMethod: 'paymongo', paymentProvider: 'paymongo',
    paymentStatus: 'pending_payment', status: 'pending_payment'
  });
  assert.equal((await enqueueAdminNewOrderEmail(pendingPayMongo, options)).length, 0);
  pendingPayMongo.paymentStatus = 'paid';
  pendingPayMongo.status = 'confirmed';
  assert.equal((await enqueueAdminNewOrderEmail(pendingPayMongo, options)).length, 1);
});

test('automatic worker sends one admin email, stores sent state, and skips a previously sent order', async () => {
  const order = orderFixture();
  const events = [{
    id: 'notification-1', orderNumber: order.orderNumber, eventName: ADMIN_NEW_ORDER_EVENT,
    channel: 'email', attemptCount: 1
  }];
  const actions = [];
  const states = [];
  let sendCount = 0;
  const repository = {
    recoverStaleClaims: async () => {},
    claimDue: async () => events.splice(0),
    markSent: async (_client, id) => actions.push(['sent', id]),
    scheduleRetry: async () => actions.push(['retry']),
    markFailed: async () => actions.push(['failed'])
  };
  const worker = createOrderNotificationWorker({
    repository,
    config: { adminOrderEmail: smtpConfig, sms: {}, email: {} },
    findOrder: async () => order,
    updateOrderState: async (_orderNumber, state) => {
      states.push(state);
      if (state.sentAt) order.adminEmailSentAt = state.sentAt;
    },
    sendAdminEmail: async () => { sendCount += 1; return { providerMessageId: 'message-1' }; },
    logger: { info() {}, warn() {}, error() {} },
    now: () => new Date('2026-07-15T05:00:00.000Z')
  });
  assert.deepEqual(await worker.runOnce(), { claimed: 1, sent: 1, retried: 0, failed: 0 });
  assert.equal(sendCount, 1);
  assert.deepEqual(actions, [['sent', 'notification-1']]);
  assert.equal(states.at(-1).status, 'sent');
  assert.equal(order.adminEmailSentAt, '2026-07-15T05:00:00.000Z');

  events.push({ id: 'notification-2', orderNumber: order.orderNumber, eventName: ADMIN_NEW_ORDER_EVENT, channel: 'email', attemptCount: 1 });
  await worker.runOnce();
  assert.equal(sendCount, 1);
  assert.deepEqual(actions.at(-1), ['sent', 'notification-2']);
});

test('SMTP failure marks only the notification failed and leaves the completed order intact', async () => {
  const order = orderFixture();
  const event = { id: 'notification-failed', orderNumber: order.orderNumber, eventName: ADMIN_NEW_ORDER_EVENT, channel: 'email', attemptCount: 8 };
  const actions = [];
  const states = [];
  const worker = createOrderNotificationWorker({
    repository: {
      recoverStaleClaims: async () => {}, claimDue: async () => [event], markSent: async () => {},
      scheduleRetry: async () => actions.push('retry'),
      markFailed: async (_client, _id, error) => actions.push(error)
    },
    config: { adminOrderEmail: smtpConfig, sms: {}, email: {} },
    findOrder: async () => order,
    updateOrderState: async (_orderNumber, state) => states.push(state),
    sendAdminEmail: async () => { const error = new Error('535 password secret leaked'); error.code = 'EAUTH'; throw error; },
    logger: { info() {}, warn() {}, error() {} }
  });
  assert.deepEqual(await worker.runOnce(), { claimed: 1, sent: 0, retried: 0, failed: 1 });
  assert.equal(order.status, 'confirmed');
  assert.equal(order.totalCents, 177800);
  assert.deepEqual(actions, ['SMTP authentication failed.']);
  assert.equal(states.at(-1).error, 'SMTP authentication failed.');
  assert.doesNotMatch(JSON.stringify(actions), /password secret leaked/);
});

test('manual resend atomically claims a failed job, exposes progress, and cannot send twice', async () => {
  const order = orderFixture({ adminEmailStatus: 'failed', adminEmailError: 'SMTP connection failed.' });
  const event = {
    id: 'notification-manual', orderNumber: order.orderNumber, eventName: ADMIN_NEW_ORDER_EVENT,
    channel: 'email', status: 'failed', attemptCount: 1
  };
  let sendCount = 0;
  const repository = {
    claimFailedForManualResend: async () => {
      if (event.status !== 'failed') return null;
      event.status = 'sending';
      return { ...event };
    },
    listForOrder: async () => [{ ...event }],
    markSent: async () => { event.status = 'sent'; },
    markFailed: async () => { event.status = 'failed'; }
  };
  const updateOrderState = async (_orderNumber, state) => {
    order.adminEmailStatus = state.status;
    order.adminEmailError = state.error;
    if (state.sentAt) order.adminEmailSentAt = state.sentAt;
  };
  const options = {
    config: smtpConfig, repository, updateOrderState,
    findOrder: async () => order,
    transactionFn: async (callback) => callback({ id: 'client' }),
    sendEmail: async () => { sendCount += 1; return { providerMessageId: 'manual-message' }; },
    logger: { info() {}, warn() {}, error() {} },
    now: () => new Date('2026-07-15T06:00:00.000Z')
  };
  const result = await resendAdminNewOrderEmail(order.orderNumber, options);
  assert.equal(result.order.adminEmailStatus, 'sent');
  assert.equal(result.order.adminEmailSentAt, '2026-07-15T06:00:00.000Z');
  assert.equal(sendCount, 1);
  await assert.rejects(
    resendAdminNewOrderEmail(order.orderNumber, options),
    (error) => error.status === 409 && error.code === 'admin_email_already_sent'
  );
  assert.equal(sendCount, 1);
});

test('manual resend failure returns only a sanitized status and keeps the order complete', async () => {
  const order = orderFixture({ adminEmailStatus: 'failed' });
  const event = { id: 'manual-failure', orderNumber: order.orderNumber, eventName: ADMIN_NEW_ORDER_EVENT, channel: 'email', status: 'failed' };
  let storedError = '';
  const repository = {
    claimFailedForManualResend: async () => ({ ...event, status: 'sending' }),
    listForOrder: async () => [event],
    markSent: async () => {},
    markFailed: async (_client, _id, error) => { storedError = error; }
  };
  await assert.rejects(resendAdminNewOrderEmail(order.orderNumber, {
    config: smtpConfig,
    repository,
    findOrder: async () => order,
    updateOrderState: async (_orderNumber, state) => {
      order.adminEmailStatus = state.status;
      order.adminEmailError = state.error;
    },
    transactionFn: async (callback) => callback({ id: 'client' }),
    sendEmail: async () => { const error = new Error('private smtp response and password'); error.code = 'ECONNECTION'; throw error; },
    logger: { info() {}, warn() {}, error() {} }
  }), (error) => {
    assert.equal(error.status, 502);
    assert.equal(error.code, 'admin_email_send_failed');
    assert.deepEqual(error.details, { adminEmailStatus: 'failed', adminEmailError: 'SMTP connection failed.' });
    assert.doesNotMatch(error.message, /private smtp|password/);
    return true;
  });
  assert.equal(storedError, 'SMTP connection failed.');
  assert.equal(order.status, 'confirmed');
});

test('unauthenticated customers cannot access the manual resend endpoint', async () => {
  const { createApp } = require('../src/app');
  const server = await new Promise((resolve, reject) => {
    const listener = createApp().listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/orders/MCC-1/admin-email/resend`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
    });
    assert.equal(response.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('migration, env examples, and frontend keep SMTP secrets server-side', () => {
  const root = path.join(__dirname, '..', '..', '..');
  const migration = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '20260715_admin_order_email.sql'), 'utf8');
  assert.match(migration, /admin_email_sent_at/);
  assert.match(migration, /admin_email_status/);
  assert.match(migration, /admin_email_error/);
  const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  for (const name of ['ORDER_NOTIFICATION_EMAIL', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']) {
    assert.match(envExample, new RegExp(`^${name}=`, 'm'));
  }
  const webSource = fs.readdirSync(path.join(root, 'apps', 'web', 'src'), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(jsx?|css)$/.test(entry.name))
    .map((entry) => fs.readFileSync(path.join(entry.parentPath, entry.name), 'utf8')).join('\n');
  assert.doesNotMatch(webSource, /SMTP_PASS|SMTP_USER|ORDER_NOTIFICATION_EMAIL/);
});
