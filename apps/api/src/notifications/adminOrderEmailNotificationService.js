const { env } = require('../config/env');
const { hasDatabaseUrl, transaction } = require('../db/postgres');
const { getStoreSettings } = require('../settings/storeSettingsRepository');
const {
  findOrderByNumber,
  updateOrderAdminEmailState
} = require('../orders/orderRepository');
const defaultRepository = require('./orderNotificationOutboxRepository');
const { sendAdminNewOrderEmail } = require('./adminOrderEmail');

const ADMIN_NEW_ORDER_EVENT = 'admin_new_order';
const ADMIN_PAYMENT_CONFIRMED_EVENT = 'admin_payment_confirmed';

function validEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : '';
}

function safeAdminOrderEmailError(error) {
  const code = String(error?.code || '').toUpperCase();
  const responseCode = Number(error?.responseCode || 0);
  if (code === 'SMTP_NOT_CONFIGURED') return 'Admin order email is not configured.';
  if (code === 'EAUTH' || responseCode === 535) return 'SMTP authentication failed.';
  if (['ECONNECTION', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ESOCKET', 'EDNS'].includes(code)) {
    return 'SMTP connection failed.';
  }
  if (code === 'EENVELOPE' || responseCode >= 500) return 'SMTP delivery was rejected.';
  if (/order total is invalid/i.test(String(error?.message || ''))) return 'Order total is invalid for notification.';
  if (/order number is required/i.test(String(error?.message || ''))) return 'Order number is invalid for notification.';
  return 'Order email delivery failed.';
}

function isEligibleForAdminOrderEmail(order) {
  if (!order?.orderNumber) return false;
  const status = String(order.status || '').toLowerCase();
  const paymentStatus = String(order.paymentStatus || '').toLowerCase();
  return !['cancelled', 'canceled', 'failed', 'expired'].includes(status)
    && !['cancelled', 'canceled', 'failed', 'expired'].includes(paymentStatus);
}

async function resolveAdminOrderNotificationConfig({
  config = env.notifications.adminOrderEmail,
  settings,
  getSettings = getStoreSettings
} = {}) {
  const stored = settings || await getSettings();
  const preferences = stored?.orderNotifications || {};
  const primary = validEmail(preferences.primaryRecipientEmail) || validEmail(config?.recipient);
  const additional = Array.isArray(preferences.additionalRecipientEmails)
    ? preferences.additionalRecipientEmails.map(validEmail).filter(Boolean)
    : [];
  const recipients = [...new Set([primary, ...additional].filter(Boolean))];
  const maximumRetryAttempts = Number(preferences.maximumRetryAttempts || 8);
  const transportConfigured = Boolean(config?.transportConfigured ?? config?.configured);
  return {
    ...(config || {}),
    enabled: preferences.enabled !== false,
    recipient: primary,
    recipients,
    sendPaymongoPaymentConfirmation: Boolean(preferences.sendPaymongoPaymentConfirmation),
    maximumRetryAttempts: Number.isInteger(maximumRetryAttempts)
      ? Math.max(1, Math.min(20, maximumRetryAttempts))
      : 8,
    transportConfigured,
    configured: transportConfigured && recipients.length > 0
  };
}

function initialNotificationState(order, config) {
  const totalCents = Number(order?.totalCents);
  if (!config?.enabled) {
    return { status: 'skipped', error: 'New Order emails are disabled in Admin settings.' };
  }
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    return { status: 'failed', error: 'Order total is invalid for notification.' };
  }
  if (!config?.recipients?.length && !validEmail(config?.recipient)) {
    return { status: 'failed', error: 'No valid admin order-notification recipient is configured.' };
  }
  if (!config?.transportConfigured && !config?.configured) {
    return { status: 'failed', error: 'Admin order email is not configured.' };
  }
  return { status: 'pending', error: '' };
}

