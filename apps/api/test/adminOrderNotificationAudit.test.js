const test = require('node:test');
const assert = require('node:assert/strict');

const {
  auditRange,
  previewMissedAdminOrderEmails,
  queueMissedAdminOrderEmails,
  sendAdminOrderNotificationTest
} = require('../src/notifications/adminOrderNotificationAuditService');

const orders = [
  {
    orderNumber: 'MCC-MISSING', placedAt: '2026-07-10T04:00:00.000Z', totalCents: 64900,
    paymentMethod: 'cash_on_delivery', paymentStatus: 'cod_pending', status: 'confirmed', isTestOrder: false
  },
  {
    orderNumber: 'MCC-FAILED', placedAt: '2026-07-11T04:00:00.000Z', totalCents: 79900,
    paymentMethod: 'paymongo', paymentStatus: 'pending_payment', status: 'pending_payment', isTestOrder: false
  },
  {
    orderNumber: 'MCC-SENT', placedAt: '2026-07-12T04:00:00.000Z', totalCents: 89900,
    paymentMethod: 'cash_on_delivery', paymentStatus: 'cod_pending', status: 'confirmed', isTestOrder: false
  },
  {
    orderNumber: 'MCC-TEST', placedAt: '2026-07-12T04:00:00.000Z', totalCents: 89900,
    paymentMethod: 'cash_on_delivery', paymentStatus: 'cod_pending', status: 'confirmed', isTestOrder: true
  }
];

function repositoryFixture() {
  const rows = new Map([
    ['MCC-FAILED', [{ id: 'failed', orderNumber: 'MCC-FAILED', eventName: 'admin_new_order', channel: 'email', status: 'failed', lastError: 'SMTP connection failed.' }]],
    ['MCC-SENT', [{ id: 'sent', orderNumber: 'MCC-SENT', eventName: 'admin_new_order', channel: 'email', status: 'sent' }]]
  ]);
  return {
    rows,
    listForOrder: async (orderNumber) => rows.get(orderNumber) || [],
    enqueueMany: async (orderNumber, eventName, notifications) => {
      const created = notifications.map((notification, index) => ({
        id: `${orderNumber}-${index}`, orderNumber, eventName, ...notification
      }));
      rows.set(orderNumber, created);
      return created;
    },
    requeueFailedForOrder: async (orderNumber) => {
      const changed = (rows.get(orderNumber) || []).filter((row) => row.status === 'failed');
      changed.forEach((row) => { row.status = 'retrying'; row.payload = { delayed: true }; });
      return changed;
    }
  };
}

const range = { from: '2026-07-01', to: '2026-07-31' };

test('missed-email preview is read-only and excludes sent and test orders', async () => {
  const repository = repositoryFixture();
  const preview = await previewMissedAdminOrderEmails(range, {
    listOrderRecords: async () => orders,
    repository,
    now: new Date('2026-07-17T00:00:00Z')
  });
  assert.equal(preview.ordersChecked, 3);
  assert.equal(preview.missingNotifications, 1);
  assert.equal(preview.failedNotifications, 1);
  assert.deepEqual(preview.records.map((row) => row.orderNumber), ['MCC-MISSING', 'MCC-FAILED']);
  assert.equal(repository.rows.has('MCC-MISSING'), false);
});

test('backfill requires explicit confirmation and queues only selected previewed orders', async () => {
  const repository = repositoryFixture();
  const dependencies = {
    listOrderRecords: async () => orders,
    repository,
    now: new Date('2026-07-17T00:00:00Z'),
    config: {
      configured: true, transportConfigured: true, recipient: 'admin@example.com',
      host: 'smtp.example.com', user: 'user', pass: 'secret', from: 'orders@example.com'
    },
    settings: {
      orderNotifications: {
        enabled: true, primaryRecipientEmail: 'admin@example.com', additionalRecipientEmails: [],
        maximumRetryAttempts: 8
      }
    },
    updateOrderState: async () => {}
  };
  await assert.rejects(
    queueMissedAdminOrderEmails({ ...range, orderNumbers: ['MCC-MISSING'] }, dependencies),
    (error) => error.code === 'BACKFILL_CONFIRMATION_REQUIRED'
  );
  const result = await queueMissedAdminOrderEmails({
    ...range, confirm: true, orderNumbers: ['MCC-MISSING', 'MCC-SENT']
  }, dependencies);
  assert.equal(result.queued, 1);
  assert.equal(result.skipped, 1);
  assert.equal(repository.rows.get('MCC-MISSING')[0].payload.delayed, true);
});

test('notification test email uses the configured recipient without exposing SMTP credentials', async () => {
  let event;
  let receivedConfig;
  const result = await sendAdminOrderNotificationTest({
    config: {
      configured: true, transportConfigured: true, recipient: '', host: 'smtp.example.com',
      user: 'smtp-user', pass: 'top-secret', from: 'orders@example.com'
    },
    settings: {
      orderNotifications: {
        enabled: true, primaryRecipientEmail: 'owner@example.com', additionalRecipientEmails: []
      }
    },
    sendEmail: async (input, options) => {
      event = input;
      receivedConfig = options.config;
      return { providerMessageId: 'smtp-test-1' };
    }
  });
  assert.equal(result.recipient, 'owner@example.com');
  assert.equal(event.recipient, 'owner@example.com');
  assert.equal(receivedConfig.pass, 'top-secret');
  assert.doesNotMatch(JSON.stringify(event), /top-secret|smtp-user/);
});

test('missed-email date range validates Manila dates and caps historical scans', () => {
  assert.equal(auditRange(range).from, '2026-07-01');
  assert.throws(() => auditRange({ from: '2026-08-01', to: '2026-07-01' }), /must not be after/);
  assert.throws(() => auditRange({ from: '2024-01-01', to: '2026-07-01' }), /cannot exceed/);
});
