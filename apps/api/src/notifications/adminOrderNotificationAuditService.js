const crypto = require('node:crypto');
const { listOrders, updateOrderAdminEmailState } = require('../orders/orderRepository');
const defaultRepository = require('./orderNotificationOutboxRepository');
const {
  ADMIN_NEW_ORDER_EVENT,
  enqueueAdminNewOrderEmail,
  resolveAdminOrderNotificationConfig
} = require('./adminOrderEmailNotificationService');
const { sendTransactionalSmtpEmail } = require('./adminOrderEmail');

const MAX_RANGE_DAYS = 366;

function auditRange(input = {}, now = new Date()) {
  const endText = String(input.to || input.end || now.toISOString().slice(0, 10)).trim();
  const fallbackFrom = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const startText = String(input.from || input.start || fallbackFrom).trim();
  for (const [label, value] of [['from', startText], ['to', endText]]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())) {
      const error = new Error(`${label} must be a valid YYYY-MM-DD date.`);
      error.status = 400;
      throw error;
    }
  }
  if (startText > endText) {
    const error = new Error('from must not be after to.');
    error.status = 400;
    throw error;
  }
  const start = new Date(`${startText}T00:00:00+08:00`);
  const end = new Date(`${endText}T00:00:00+08:00`);
  end.setDate(end.getDate() + 1);
  if ((end.getTime() - start.getTime()) / 86_400_000 > MAX_RANGE_DAYS) {
    const error = new Error(`Date range cannot exceed ${MAX_RANGE_DAYS} days.`);
    error.status = 400;
    throw error;
  }
  return { from: startText, to: endText, start, endExclusive: end };
}

function successfullyCreatedOrder(order) {
  return Boolean(order?.orderNumber)
    && !order.isTestOrder
    && Number.isInteger(Number(order.totalCents))
    && Number(order.totalCents) > 0;
}

async function previewMissedAdminOrderEmails(input = {}, {
  listOrderRecords = listOrders,
  repository = defaultRepository,
  now = new Date()
} = {}) {
  const range = auditRange(input, now);
  const orders = (await listOrderRecords()).filter((order) => {
    const placedAt = new Date(order.placedAt || 0);
    return successfullyCreatedOrder(order)
      && Number.isFinite(placedAt.getTime())
      && placedAt >= range.start
      && placedAt < range.endExclusive;
  });
  const records = [];
  for (const order of orders) {
    const notifications = (await repository.listForOrder(order.orderNumber))
      .filter((row) => row.eventName === ADMIN_NEW_ORDER_EVENT && row.channel === 'email');
    const sent = notifications.filter((row) => row.status === 'sent');
    const failed = notifications.filter((row) => row.status === 'failed');
    const active = notifications.filter((row) => ['pending', 'retrying', 'sending'].includes(row.status));
    const reason = !notifications.length ? 'missing_notification_record'
      : failed.length && !sent.length && !active.length ? 'failed_notification'
        : '';
    if (!reason) continue;
    records.push({
      orderNumber: order.orderNumber,
      placedAt: order.placedAt,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      orderStatus: order.status,
      totalCents: order.totalCents,
      reason,
      notificationCount: notifications.length,
      failedCount: failed.length,
      lastError: failed[0]?.lastError || ''
    });
  }
  return {
    range: { from: range.from, to: range.to, timezone: 'Asia/Manila' },
    ordersChecked: orders.length,
    missingNotifications: records.filter((row) => row.reason === 'missing_notification_record').length,
    failedNotifications: records.filter((row) => row.reason === 'failed_notification').length,
    records
  };
}

async function queueMissedAdminOrderEmails(input = {}, dependencies = {}) {
  if (input.confirm !== true) {
    const error = new Error('Explicit confirmation is required before delayed notifications are queued.');
    error.status = 400;
    error.code = 'BACKFILL_CONFIRMATION_REQUIRED';
    throw error;
  }
  const selected = [...new Set((Array.isArray(input.orderNumbers) ? input.orderNumbers : [])
    .map((value) => String(value || '').trim()).filter(Boolean))];
  if (!selected.length || selected.length > 200) {
    const error = new Error('Select between 1 and 200 previewed orders.');
    error.status = 400;
    throw error;
  }
  const repository = dependencies.repository || defaultRepository;
  const preview = await previewMissedAdminOrderEmails(input, { ...dependencies, repository });
  const previewed = new Map(preview.records.map((record) => [record.orderNumber, record]));
  const orders = new Map((await (dependencies.listOrderRecords || listOrders)())
    .map((order) => [order.orderNumber, order]));
  const results = [];
  for (const orderNumber of selected) {
    const record = previewed.get(orderNumber);
    const order = orders.get(orderNumber);
    if (!record || !order) {
      results.push({ orderNumber, status: 'skipped', reason: 'not_in_current_preview' });
      continue;
    }
    if (record.reason === 'missing_notification_record') {
      const rows = await enqueueAdminNewOrderEmail(order, {
        repository,
        delayed: true,
        config: dependencies.config,
        settings: dependencies.settings,
        getSettings: dependencies.getSettings
      });
      results.push({ orderNumber, status: rows.length ? 'queued' : 'skipped', queuedCount: rows.length });
    } else {
      const rows = await repository.requeueFailedForOrder(orderNumber, ADMIN_NEW_ORDER_EVENT, { delayed: true });
      if (rows.length) await (dependencies.updateOrderState || updateOrderAdminEmailState)(orderNumber, {
        status: 'pending',
        error: 'Delayed notification queued for retry.'
      });
      results.push({ orderNumber, status: rows.length ? 'queued' : 'skipped', queuedCount: rows.length });
    }
  }
  return {
    queued: results.filter((row) => row.status === 'queued').length,
    skipped: results.filter((row) => row.status === 'skipped').length,
    results
  };
}

async function sendAdminOrderNotificationTest({ config, settings, getSettings, sendEmail = sendTransactionalSmtpEmail } = {}) {
  const resolved = await resolveAdminOrderNotificationConfig({ config, settings, getSettings });
  if (!resolved.transportConfigured || !resolved.recipient) {
    const error = new Error('Configure SMTP and a valid primary recipient before sending a test email.');
    error.status = 503;
    error.code = 'SMTP_NOT_CONFIGURED';
    throw error;
  }
  const now = new Date();
  const event = {
    id: `admin-email-test-${crypto.randomUUID()}`,
    recipient: resolved.recipient,
    payload: {
      subject: 'Maria Clara Clothing Order Notifications — Test Email',
      text: `Order-notification email is configured. Test sent ${now.toISOString()}.`,
      html: `<p><strong>Maria Clara Clothing order notifications are configured.</strong></p><p>Test sent ${now.toISOString()}.</p>`
    }
  };
  const response = await sendEmail(event, { config: resolved });
  return { sent: true, recipient: resolved.recipient, providerMessageId: response.providerMessageId || '' };
}

module.exports = {
  auditRange,
  previewMissedAdminOrderEmails,
  queueMissedAdminOrderEmails,
  sendAdminOrderNotificationTest,
  successfullyCreatedOrder
};