async function enqueueAdminNotification(order, eventName, {
  client,
  config = env.notifications.adminOrderEmail,
  repository = defaultRepository,
  updateOrderState = updateOrderAdminEmailState,
  settings,
  getSettings,
  delayed = false
} = {}) {
  if (!isEligibleForAdminOrderEmail(order)) return [];
  const resolved = await resolveAdminOrderNotificationConfig({ config, settings, getSettings });
  if (eventName === ADMIN_PAYMENT_CONFIRMED_EVENT) {
    const paymongo = order.paymentMethod === 'paymongo' || order.paymentProvider === 'paymongo';
    if (!resolved.sendPaymongoPaymentConfirmation || !paymongo || order.paymentStatus !== 'paid') return [];
  }
  const state = initialNotificationState(order, resolved);
  const recipients = resolved.recipients.length ? resolved.recipients : [''];
  const rows = await repository.enqueueMany(order.orderNumber, eventName, recipients.map((recipient) => ({
    channel: 'email',
    recipient,
    payload: {
      template: eventName,
      delayed: Boolean(delayed),
      maximumRetryAttempts: resolved.maximumRetryAttempts
    },
    status: state.status,
    lastError: state.error
  })), { client });
  if (eventName === ADMIN_NEW_ORDER_EVENT && rows.length) {
    await updateOrderState(order.orderNumber, {
      status: state.status === 'retrying' ? 'pending' : state.status,
      error: state.error
    }, { client });
    order.adminEmailStatus = state.status;
    order.adminEmailError = state.error;
  }
  return rows;
}

function enqueueAdminNewOrderEmail(order, options = {}) {
  return enqueueAdminNotification(order, ADMIN_NEW_ORDER_EVENT, options);
}

function enqueueAdminPaymentConfirmationEmail(order, options = {}) {
  return enqueueAdminNotification(order, ADMIN_PAYMENT_CONFIRMED_EVENT, options);
}

async function aggregateNewOrderState(orderNumber, {
  repository = defaultRepository,
  updateOrderState = updateOrderAdminEmailState,
  now = () => new Date()
} = {}) {
  if (typeof repository.summarizeForOrderEvent !== 'function') return null;
  const summary = await repository.summarizeForOrderEvent(orderNumber, ADMIN_NEW_ORDER_EVENT);
  if (!summary.total) return summary;
  if (summary.complete && summary.sent > 0) {
    await updateOrderState(orderNumber, { status: 'sent', error: '', sentAt: now().toISOString() });
  } else if (summary.active > 0) {
    const lastError = summary.rows.find((row) => row.lastError)?.lastError || '';
    await updateOrderState(orderNumber, { status: 'pending', error: lastError });
  } else if (summary.failed > 0) {
    const lastError = summary.rows.find((row) => row.status === 'failed')?.lastError || 'Order email delivery failed.';
    await updateOrderState(orderNumber, { status: 'failed', error: lastError });
  } else if (summary.skipped === summary.total) {
    await updateOrderState(orderNumber, { status: 'skipped', error: summary.rows[0]?.lastError || '' });
  }
  return summary;
}

async function finalizeSuccessfulAdminEmail(event, order, response, {
  client,
  repository = defaultRepository,
  updateOrderState = updateOrderAdminEmailState,
  now = () => new Date(),
  logger = console
} = {}) {
  const sentAt = now().toISOString();
  await repository.markSent(client, event.id, response);
  if (event.eventName === ADMIN_NEW_ORDER_EVENT) {
    try {
      const summary = await aggregateNewOrderState(order.orderNumber, { repository, updateOrderState, now });
      if (!summary) await updateOrderState(order.orderNumber, { status: 'sent', error: '', sentAt }, { client });
    } catch (_error) {
      logger.error('Admin order email status update failed.', {
        orderNumber: order.orderNumber,
        eventName: event.eventName,
        stage: 'order_aggregate'
      });
    }
  }
  return { sentAt, outboxUpdated: true, orderUpdated: true };
}

function safeLog(logger, level, message, orderNumber, status, error, eventName = ADMIN_NEW_ORDER_EVENT) {
  const method = typeof logger?.[level] === 'function' ? logger[level].bind(logger) : () => {};
  method(message, {
    orderNumber,
    eventName,
    status,
    code: String(error?.code || 'email_delivery_failed').slice(0, 80)
  });
}

async function resendAdminNewOrderEmail(orderNumber, {
  config = env.notifications.adminOrderEmail,
  repository = defaultRepository,
  findOrder = findOrderByNumber,
  updateOrderState = updateOrderAdminEmailState,
  sendEmail = sendAdminNewOrderEmail,
  transactionFn = hasDatabaseUrl() ? transaction : async (callback) => callback(undefined),
  logger = console,
  now = () => new Date(),
  settings,
  getSettings
} = {}) {
  const normalizedOrderNumber = String(orderNumber || '').trim();
  const resolved = await resolveAdminOrderNotificationConfig({ config, settings, getSettings });
  if (!resolved.transportConfigured) {
    const error = new Error('Admin order email is not configured.');
    error.status = 503;
    error.code = 'smtp_not_configured';
    throw error;
  }

  const prepared = await transactionFn(async (client) => {
    const order = await findOrder(normalizedOrderNumber, {
      ...(client ? { client, forUpdate: true } : {}),
      includeRelated: false
    });
    if (!order) {
      const error = new Error('Order not found.');
      error.status = 404;
      error.code = 'order_not_found';
      throw error;
    }
    const event = await repository.claimFailedForManualResend(client, {
      orderNumber: normalizedOrderNumber,
      eventName: ADMIN_NEW_ORDER_EVENT,
      channel: 'email'
    });
    if (!event) {
      const existing = (await repository.listForOrder(normalizedOrderNumber))
        .filter((item) => item.eventName === ADMIN_NEW_ORDER_EVENT && item.channel === 'email');
      const state = existing.some((item) => item.status === 'sent') ? 'sent'
        : existing.some((item) => item.status === 'sending') ? 'sending'
          : existing.some((item) => ['pending', 'retrying'].includes(item.status)) ? 'pending'
            : 'not_failed';
      const error = new Error(state === 'sent'
        ? 'The admin order email was already sent.'
        : state === 'sending' ? 'The admin order email is already being sent.'
          : state === 'pending' ? 'The admin order email is already queued.'
            : 'There is no failed admin order email to resend.');
      error.status = 409;
      error.code = state === 'sent' ? 'admin_email_already_sent' : `admin_email_${state}`;
      throw error;
    }
    await updateOrderState(normalizedOrderNumber, { status: 'sending', error: '' }, { client });
    return { event, order };
  });

  let response;
  try {
    response = await sendEmail(prepared.order, {
      config: { ...resolved, recipient: prepared.event.recipient },
      event: prepared.event
    });
  } catch (error) {
    const safeError = safeAdminOrderEmailError(error);
    await repository.markFailed(undefined, prepared.event.id, safeError).catch(() => {});
    await aggregateNewOrderState(normalizedOrderNumber, { repository, updateOrderState, now }).catch(() => {});
    safeLog(logger, 'error', 'Admin order email resend failed.', normalizedOrderNumber, 'failed', error);
    const publicError = new Error('The order email could not be sent. Check the email configuration and try again.');
    publicError.status = 502;
    publicError.code = 'admin_email_send_failed';
    publicError.details = { adminEmailStatus: 'failed', adminEmailError: safeError };
    throw publicError;
  }

  await finalizeSuccessfulAdminEmail(prepared.event, prepared.order, response, {
    repository, updateOrderState, now, logger
  });
  safeLog(logger, 'info', 'Admin order email sent.', normalizedOrderNumber, 'sent');
  return {
    order: await findOrder(normalizedOrderNumber),
    notification: (await repository.listForOrder(normalizedOrderNumber))
      .find((item) => item.id === prepared.event.id)
  };
}

module.exports = {
  ADMIN_NEW_ORDER_EVENT,
  ADMIN_PAYMENT_CONFIRMED_EVENT,
  aggregateNewOrderState,
  enqueueAdminNewOrderEmail,
  enqueueAdminPaymentConfirmationEmail,
  finalizeSuccessfulAdminEmail,
  initialNotificationState,
  isEligibleForAdminOrderEmail,
  resendAdminNewOrderEmail,
  resolveAdminOrderNotificationConfig,
  safeAdminOrderEmailError,
  safeLog,
  validEmail
};
